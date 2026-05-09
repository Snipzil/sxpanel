import type { AuthedCtx } from '@modules/WebServer/ctxTypes';

/**
 * Downloads the active server log file.
 */
export const downloadServerLog = async (ctx: AuthedCtx) => {
    if (!ctx.admin.hasPermission('txadmin.log.view')) {
        return ctx.send({ error: "You don't have permission to call this endpoint." });
    }

    try {
        ctx.attachment('server.log');
        ctx.body = txCore.logger.server.getLogFile('server.log');
    } catch (error) {
        return ctx.send({ error: emsg(error) || 'Failed to download server log.' });
    }
};

/**
 * Downloads the active system session log file.
 */
export const downloadSystemLog = async (ctx: AuthedCtx) => {
    if (!ctx.admin.hasPermission('txadmin.log.view')) {
        return ctx.send({ error: "You don't have permission to call this endpoint." });
    }

    const content = await txCore.logger.system.getSessionFileContent();
    if (content === false) {
        return ctx.send({ error: 'Failed to download system log.' });
    }

    ctx.attachment('system_session.jsonl');
    ctx.body = content;
};

/**
 * Downloads the active fxserver log file.
 */
export const downloadFxserverLog = async (ctx: AuthedCtx) => {
    if (!ctx.admin.hasPermission('txadmin.log.view')) {
        return ctx.send({ error: "You don't have permission to call this endpoint." });
    }

    try {
        ctx.attachment('fxserver.log');
        ctx.body = txCore.logger.fxserver.getLogFile('fxserver.log');
    } catch (error) {
        return ctx.send({ error: emsg(error) || 'Failed to download fxserver log.' });
    }
};
