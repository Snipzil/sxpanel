const modulename = 'WebServer:AuthAddMasterPin';
import { InitializedCtx } from '@modules/WebServer/ctxTypes';
import consoleFactory from '@lib/console';
import { ApiOauthRedirectResp } from '@shared/authApiTypes';
import { addMasterPinBodySchema as bodySchema } from '@shared/authApiSchemas';
import { getOauthRedirectUrl } from './oauthMethods';
const console = consoleFactory(modulename);

/**
 * Handles the Add Master flow
 */
export default async function AuthAddMasterPin(ctx: InitializedCtx) {
    const body = ctx.getBody(bodySchema);
    if (!body) return;
    const { pin, origin } = body;

    //Check if there are already admins set up
    if (txCore.adminStore.hasAdmins()) {
        return ctx.send<ApiOauthRedirectResp>({
            error: `master_already_set`,
        });
    }

    //Checking the PIN (timing-safe; normalises case and separators)
    if (!pin.length || !txCore.adminStore.verifyMasterPin(pin)) {
        return ctx.send<ApiOauthRedirectResp>({
            error: `Wrong PIN.`,
        });
    }

    const callbackUrl = origin + '/addMaster/callback';
    const authUrl = getOauthRedirectUrl(ctx, callbackUrl);

    return ctx.send<ApiOauthRedirectResp>({
        authUrl,
    });
}
