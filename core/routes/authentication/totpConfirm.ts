/**
 * TOTP Confirm - Verify the user can generate codes, then enable 2FA.
 * Expects the TOTP code from the authenticator app.
 * On success, stores the secret + backup codes in admins.json.
 */
const modulename = 'WebServer:TotpConfirm';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import consoleFactory from '@lib/console';
import { verifyTotpCode, generateBackupCodes } from '@lib/totp';
import { ApiTotpConfirmResp } from '@shared/authApiTypes';
import { totpConfirmBodySchema as bodySchema } from '@shared/authApiSchemas';
const console = consoleFactory(modulename);

export default async function TotpConfirm(ctx: AuthedCtx) {
    const sendTypedResp = (data: ApiTotpConfirmResp) => ctx.send(data);

    const postBody = ctx.getBody(bodySchema);
    if (!postBody) return;

    try {
        // Get the pending secret from the session
        const sess = ctx.sessTools.get();
        const pendingSecret = sess?.tmpTotpSecret;
        if (!pendingSecret || typeof pendingSecret !== 'string') {
            return sendTypedResp({ error: 'No pending 2FA setup. Please start setup again.' });
        }

        // Verify the code
        if (!verifyTotpCode(pendingSecret, postBody.code)) {
            return sendTypedResp({ error: 'Invalid code. Please try again.' });
        }

        // Generate backup codes
        const { plaintext, hashed } = generateBackupCodes();

        // Save to admin store
        await txCore.adminStore.setAdminTotp(ctx.admin.name, pendingSecret, hashed);

        // Clear the pending secret from session
        ctx.sessTools.set({
            ...sess,
            tmpTotpSecret: undefined,
        });

        ctx.admin.logAction('Enabled 2FA (TOTP)', 'auth.2fa.enable');
        console.ok(`Admin ${ctx.admin.name} enabled 2FA`);

        return sendTypedResp({ success: true, backupCodes: plaintext });
    } catch (error) {
        console.warn(`Failed TOTP confirm for ${ctx.admin.name}: ${emsg(error)}`);
        return sendTypedResp({ error: 'Failed to enable 2FA.' });
    }
}
