import type { AuthedCtx } from '@modules/WebServer/ctxTypes';
import { redactSystemLogEntriesIp } from '@modules/Logger/SystemLogger';

const SLICE_SIZE = 500;
const isDigit = /^\d{13}$/;

/**
 * Returns partial system log history for pagination
 */
export default async function SystemLogPartial(ctx: AuthedCtx) {
    if (!ctx.admin.hasPermission('txadmin.log.view')) {
        return ctx.send({ error: "You don't have permission to call this endpoint." });
    }
    const canViewIps = ctx.admin.hasPermission('txadmin.log.view_ips');

    const query = ctx.request.query as Record<string, string>;
    if (query.dir === 'older' && isDigit.test(query.ref)) {
        const log = txCore.logger.system.readPartialOlder(Number(query.ref), SLICE_SIZE);
        return ctx.send({
            boundry: log.length < SLICE_SIZE,
            log: canViewIps ? log : redactSystemLogEntriesIp(log),
        });
    } else if (query.dir === 'newer' && isDigit.test(query.ref)) {
        const log = txCore.logger.system.readPartialNewer(Number(query.ref), SLICE_SIZE);
        return ctx.send({
            boundry: log.length < SLICE_SIZE,
            log: canViewIps ? log : redactSystemLogEntriesIp(log),
        });
    } else {
        const log = txCore.logger.system.getRecentBuffer();
        return ctx.send({
            boundry: true,
            log: canViewIps ? log : redactSystemLogEntriesIp(log),
        });
    }
}
