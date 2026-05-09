const modulename = 'WebServer:PlayerScreenshot';
import { randomUUID } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import playerResolver from '@lib/player/playerResolver';
import { GenericApiResp } from '@shared/genericApiTypes';
import { ServerPlayer } from '@lib/player/playerClasses';
import { anyUndefined } from '@lib/misc';
import consoleFactory from '@lib/console';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import { SYM_CURRENT_MUTEX } from '@lib/symbols';
import { txEnv } from '@core/globalData';
const console = consoleFactory(modulename);

// Pending screenshot requests (requestId → { resolve, timer })
type PendingScreenshot = {
    resolve: (data: { fileName?: string; error?: string }) => void;
    timer: ReturnType<typeof setTimeout>;
};
const pendingScreenshots = new Map<string, PendingScreenshot>();
const SCREENSHOT_TIMEOUT_MS = 15_000;

/**
 * POST /player/screenshot — request a screenshot of the target player's screen
 */
export default async function PlayerScreenshot(ctx: AuthedCtx) {
    if (anyUndefined(ctx.query)) {
        return ctx.utils.error(400, 'Invalid Request');
    }
    const { mutex, netid, license } = ctx.query;
    const sendTypedResp = (data: GenericApiResp | { imageData: string }) => ctx.send(data);

    // Check permission
    if (!ctx.admin.testPermission('players.spectate', modulename)) {
        return sendTypedResp({ error: "You don't have permission to execute this action." });
    }

    // Validate server is running
    if (!txCore.fxRunner.child?.isAlive) {
        return sendTypedResp({ error: 'The server is not running.' });
    }

    // Find player
    let player;
    try {
        const refMutex = mutex === 'current' ? SYM_CURRENT_MUTEX : mutex;
        player = playerResolver(refMutex, parseInt(netid as string), license);
    } catch (error) {
        return sendTypedResp({ error: emsg(error) });
    }

    if (!(player instanceof ServerPlayer) || !player.isConnected) {
        return sendTypedResp({ error: 'This player is not connected to the server.' });
    }

    // Create pending request
    const requestId = randomUUID();
    const resultPromise = new Promise<{ fileName?: string; error?: string }>((resolve) => {
        const timer = setTimeout(() => {
            pendingScreenshots.delete(requestId);
            resolve({ error: 'Screenshot request timed out.' });
        }, SCREENSHOT_TIMEOUT_MS);

        pendingScreenshots.set(requestId, { resolve, timer });
    });

    // Send event to FXServer
    txCore.fxRunner.sendEvent('webScreenshotPlayer', {
        target: player.netid,
        requestId,
    });

    ctx.admin.logAction(`Screenshotted "${player.displayName}" from web panel.`, 'player.screenshot');

    // Wait for the result
    const result = await resultPromise;
    if (result.error) {
        return sendTypedResp({ error: result.error });
    }

    if (!result.fileName) {
        return sendTypedResp({ error: 'No screenshot data received.' });
    }

    const filePath = path.join(txEnv.txaPath, result.fileName);
    try {
        const imageData = await readFile(filePath, 'utf8');
        unlink(filePath).catch(() => {});
        return sendTypedResp({ imageData });
    } catch (_error) {
        return sendTypedResp({ error: 'Failed to read screenshot file.' });
    }
}

/**
 * Called by the intercom handler when the screenshot result arrives from the Lua server
 */
export const resolveScreenshot = (requestId: string, fileName?: string, error?: string) => {
    const pending = pendingScreenshots.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingScreenshots.delete(requestId);
    if (error) {
        pending.resolve({ error });
    } else {
        pending.resolve({ fileName });
    }
};
