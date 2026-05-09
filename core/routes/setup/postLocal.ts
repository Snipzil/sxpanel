const modulename = 'WebServer:SetupPost:Local';
import path from 'node:path';
import fsp from 'node:fs/promises';
import slash from 'slash';
import { txEnv } from '@core/globalData';
import consoleFactory from '@lib/console';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import cleanFullPath from '@shared/cleanFullPath';
const console = consoleFactory(modulename);

/**
 * Handle Save settings for local server data imports
 * Actions: sets serverDataPath/cfgPath, starts the server, redirect to live console
 */
export async function handleSaveLocal(ctx: AuthedCtx) {
    if (
        typeof ctx.request.body.name !== 'string' ||
        typeof ctx.request.body.dataFolder !== 'string' ||
        typeof ctx.request.body.cfgFile !== 'string'
    ) {
        return ctx.utils.error(400, 'Invalid Request - missing parameters');
    }

    //Prepare body input
    const dataFolderResult = cleanFullPath(ctx.request.body.dataFolder.trim(), txEnv.isWindows);
    if ('error' in dataFolderResult) {
        return ctx.send({ success: false, message: `Invalid data folder path: ${dataFolderResult.error}` });
    }
    const cfg = {
        name: ctx.request.body.name.trim(),
        dataFolder: dataFolderResult.path,
        cfgFile: slash(path.normalize(ctx.request.body.cfgFile)),
    };

    //Validating Server Data Path
    try {
        const stat = await fsp.stat(path.join(cfg.dataFolder, 'resources'));
        if (!stat.isDirectory()) {
            throw new Error('not a directory');
        }
    } catch (error) {
        let msg = (error as Error)?.message ?? 'unknown error';
        if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
            msg = 'The server data folder does not exist.';
        }
        return ctx.send({ success: false, message: `<strong>Server Data Folder error:</strong> ${msg}` });
    }

    //Preparing & saving config
    try {
        txCore.configStore.saveConfigs(
            {
                general: {
                    serverName: cfg.name,
                },
                server: {
                    dataPath: cfg.dataFolder,
                    cfgPath: cfg.cfgFile,
                },
            },
            ctx.admin.name,
        );
    } catch (error) {
        console.warn(`[${ctx.admin.name}] Error changing global/fxserver settings via setup stepper.`);
        console.verbose.dir(error);
        return ctx.send({
            type: 'danger',
            markdown: true,
            message: `**Error saving the configuration file:**\n${(error as Error).message}`,
        });
    }

    //Refreshing config
    txCore.cacheStore.set('deployer:recipe', 'none');

    //Logging
    ctx.admin.logAction('Changing global/fxserver settings via setup stepper.', 'setup.local.save');

    //If running (for some reason), kill it first
    if (!txCore.fxRunner.isIdle) {
        ctx.admin.logCommand('STOP SERVER', 'server.stop');
        await txCore.fxRunner.killServer('new server set up', ctx.admin.name, true);
    }

    //Starting server
    const spawnResult = await txCore.fxRunner.spawnServer(false);
    if (!spawnResult.success) {
        return ctx.send({ success: false, markdown: true, message: spawnResult.error });
    } else {
        return ctx.send({ success: true });
    }
}
