const modulename = 'WebServer:SetupPost:Validate';
import path from 'node:path';
import slash from 'slash';
import { txEnv } from '@core/globalData';
import { validateFixServerConfig, findLikelyCFGPath } from '@lib/fxserver/fxsConfigHelper';
import { isValidServerDataPath, findPotentialServerDataPaths } from '@lib/fxserver/serverData';
import got from '@lib/got';
import consoleFactory from '@lib/console';
import recipeParser from '@core/deployer/recipeParser';
import { validateTargetPath } from '@core/deployer/utils';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import cleanFullPath from '@shared/cleanFullPath';
const console = consoleFactory(modulename);

/**
 * Handle Validation of a remote recipe/template URL
 */
export async function handleValidateRecipeURL(ctx: AuthedCtx) {
    if (typeof ctx.request.body.recipeURL !== 'string') {
        return ctx.utils.error(400, 'Invalid Request - missing parameters');
    }
    const recipeURL = ctx.request.body.recipeURL.trim();

    try {
        const recipeText = await got
            .get({
                url: recipeURL,
                timeout: { request: 4500 },
            })
            .text();
        if (typeof recipeText !== 'string') throw new Error('This URL did not return a string.');
        const recipe = recipeParser(recipeText);
        return ctx.send({ success: true, name: recipe.name });
    } catch (error) {
        return ctx.send({ success: false, message: `Recipe error: ${(error as Error).message}` });
    }
}

/**
 * Handle Validation of a local deploy path
 */
export async function handleValidateLocalDeployPath(ctx: AuthedCtx) {
    if (typeof ctx.request.body.deployPath !== 'string') {
        return ctx.utils.error(400, 'Invalid Request - missing parameters');
    }
    const deployPathResult = cleanFullPath(ctx.request.body.deployPath.trim(), txEnv.isWindows);
    if ('error' in deployPathResult) {
        return ctx.send({ success: false, message: `Invalid path: ${deployPathResult.error}` });
    }
    const deployPath = deployPathResult.path;

    try {
        await validateTargetPath(deployPath);
        return ctx.send({ success: true, message: 'Path is valid.' });
    } catch (error) {
        return ctx.send({ success: false, message: (error as Error).message });
    }
}

/**
 * Handle Validation of Local (existing) Server Data Folder
 *
 * NOTE: How forgiving are we:
 *   - Ignore trailing slashes, as well as fix backslashes
 *   - Check if its the parent folder
 *   - Check if its inside the parent folder
 *   - Check if its inside current folder
 *   - Check if it contains the string `/resources`, then if its the path up to that string
 *   - Detect config as `server.cfg` or with wrong extensions inside the Server Data Folder
 */
export async function handleValidateLocalDataFolder(ctx: AuthedCtx) {
    if (typeof ctx.request.body.dataFolder !== 'string') {
        return ctx.utils.error(400, 'Invalid Request - missing parameters');
    }
    const dataFolderResult = cleanFullPath(ctx.request.body.dataFolder.trim(), txEnv.isWindows);
    if ('error' in dataFolderResult) {
        return ctx.send({ success: false, message: `Invalid path: ${dataFolderResult.error}` });
    }
    const dataFolderPath = dataFolderResult.path;

    try {
        await isValidServerDataPath(dataFolderPath);
        return ctx.send({
            success: true,
            detectedConfig: findLikelyCFGPath(dataFolderPath),
        });
    } catch (error) {
        //Try to find a valid path nearby
        try {
            const potentialFix = await findPotentialServerDataPaths(dataFolderPath);
            if (potentialFix) {
                const message = `The path provided is invalid. <br>
                    But it looks like <code>${potentialFix}</code> is correct. <br>
                    Do you want to use it instead?`;
                return ctx.send({ success: false, message, suggestion: potentialFix });
            }
        } catch {
            /* couldn't resolve alternative path suggestion */
        }
        return ctx.send({ success: false, message: (error as Error).message });
    }
}

/**
 * Handle Validation of CFG File
 */
export async function handleValidateCFGFile(ctx: AuthedCtx) {
    if (typeof ctx.request.body.dataFolder !== 'string' || typeof ctx.request.body.cfgFile !== 'string') {
        return ctx.utils.error(400, 'Invalid Request - missing parameters');
    }

    const dataFolderResult = cleanFullPath(ctx.request.body.dataFolder.trim(), txEnv.isWindows);
    const dataFolderPath = 'path' in dataFolderResult ? dataFolderResult.path : ctx.request.body.dataFolder.trim();
    const cfgFilePathNormalized = slash(path.normalize(ctx.request.body.cfgFile.trim()));

    try {
        const result = await validateFixServerConfig(cfgFilePathNormalized, dataFolderPath);
        if (result.errors) {
            const message = `**The file path is correct, but there are error(s) in your config file(s):**\n${result.errors}`;
            return ctx.send({ success: false, markdown: true, message });
        } else {
            return ctx.send({ success: true });
        }
    } catch (error) {
        const message = `Error:\n ${(error as Error).message}.`;
        return ctx.send({ success: false, message });
    }
}
