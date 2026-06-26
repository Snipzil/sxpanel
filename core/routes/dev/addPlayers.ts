const modulename = 'WebServer:DevDebug:addPlayers';
import type { InitializedCtx } from '@modules/WebServer/ctxTypes';
import type { ManualPlayerUpdateEntry } from '@modules/FxPlayerlist';
import consoleFactory from '@lib/console';
import { emsg } from '@shared/emsg';

const console = consoleFactory(modulename);

/**
 * CFXBOT-compatible push endpoint for synthetic player rosters.
 * Background_Service POSTs here on txAdminPort (default 40120); localhost only.
 */
export default async function addPlayers(ctx: InitializedCtx) {
    if (!ctx.txVars.isLocalRequest) {
        return ctx.send({ success: false, message: 'This endpoint is only accessible from localhost' });
    }

    try {
        const requestData = ctx.request.body as { players?: unknown } | undefined;
        let players: ManualPlayerUpdateEntry[];

        if (!requestData || (typeof requestData === 'object' && Object.keys(requestData).length === 0)) {
            players = [];
        } else if (requestData && typeof requestData === 'object' && 'players' in requestData) {
            if (!Array.isArray(requestData.players)) {
                console.error('addPlayers: players is not an array');
                return ctx.send({ success: false, message: 'Invalid request body: expected array of players' });
            }
            players = requestData.players as ManualPlayerUpdateEntry[];
        } else {
            console.error('addPlayers: invalid request body format');
            return ctx.send({ success: false, message: 'Invalid request body format' });
        }

        for (let i = 0; i < players.length; i++) {
            const player = players[i];
            if (
                typeof player.id !== 'number' ||
                typeof player.name !== 'string' ||
                typeof player.endpoint !== 'string' ||
                typeof player.ping !== 'number' ||
                !Array.isArray(player.identifiers)
            ) {
                console.error(`addPlayers: Invalid player data at index ${i}:`, JSON.stringify(player));
                return ctx.send({
                    success: false,
                    message: `Invalid player data format at index ${i}`,
                });
            }
            if (player.health !== undefined && (typeof player.health !== 'number' || !Number.isFinite(player.health))) {
                return ctx.send({
                    success: false,
                    message: `Invalid player data format at index ${i}`,
                });
            }
            if (player.x !== undefined && (typeof player.x !== 'number' || !Number.isFinite(player.x))) {
                return ctx.send({
                    success: false,
                    message: `Invalid player data format at index ${i}`,
                });
            }
            if (player.y !== undefined && (typeof player.y !== 'number' || !Number.isFinite(player.y))) {
                return ctx.send({
                    success: false,
                    message: `Invalid player data format at index ${i}`,
                });
            }
            if (
                player.vType !== undefined &&
                (typeof player.vType !== 'number' || !Number.isInteger(player.vType) || player.vType < 0 || player.vType > 8)
            ) {
                return ctx.send({
                    success: false,
                    message: `Invalid player data format at index ${i}`,
                });
            }
        }

        txCore.fxPlayerlist.handleManualPlayerUpdate(players);
        return ctx.send({ success: true });
    } catch (error) {
        console.error(`Error in addPlayers endpoint: ${emsg(error)}`);
        return ctx.send({ success: false, message: 'Internal server error' });
    }
}
