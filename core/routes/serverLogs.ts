import type { AuthedCtx } from '@modules/WebServer/ctxTypes';

const SLICE_SIZE = 500;
const isDigit = /^\d{13}$/;

/**
 * Returns partial server log history for pagination.
 */
export const serverLogPartial = async (ctx: AuthedCtx) => {
    if (!ctx.admin.hasPermission('txadmin.log.view')) {
        return ctx.send({ error: "You don't have permission to call this endpoint." });
    }

    const query = ctx.request.query as Record<string, string>;
    if (query.dir === 'older' && isDigit.test(query.ref)) {
        const log = txCore.logger.server.readPartialOlder(Number(query.ref), SLICE_SIZE);
        return ctx.send({
            boundry: log.length < SLICE_SIZE,
            log,
        });
    } else if (query.dir === 'newer' && isDigit.test(query.ref)) {
        const log = txCore.logger.server.readPartialNewer(Number(query.ref), SLICE_SIZE);
        return ctx.send({
            boundry: log.length < SLICE_SIZE,
            log,
        });
    } else {
        return ctx.send({
            boundry: true,
            log: txCore.logger.server.getRecentBuffer(),
        });
    }
};

/**
 * Returns the list of available historical server log session files.
 */
export const serverLogSessions = async (ctx: AuthedCtx) => {
    if (!ctx.admin.hasPermission('txadmin.log.view')) {
        return ctx.send({ error: "You don't have permission to call this endpoint." });
    }

    try {
        const files = await txCore.logger.server.listSessionFiles();
        return ctx.send({ sessions: files });
    } catch (_error) {
        return ctx.send({ error: 'Failed to list session files.' });
    }
};

/**
 * Returns the events from a specific historical server log session file.
 */
export const serverLogSessionFile = async (ctx: AuthedCtx) => {
    if (!ctx.admin.hasPermission('txadmin.log.view')) {
        return ctx.send({ error: "You don't have permission to call this endpoint." });
    }

    const query = ctx.request.query as Record<string, string>;
    const fileName = query.file;
    if (typeof fileName !== 'string' || !fileName) {
        return ctx.send({ error: 'Missing or invalid file parameter.' });
    }

    try {
        const events = await txCore.logger.server.readSessionFile(fileName);
        return ctx.send({ events });
    } catch (error) {
        return ctx.send({ error: emsg(error) || 'Failed to read session file.' });
    }
};
