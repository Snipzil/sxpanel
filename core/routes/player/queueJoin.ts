const modulename = 'WebServer:PlayerQueueJoin';
import { anyUndefined } from '@lib/misc';
import type { GenericApiErrorResp } from '@shared/genericApiTypes';
import consoleFactory from '@lib/console';
import type { InitializedCtx } from '@modules/WebServer/ctxTypes';
import { queueJoin } from '@modules/Queue/queueService';
const console = consoleFactory(modulename);

type Resp =
    | { status: 'allow'; id: string }
    | { status: 'wait'; id: string; position: number | null; size: number; pollAfterMs: number; adaptiveCard?: string }
    | { status: 'disabled' | 'bypass' }
    | GenericApiErrorResp;

export default async function PlayerQueueJoin(ctx: InitializedCtx) {
    const sendTypedResp = (data: Resp) => ctx.send(data);

    if (anyUndefined(ctx.request.body, ctx.request.body.playerName, ctx.request.body.playerIds)) {
        return sendTypedResp({ error: 'Invalid request.' });
    }

    try {
        const result = await queueJoin({
            playerName: ctx.request.body.playerName,
            playerIds: ctx.request.body.playerIds,
        });
        return sendTypedResp(result as any);
    } catch (error) {
        const msg = `Failed to join queue: ${error instanceof Error ? error.message : String(error)}`;
        console.error(msg);
        return sendTypedResp({ error: msg });
    }
}
