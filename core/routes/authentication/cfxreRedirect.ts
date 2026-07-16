const modulename = 'WebServer:AuthCfxreRedirect';
import { InitializedCtx } from '@modules/WebServer/ctxTypes';
import consoleFactory from '@lib/console';
import { ApiOauthRedirectResp } from '@shared/authApiTypes';
import { cfxreRedirectQuerySchema as querySchema } from '@shared/authApiSchemas';
import { getOauthRedirectUrl } from './oauthMethods';
const console = consoleFactory(modulename);

/**
 * Generates the CitizenFX (Cfx.re) OAuth auth URL and returns it to the client.
 */
export default async function AuthCfxreRedirect(ctx: InitializedCtx) {
    const query = ctx.getQuery(querySchema);
    if (!query) return;
    const { origin } = query;

    //Check if there are already admins set up
    if (!txCore.adminStore.hasAdmins()) {
        return ctx.send<ApiOauthRedirectResp>({
            error: 'no_admins_setup',
        });
    }

    const callbackUrl = origin + '/login/callback';
    const authUrl = getOauthRedirectUrl(ctx, callbackUrl);

    return ctx.send<ApiOauthRedirectResp>({
        authUrl,
    });
}
