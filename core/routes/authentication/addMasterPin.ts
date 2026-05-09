const modulename = 'WebServer:AuthAddMasterPin';
import { InitializedCtx } from '@modules/WebServer/ctxTypes';
import consoleFactory from '@lib/console';
import { ApiOauthRedirectResp } from '@shared/authApiTypes';
import { addMasterPinBodySchema as bodySchema } from '@shared/authApiSchemas';
import { randomUUID } from 'node:crypto';
import { generateKeyPair, getDiscourseAuthUrl } from '@modules/AdminStore/providers/DiscourseUser';
const console = consoleFactory(modulename);

/**
 * Handles the Add Master flow
 */
export default async function AuthAddMasterPin(ctx: InitializedCtx) {
    const body = ctx.getBody(bodySchema);
    if (!body) return;
    const { pin } = body;

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

    //Generate keypair and nonce
    const { publicKey, privateKey } = generateKeyPair();
    const nonce = randomUUID();
    const callbackUrl = `${ctx.origin}/addMaster/callback`;

    //Store in session for later decryption
    ctx.sessTools.set({
        tmpDiscourseNonce: nonce,
        tmpDiscoursePrivateKey: privateKey,
    });

    //Generate Discourse auth URL
    const authUrl = getDiscourseAuthUrl(publicKey, nonce, callbackUrl);

    return ctx.send<ApiOauthRedirectResp>({
        authUrl,
    });
}
