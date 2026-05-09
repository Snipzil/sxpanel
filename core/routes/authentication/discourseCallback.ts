const modulename = 'WebServer:AuthDiscourseCallback';
import consoleFactory from '@lib/console';
import { InitializedCtx } from '@modules/WebServer/ctxTypes';
import { CfxreSessAuthType, resolveEffectiveAuthedAdmin } from '@modules/WebServer/authLogic';
import { discourseCallbackBodySchema as bodySchema } from '@shared/authApiSchemas';
import { ApiOauthCallbackErrorResp, ApiOauthCallbackResp, ReactAuthDataType } from '@shared/authApiTypes';
import { decryptPayload, getDiscourseUserInfo } from '@modules/AdminStore/providers/DiscourseUser';
const console = consoleFactory(modulename);

/**
 * Handles the Discourse User API Key callback.
 * Decrypts the payload, fetches user info, and logs in the admin.
 */
export default async function AuthDiscourseCallback(ctx: InitializedCtx) {
    const schemaRes = bodySchema.safeParse(ctx.request.body);
    if (!schemaRes.success) {
        return ctx.send<ApiOauthCallbackResp>({
            errorTitle: 'Invalid request body',
            errorMessage: schemaRes.error.message,
        });
    }
    const { payload } = schemaRes.data;

    //Checking session for stored private key and nonce
    const inboundSession = ctx.sessTools.get();
    if (!inboundSession?.tmpDiscourseNonce || !inboundSession?.tmpDiscoursePrivateKey) {
        return ctx.send<ApiOauthCallbackErrorResp>({
            errorCode: 'invalid_session',
        });
    }

    //Decrypt the payload
    let apiKey: string;
    try {
        const decrypted = decryptPayload(payload, inboundSession.tmpDiscoursePrivateKey);
        if (decrypted.nonce !== inboundSession.tmpDiscourseNonce) {
            return ctx.send<ApiOauthCallbackErrorResp>({
                errorCode: 'invalid_state',
            });
        }
        apiKey = decrypted.key;
    } catch (error) {
        console.warn(`Payload decryption error: ${emsg(error)}`);
        return ctx.send<ApiOauthCallbackResp>({
            errorTitle: 'Payload decryption error:',
            errorMessage: emsg(error),
        });
    }

    //Fetch user info from Discourse
    let fivemIdentifier: string;
    let discourseName: string;
    try {
        const userInfo = await getDiscourseUserInfo(apiKey);
        fivemIdentifier = userInfo.identifier;
        discourseName = userInfo.username;
    } catch (error) {
        console.verbose.error(`Discourse user info error: ${emsg(error)}`);
        return ctx.send<ApiOauthCallbackResp>({
            errorTitle: 'Failed to get Discourse user info:',
            errorMessage: emsg(error),
        });
    }

    //Check & Login user
    try {
        const vaultAdmin = txCore.adminStore.getAdminByIdentifiers([fivemIdentifier]);
        if (!vaultAdmin) {
            ctx.sessTools.destroy();
            return ctx.send<ApiOauthCallbackResp>({
                errorCode: 'not_admin',
                errorContext: {
                    identifier: fivemIdentifier,
                    name: discourseName,
                    profile: `https://forum.cfx.re/u/${discourseName}`,
                },
            });
        }

        //Setting session - reuse CfxreSessAuthType since the identifier is the same format
        const sessData = {
            type: 'cfxre',
            username: vaultAdmin.name,
            csrfToken: txCore.adminStore.genCsrfToken(),
            expiresAt: Date.now() + 86_400_000, //24h
            identifier: fivemIdentifier,
        } satisfies CfxreSessAuthType;
        ctx.sessTools.set({ auth: sessData });

        const authedAdmin = await resolveEffectiveAuthedAdmin(vaultAdmin, sessData.csrfToken);
        txCore.logger.system.write(vaultAdmin.name, `logged in from ${ctx.ip} via discourse`, 'login', {
            actionId: 'login.discourse',
        });
        txManager.txRuntime.loginOrigins.count(ctx.txVars.hostType);
        txManager.txRuntime.loginMethods.count('discourse');
        return ctx.send<ReactAuthDataType>(authedAdmin.getAuthData());
    } catch (error) {
        ctx.sessTools.destroy();
        console.verbose.error(`Failed to login: ${emsg(error)}`);
        return ctx.send<ApiOauthCallbackResp>({
            errorTitle: 'Failed to login:',
            errorMessage: emsg(error),
        });
    }
}
