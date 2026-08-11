const modulename = 'WebServer:SelfUpdateApply';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import { ApiToastResp } from '@shared/genericApiTypes';

/**
 * Applies the downloaded sxPanel update (swap files + restart process).
 */
export default async function SelfUpdateApply(ctx: AuthedCtx) {
    if (!ctx.admin.testPermission('all_permissions', modulename)) {
        return ctx.send<ApiToastResp>({
            type: 'error',
            msg: 'Only admins with all permissions can manage sxPanel updates.',
        });
    }

    if (txCore.selfUpdater.status.phase !== 'extracted') {
        return ctx.send<ApiToastResp>({
            type: 'error',
            msg: 'No downloaded update ready to apply. Please download first.',
        });
    }

    //Start apply in background (will shut down the process)
    txCore.selfUpdater.apply().catch(() => {
        //Error is already stored in status
    });
    ctx.admin.logCommand('sxPanel update applied', 'selfUpdate.apply');

    return ctx.send<ApiToastResp>({
        type: 'warning',
        msg: 'Applying update... The panel will restart shortly.',
    });
}
