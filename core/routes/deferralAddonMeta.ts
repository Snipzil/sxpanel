const modulename = 'WebServer:DeferralAddonMeta';
import type { AuthedCtx } from '@modules/WebServer/ctxTypes';

/**
 * GET deferral addon scenario + dynamic token metadata for Deferral Studio.
 */
export default async function deferralAddonMeta(ctx: AuthedCtx) {
    if (!ctx.admin.testPermission('settings.write', modulename)) {
        return ctx.send({ error: 'Insufficient permissions.' });
    }

    const addonManager = txCore.addonManager;
    if (!addonManager) {
        return ctx.send({
            scenarios: [],
            tokens: [],
            installedAddonIds: [],
        });
    }

    return ctx.send(addonManager.getDeferralAddonMeta());
}
