const modulename = 'WebServer:AuthChangePassword';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import consoleFactory from '@lib/console';
import { verifyAdminPassword } from '@lib/adminPassword';
import { validateAdminPassword } from '@shared/passwordPolicy';
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

    const policyResult = validateAdminPassword(newPassword);
    if (!policyResult.ok) {
        return ctx.send<GenericApiResp>({ error: policyResult.error });
    }

    if (ctx.admin.passwordRevision < 0) {
        return ctx.send<GenericApiResp>({ error: 'This action is not available for this account.' });
    }

    //Get vault admin
    const vaultAdmin = txCore.adminStore.getAdminByName(ctx.admin.name);
    if (!vaultAdmin) throw new Error('Wait, what? Where is that admin?');
    if (!ctx.admin.isTempPassword) {
        if (!oldPassword || !(await verifyAdminPassword(oldPassword, vaultAdmin.passwordHash))) {
            return ctx.send<GenericApiResp>({ error: 'Wrong current password.' });
        }
    }

    if (await verifyAdminPassword(newPassword, vaultAdmin.passwordHash)) {
        return ctx.send<GenericApiResp>({
            error: 'Your new password must be different from your current password.',
        });
    }

    //Edit admin and give output
    try {
        await txCore.adminStore.editAdmin(ctx.admin.name, newPassword);
        const freshAdmin = txCore.adminStore.getAdminByName(ctx.admin.name);
        if (!freshAdmin) throw new Error('Wait, what? Where is that admin?');

        //Update session revision if logged in via password
        const currSess = ctx.sessTools.get();
        if (currSess?.auth?.type === 'password') {
            ctx.sessTools.set({
                auth: {
                    ...currSess.auth,
                    password_revision: freshAdmin.passwordRevision,
                },
            });
        } else if (currSess?.auth?.type === 'pending_2fa') {
            ctx.sessTools.set({
                auth: {
                    ...currSess.auth,
                    password_revision: freshAdmin.passwordRevision,
                },
            });
        }

        ctx.admin.logAction('Changing own password.', 'auth.password.change');
        return ctx.send<GenericApiResp>({ success: true });
    } catch (error) {
        return ctx.send<GenericApiResp>({ error: emsg(error) });
    }
}
