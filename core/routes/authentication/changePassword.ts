const modulename = 'WebServer:AuthChangePassword';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import consoleFactory from '@lib/console';
import consts from '@shared/consts';
import { GenericApiResp } from '@shared/genericApiTypes';
import { changePasswordBodySchema as bodySchema } from '@shared/authApiSchemas';
const console = consoleFactory(modulename);

/**
 * Route to change your own password
 */
export default async function AuthChangePassword(ctx: AuthedCtx) {
    //Sanity check
    const body = ctx.getBody(bodySchema);
    if (!body) return;
    const { newPassword, oldPassword } = body;

    //Validate new password
    if (newPassword.trim() !== newPassword) {
        return ctx.send<GenericApiResp>({
            error: 'Your password either starts or ends with a space, which was likely an accident. Please remove it and try again.',
        });
    }
    if (newPassword.length < consts.adminPasswordMinLength || newPassword.length > consts.adminPasswordMaxLength) {
        return ctx.send<GenericApiResp>({ error: 'Invalid new password length.' });
    }

    //Get vault admin
    const vaultAdmin = txCore.adminStore.getAdminByName(ctx.admin.name);
    if (!vaultAdmin) throw new Error('Wait, what? Where is that admin?');
    if (!ctx.admin.isTempPassword) {
        if (!oldPassword || !VerifyPasswordHash(oldPassword, vaultAdmin.passwordHash)) {
            return ctx.send<GenericApiResp>({ error: 'Wrong current password.' });
        }
    }

    //Edit admin and give output
    try {
        const newHash = await txCore.adminStore.editAdmin(ctx.admin.name, newPassword);

        //Update session hash if logged in via password
        const currSess = ctx.sessTools.get();
        if (currSess?.auth?.type === 'password') {
            ctx.sessTools.set({
                auth: {
                    ...currSess.auth,
                    password_hash: newHash,
                },
            });
        }

        ctx.admin.logAction('Changing own password.', 'auth.password.change');
        return ctx.send<GenericApiResp>({ success: true });
    } catch (error) {
        return ctx.send<GenericApiResp>({ error: emsg(error) });
    }
}
