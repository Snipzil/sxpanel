const modulename = 'WebServer:DiscordGuildRoles';
import consoleFactory from '@lib/console';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import type { DiscordGuildRolesResp } from '@shared/discordGuildRoles';
import type { GenericApiErrorResp } from '@shared/genericApiTypes';

const console = consoleFactory(modulename);

/**
 * Returns Discord guild roles for settings role pickers.
 */
export default async function DiscordGuildRoles(ctx: AuthedCtx) {
    const sendTypedResp = (data: DiscordGuildRolesResp | GenericApiErrorResp) => ctx.send(data);

    if (!ctx.admin.testPermission('settings.view', modulename)) {
        return sendTypedResp({
            errorCode: 'settings.no_permission_view',
            error: 'You do not have permission to view the settings.',
        });
    }

    if (!txConfig.discordBot.enabled) {
        return ctx.utils.error(503, 'Discord bot is not enabled.');
    }

    try {
        const forceRefresh = ctx.query?.refresh === 'true';
        const { roles } = await txCore.discordBot.listGuildRoles({ forceRefresh });
        return sendTypedResp({ roles });
    } catch (error) {
        console.verbose.warn(`Failed to list guild roles: ${error instanceof Error ? error.message : String(error)}`);
        return ctx.utils.error(503, 'Discord bot is not ready or guild roles could not be fetched.');
    }
}
