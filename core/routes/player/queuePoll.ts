const modulename = 'WebServer:PlayerQueuePoll';
import { anyUndefined } from '@lib/misc';
import type { GenericApiErrorResp } from '@shared/genericApiTypes';
import consoleFactory from '@lib/console';
import type { InitializedCtx } from '@modules/WebServer/ctxTypes';
import { queuePoll } from '@modules/Queue/queueService';
const console = consoleFactory(modulename);

type Resp =
    | { status: 'allow' }
    | { status: 'wait'; position: number | null; size: number; pollAfterMs: number; adaptiveCard?: string }
    | { status: 'not_found' }
    | GenericApiErrorResp;

export default async function PlayerQueuePoll(ctx: InitializedCtx) {
    const sendTypedResp = (data: Resp) => ctx.send(data);

    if (anyUndefined(ctx.request.body, ctx.request.body.id)) {
        return sendTypedResp({ error: 'Invalid request.' });
    }

    try {
        const result = await queuePoll({ id: ctx.request.body.id });
        return sendTypedResp(result as any);
    } catch (error) {
        const msg = `Failed to poll queue: ${error instanceof Error ? error.message : String(error)}`;
        console.error(msg);
        return sendTypedResp({ error: msg });
    }
}
