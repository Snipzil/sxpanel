import type { AuthedCtx } from '@modules/WebServer/ctxTypes';
import { redactSystemLogEntriesIp } from '@modules/Logger/SystemLogger';

/**
 * Returns the list of available historical system log session files.
 */
export const systemLogSessions = async (ctx: AuthedCtx) => {
    if (!ctx.admin.hasPermission('txadmin.log.view')) {
        return ctx.send({ error: "You don't have permission to call this endpoint." });
    }

    try {
        const files = await txCore.logger.system.listSessionFiles();
        return ctx.send({ sessions: files });
    } catch (error) {
        return ctx.send({ error: 'Failed to list session files.' });
    }
};

/**
 * Returns the events from a specific historical system log session file.
 */
export const systemLogSessionFile = async (ctx: AuthedCtx) => {
    if (!ctx.admin.hasPermission('txadmin.log.view')) {
        return ctx.send({ error: "You don't have permission to call this endpoint." });
    }

    const query = ctx.request.query as Record<string, string>;
    const fileName = query.file;
    if (typeof fileName !== 'string' || !fileName) {
        return ctx.send({ error: 'Missing or invalid file parameter.' });
    }

    try {
        const events = await txCore.logger.system.readSessionFile(fileName);
        const canViewIps = ctx.admin.hasPermission('txadmin.log.view_ips');
        return ctx.send({ events: canViewIps ? events : redactSystemLogEntriesIp(events) });
    } catch (error) {
        return ctx.send({ error: emsg(error) || 'Failed to read session file.' });
    }
};
