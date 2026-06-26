const modulename = 'WebServer:WhitelistAnalytics';
import type { ApiWhitelistAnalyticsResp } from '@shared/whitelistApiTypes';
import { buildWhitelistAnalyticsSummary } from '@modules/Whitelist/analytics';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';

export default async function WhitelistAnalytics(ctx: AuthedCtx) {
    const sendTypedResp = (data: ApiWhitelistAnalyticsResp) => ctx.send(data);

    if (!ctx.admin.testPermission('players.whitelist', modulename)) {
        return sendTypedResp({ error: "You don't have permission to view whitelist analytics." });
    }

    const daysParam = ctx.request.query?.days;
    let days = 30;
    if (typeof daysParam === 'string' && /^\d+$/.test(daysParam)) {
        days = Math.min(90, Math.max(1, parseInt(daysParam, 10)));
    }

    return sendTypedResp(buildWhitelistAnalyticsSummary(days));
}
