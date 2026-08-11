const modulename = 'WebServer:SelfUpdateDownload';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import { ApiToastResp } from '@shared/genericApiTypes';

/**
 * Triggers a download of the latest sxPanel release (monitor.zip), verifies its checksum,
 * and extracts it to a staging directory.
 */
export default async function SelfUpdateDownload(ctx: AuthedCtx) {
    if (!ctx.admin.testPermission('all_permissions', modulename)) {
        return ctx.send<ApiToastResp>({
            type: 'error',
            msg: 'Only admins with all permissions can manage sxPanel updates.',
        });
    }

    //Start download in background (non-blocking)
    txCore.selfUpdater.download().catch(() => {
        //Error is already stored in status
    });
    ctx.admin.logCommand('sxPanel update download started', 'selfUpdate.download');

    return ctx.send<ApiToastResp>({
        type: 'success',
        msg: 'Downloading sxPanel update...',
    });
}
