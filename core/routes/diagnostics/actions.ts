const modulename = 'WebServer:DiscordBotDiagnosticsActions';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';

export default async function DiagnosticsActions(ctx: AuthedCtx) {
    if (!ctx.admin.testPermission('all_permissions', modulename)) {
        return ctx.send({ error: 'Insufficient permissions.' });
    }

    const action = typeof ctx.params.action === 'string' ? ctx.params.action.trim() : '';
    if (!action.length) {
        return ctx.send({ error: 'Invalid action.' });
    }

    try {
        let message: string;
        switch (action) {
            case 'restart': {
                message = await txCore.discordBot.restartRuntime();
                break;
            }
            case 'reload-addons': {
                message = await txCore.discordBot.reloadRuntimeAddons();
                break;
            }
            case 'resync': {
                message = await txCore.discordBot.resyncRuntime();
                break;
            }
            default: {
                return ctx.send({ error: 'Invalid action.' });
            }
        }

        return ctx.send({
            success: true,
            message,
            diagnostics: txCore.discordBot.getDiagnostics(),
        });
    } catch (error) {
        return ctx.send({
            success: false,
            error: error instanceof Error ? error.message : String(error),
            diagnostics: txCore.discordBot.getDiagnostics(),
        });
    }
}