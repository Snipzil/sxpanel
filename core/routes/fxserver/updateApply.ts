const modulename = 'WebServer:FxUpdateApply';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import consoleFactory from '@lib/console';
import { ApiToastResp } from '@shared/genericApiTypes';
const console = consoleFactory(modulename);

/**
 * Applies the downloaded FXServer update (swap files + restart process).
 */
export default async function FxUpdateApply(ctx: AuthedCtx) {
    if (!ctx.admin.testPermission('all_permissions', modulename)) {
        return ctx.send<ApiToastResp>({
            type: 'error',
            msg: 'Only admins with all permissions can manage updates.',
        });
    }

    if (txCore.fxUpdater.status.phase !== 'extracted') {
        return ctx.send<ApiToastResp>({
            type: 'error',
            msg: 'No downloaded update ready to apply. Please download first.',
        });
    }

    //Start apply in background (will shut down the process)
    txCore.fxUpdater.apply().catch(() => {
        //Error is already stored in status
    });
    ctx.admin.logCommand('FXServer artifact update applied', 'artifact.apply');

    return ctx.send<ApiToastResp>({
        type: 'warning',
        msg: 'Applying update... The server will restart shortly.',
    });
}
