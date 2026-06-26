const modulename = 'WebServer:WhitelistPage';
import consoleFactory from '@lib/console';
import { getActiveWorkflow } from '@modules/Whitelist/WhitelistService';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
const console = consoleFactory(modulename);

/**
 * Returns the output page containing the action log, and the console log
 */
export default async function WhitelistPage(ctx: AuthedCtx) {
    const respData = {
        headerTitle: 'Whitelist',
        hasWhitelistPermission: ctx.admin.hasPermission('players.whitelist'),
        currentWhitelistMode: txConfig.whitelist.enabled ? (getActiveWorkflow()?.type ?? 'disabled') : 'disabled',
    };
    return ctx.utils.render('main/whitelist', respData);
}
