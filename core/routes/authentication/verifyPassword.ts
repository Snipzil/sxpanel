const modulename = 'WebServer:AuthVerifyPassword';
import { PassSessAuthType, Pending2faSessAuthType, resolveEffectiveAuthedAdmin } from '@modules/WebServer/authLogic';
import { InitializedCtx } from '@modules/WebServer/ctxTypes';
import { txEnv } from '@core/globalData';
import consoleFactory from '@lib/console';
import { ApiVerifyPasswordResp, ReactAuthDataType } from '@shared/authApiTypes';
import { verifyPasswordBodySchema as bodySchema } from '@shared/authApiSchemas';
const console = consoleFactory(modulename);

/**
 * Verify login
 */
export default async function AuthVerifyPassword(ctx: InitializedCtx) {
    //Check UI version
    const { uiVersion } = ctx.request.query;
    if (uiVersion && uiVersion !== txEnv.txaVersion) {
        return ctx.send<ApiVerifyPasswordResp>({
            error: `refreshToUpdate`,
        });
    }

    //Checking body
    const postBody = ctx.getBody(bodySchema);
    if (!postBody) return;

    //Check if there are already admins set up
    if (!txCore.adminStore.hasAdmins()) {
        return ctx.send<ApiVerifyPasswordResp>({
            error: `no_admins_setup`,
        });
    }

    try {
        //Checking admin
        const vaultAdmin = txCore.adminStore.getAdminByName(postBody.username);
        if (!vaultAdmin) {
            console.warn(`Wrong username from: ${ctx.ip}`);
            return ctx.send<ApiVerifyPasswordResp>({
                error: 'Wrong username or password!',
            });
        }
        if (!VerifyPasswordHash(postBody.password, vaultAdmin.passwordHash)) {
            console.warn(`Wrong password from: ${ctx.ip}`);
            return ctx.send<ApiVerifyPasswordResp>({
                error: 'Wrong username or password!',
            });
        }

        // 2FA check: if admin has TOTP enabled, set pending session and require code
        if (vaultAdmin.totpEnabled) {
            const pendingSess = {
                type: 'pending_2fa',
                username: vaultAdmin.name,
                password_hash: vaultAdmin.passwordHash,
            } satisfies Pending2faSessAuthType;
            ctx.sessTools.regenerate({ auth: pendingSess });
            return ctx.send<ApiVerifyPasswordResp>({ totp_required: true });
        }

        //Setting up session — regenerate id to prevent session-fixation
        const sessData = {
            type: 'password',
            username: vaultAdmin.name,
            password_hash: vaultAdmin.passwordHash,
            expiresAt: false,
            csrfToken: txCore.adminStore.genCsrfToken(),
        } satisfies PassSessAuthType;
        ctx.sessTools.regenerate({ auth: sessData });

        txCore.logger.system.write(vaultAdmin.name, `logged in from ${ctx.ip} via password`, 'login', {
            actionId: 'login.password',
        });
        txManager.txRuntime.loginOrigins.count(ctx.txVars.hostType);
        txManager.txRuntime.loginMethods.count('password');

        const authedAdmin = await resolveEffectiveAuthedAdmin(vaultAdmin, sessData.csrfToken);
        return ctx.send<ReactAuthDataType>(authedAdmin.getAuthData());
    } catch (error) {
        console.warn(`Failed to authenticate ${postBody.username} with error: ${emsg(error)}`);
        console.verbose.dir(error);
        return ctx.send<ApiVerifyPasswordResp>({
            error: 'Error autenticating admin.',
        });
    }
}
