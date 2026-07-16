const modulename = 'WebServer:AuthCfxreCallback';
import consoleFactory from '@lib/console';
import { InitializedCtx } from '@modules/WebServer/ctxTypes';
import { CfxreSessAuthType, resolveEffectiveAuthedAdmin } from '@modules/WebServer/authLogic';
import { cfxreCallbackBodySchema as bodySchema } from '@shared/authApiSchemas';
import { ApiOauthCallbackErrorResp, ApiOauthCallbackResp, ReactAuthDataType } from '@shared/authApiTypes';
import { getIdFromOauthNameid } from '@lib/player/idUtils';
import { handleOauthCallback } from './oauthMethods';
const console = consoleFactory(modulename);

/**
 * Handles the CitizenFX (Cfx.re) OAuth callback.
 * Exchanges the code, fetches user info, and logs in the admin.
 */
export default async function AuthCfxreCallback(ctx: InitializedCtx) {
    const schemaRes = bodySchema.safeParse(ctx.request.body);
    if (!schemaRes.success) {
        return ctx.send<ApiOauthCallbackResp>({
            errorTitle: 'Invalid request body',
            errorMessage: schemaRes.error.message,
        });
    }
    const { redirectUri } = schemaRes.data;

    //Handling the callback
    const callbackResp = await handleOauthCallback(ctx, redirectUri);
    if ('errorCode' in callbackResp || 'errorTitle' in callbackResp) {
        return ctx.send<ApiOauthCallbackErrorResp>(callbackResp);
    }
    const userInfo = callbackResp;

    //Getting identifier
    const fivemIdentifier = getIdFromOauthNameid(userInfo.nameid);
    if (!fivemIdentifier) {
        return ctx.send<ApiOauthCallbackResp>({
            errorTitle: 'Invalid nameid identifier.',
            errorMessage: `Could not extract the user identifier from the URL below. Please report this to the sxPanel dev team.\n${userInfo.nameid}`,
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
                    name: userInfo.name,
                    profile: userInfo.profile,
                },
            });
        }

        //Setting session
        const sessData = {
            type: 'cfxre',
            username: vaultAdmin.name,
            csrfToken: txCore.adminStore.genCsrfToken(),
            expiresAt: Date.now() + 86_400_000, //24h
            identifier: fivemIdentifier,
        } satisfies CfxreSessAuthType;
        ctx.sessTools.set({ auth: sessData });

        //Cache the profile picture, if any, for AuthedAdmin.profilePicture
        if (userInfo.picture) {
            txCore.cacheStore.set(`admin:picture:${vaultAdmin.name}`, userInfo.picture);
        }

        const authedAdmin = await resolveEffectiveAuthedAdmin(vaultAdmin, sessData.csrfToken);
        txCore.logger.system.write(vaultAdmin.name, `logged in from ${ctx.ip} via cfxre`, 'login', {
            actionId: 'login.cfxre',
        });
        txManager.txRuntime.loginOrigins.count(ctx.txVars.hostType);
        txManager.txRuntime.loginMethods.count('citizenfx');
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
