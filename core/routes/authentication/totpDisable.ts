/**
 * TOTP Disable - Disable 2FA for an authenticated admin.
 * Requires current password and a valid TOTP code as confirmation.
 */
const modulename = 'WebServer:TotpDisable';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import consoleFactory from '@lib/console';
import { verifyTotpCode } from '@lib/totp';
import { ApiTotpDisableResp } from '@shared/authApiTypes';
import { totpDisableBodySchema as bodySchema } from '@shared/authApiSchemas';
const console = consoleFactory(modulename);

export default async function TotpDisable(ctx: AuthedCtx) {
    const sendTypedResp = (data: ApiTotpDisableResp) => ctx.send(data);

    const postBody = ctx.getBody(bodySchema);
    if (!postBody) return;

    try {
        const adminName = ctx.admin.name;

        // Get raw admin data
        const rawAdmin = txCore.adminStore.getRawAdminByName(adminName);
        if (!rawAdmin?.totp_secret) {
            return sendTypedResp({ error: '2FA is not enabled for this account.' });
        }

        // Verify current password
        const passwordValid = VerifyPasswordHash(postBody.password, rawAdmin.password_hash);
        if (!passwordValid) {
            return sendTypedResp({ error: 'Invalid password.' });
        }

        // Verify TOTP code
        const codeValid = verifyTotpCode(rawAdmin.totp_secret, postBody.code);
        if (!codeValid) {
            return sendTypedResp({ error: 'Invalid 2FA code.' });
        }

        // Clear TOTP data
        await txCore.adminStore.clearAdminTotp(adminName);

        txCore.logger.system.write(adminName, 'disabled 2FA', 'config', { actionId: 'auth.2fa.disable' });
        console.ok(`Admin ${adminName} disabled 2FA`);

        return sendTypedResp({ success: true });
    } catch (error) {
        console.warn(`Failed to disable TOTP: ${emsg(error)}`);
        return sendTypedResp({ error: 'Failed to disable 2FA.' });
    }
}
