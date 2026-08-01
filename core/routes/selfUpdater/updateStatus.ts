const modulename = 'WebServer:SelfUpdateStatus';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import { txEnv } from '@core/globalData';
import type { PanelUpdateListResp } from '@shared/otherTypes';

/**
 * Checks for the latest sxPanel release and returns it alongside the current updater status.
 */
export default async function SelfUpdateStatus(ctx: AuthedCtx) {
    if (!ctx.admin.testPermission('all_permissions', modulename)) {
        return ctx.utils.error(403, 'Only admins with all permissions can manage sxPanel updates.');
    }

    const latestRelease = await txCore.selfUpdater.checkForUpdate();

    const resp: PanelUpdateListResp = {
        currentVersion: txEnv.txaVersion,
        latestRelease,
        updateStatus: txCore.selfUpdater.status,
    };
    return ctx.send(resp);
}
