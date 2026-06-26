const modulename = 'WebServer:WhitelistConfig';
import type { ApiWhitelistConfigResp } from '@shared/whitelistApiTypes';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';

export default async function WhitelistConfig(ctx: AuthedCtx) {
    const sendTypedResp = (data: ApiWhitelistConfigResp) => ctx.send(data);

    if (!ctx.admin.testPermission('players.whitelist', modulename)) {
        return sendTypedResp({ error: "You don't have permission to view whitelist config." });
    }

    return sendTypedResp({
        enabled: txConfig.whitelist.enabled,
        workflows: txConfig.whitelist.workflows,
        activeWorkflowId: txConfig.whitelist.activeWorkflowId,
        forms: txConfig.whitelist.forms,
    });
}
