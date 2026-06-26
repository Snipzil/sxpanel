const modulename = 'WebServer:PlayerQueueLeave';
import { anyUndefined } from '@lib/misc';
import type { GenericApiErrorResp } from '@shared/genericApiTypes';
import consoleFactory from '@lib/console';
import type { InitializedCtx } from '@modules/WebServer/ctxTypes';
import { queueLeave } from '@modules/Queue/queueService';
const console = consoleFactory(modulename);

type Resp = { ok: boolean } | GenericApiErrorResp;

export default async function PlayerQueueLeave(ctx: InitializedCtx) {
    const sendTypedResp = (data: Resp) => ctx.send(data);

    if (anyUndefined(ctx.request.body, ctx.request.body.id)) {
        return sendTypedResp({ error: 'Invalid request.' });
    }

    try {
        const result = queueLeave({ id: ctx.request.body.id });
        return sendTypedResp(result);
    } catch (error) {
        const msg = `Failed to leave queue: ${error instanceof Error ? error.message : String(error)}`;
        console.error(msg);
        return sendTypedResp({ error: msg });
    }
}
