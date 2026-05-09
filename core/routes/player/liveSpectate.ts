const modulename = 'WebServer:LiveSpectate';
import { randomUUID } from 'node:crypto';
import playerResolver from '@lib/player/playerResolver';
import { ServerPlayer } from '@lib/player/playerClasses';
import { anyUndefined } from '@lib/misc';
import consoleFactory from '@lib/console';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import { SYM_CURRENT_MUTEX } from '@lib/symbols';
const console = consoleFactory(modulename);

//Session tracking
type SpectateSession = {
    targetNetId: number;
    adminName: string;
    startedAt: number;
};
const activeSessions = new Map<string, SpectateSession>();
const sessionsByTarget = new Map<number, Set<string>>();

/**
 * POST /player/liveSpectate/start — begin live spectate of a target player
 */
export async function LiveSpectateStart(ctx: AuthedCtx) {
    if (anyUndefined(ctx.query)) {
        return ctx.utils.error(400, 'Invalid Request');
    }
    const { mutex, netid, license } = ctx.query;
    const sendResp = (data: { sessionId: string } | { error: string }) => ctx.send(data);

    if (!ctx.admin.testPermission('players.spectate', modulename)) {
        return sendResp({ error: "You don't have permission to execute this action." });
    }

    if (!txCore.fxRunner.child?.isAlive) {
        return sendResp({ error: 'The server is not running.' });
    }

    let player;
    try {
        const refMutex = mutex === 'current' ? SYM_CURRENT_MUTEX : mutex;
        player = playerResolver(refMutex, parseInt(netid as string), license);
    } catch (error) {
        return sendResp({ error: emsg(error) });
    }

    if (!(player instanceof ServerPlayer) || !player.isConnected) {
        return sendResp({ error: 'This player is not connected to the server.' });
    }

    const sessionId = randomUUID();
    activeSessions.set(sessionId, {
        targetNetId: player.netid,
        adminName: ctx.admin.name,
        startedAt: Date.now(),
    });

    if (!sessionsByTarget.has(player.netid)) {
        sessionsByTarget.set(player.netid, new Set());
    }
    sessionsByTarget.get(player.netid)!.add(sessionId);

    txCore.fxRunner.sendEvent('webLiveSpectateStart', {
        target: player.netid,
        sessionId,
    });

    ctx.admin.logAction(`Started live spectate of "${player.displayName}" from web panel.`, 'player.live_spectate.start');
    console.verbose.log(
        `Admin "${ctx.admin.name}" started live spectate, player #${player.netid}, session ${sessionId}`,
    );

    return sendResp({ sessionId });
}

/**
 * POST /player/liveSpectate/stop — stop a live spectate session
 */
export async function LiveSpectateStop(ctx: AuthedCtx) {
    const { sessionId } = ctx.request.body as { sessionId?: string };
    const sendResp = (data: { success: true } | { error: string }) => ctx.send(data);

    if (typeof sessionId !== 'string') {
        return sendResp({ error: 'Invalid session ID.' });
    }

    if (!ctx.admin.testPermission('players.spectate', modulename)) {
        return sendResp({ error: "You don't have permission to execute this action." });
    }

    const session = activeSessions.get(sessionId);
    if (!session) {
        return sendResp({ error: 'Session not found or already stopped.' });
    }

    cleanupSession(sessionId);
    return sendResp({ success: true });
}

/**
 * Called by the intercom handler when a spectate frame arrives from the resource.
 */
export function handleSpectateFrame(sessionId: string, frameData: string) {
    const session = activeSessions.get(sessionId);
    if (!session) {
        console.warn(
            `[spectate] Frame for UNKNOWN session: ${sessionId} (activeSessions: ${[...activeSessions.keys()].join(', ')})`,
        );
        return;
    }
    console.warn(
        `[spectate] Emitting frame: session=${sessionId}, admin=${session.adminName}, len=${frameData.length}`,
    );
    txCore.webServer.webSocket.emitSpectateFrame(sessionId, frameData);
}

/**
 * Remove a session and stop capture if no watchers remain for that target.
 */
function cleanupSession(sessionId: string) {
    const session = activeSessions.get(sessionId);
    if (!session) return;

    activeSessions.delete(sessionId);

    const targetSessions = sessionsByTarget.get(session.targetNetId);
    if (targetSessions) {
        targetSessions.delete(sessionId);
        if (targetSessions.size === 0) {
            sessionsByTarget.delete(session.targetNetId);
            // No more watchers — tell the resource to stop capture
            txCore.fxRunner.sendEvent('webLiveSpectateStop', {
                target: session.targetNetId,
                sessionId,
            });
        }
    }

    console.verbose.log(`Stopped live spectate session ${sessionId} (admin: ${session.adminName})`);
}
