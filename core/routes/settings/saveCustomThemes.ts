const modulename = 'WebServer:SaveCustomThemes';
import consoleFactory from '@lib/console';
import { CustomThemeDataType } from '@modules/ConfigStore/schema/appearance';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import { GenericApiOkResp } from '@shared/genericApiTypes';
import { z } from 'zod';
const console = consoleFactory(modulename);

//Req validation & types
const bodySchema = z.any().array();
export type SaveCustomThemesReq = CustomThemeDataType[];
export type SaveCustomThemesResp = GenericApiOkResp;

/**
 * Saves the custom themes to the config file
 */
export default async function SaveCustomThemes(ctx: AuthedCtx) {
    const sendTypedResp = (data: SaveCustomThemesResp) => ctx.send(data);

    //Check permissions
    if (!ctx.admin.testPermission('settings.write', modulename)) {
        return sendTypedResp({
            error: 'You do not have permission to change the settings.',
        });
    }

    //Validating input
    const customThemes = ctx.getBody(bodySchema);
    if (!customThemes) return;

    //Preparing & saving config
    try {
        txCore.configStore.saveConfigs(
            {
                appearance: { customThemes },
            },
            ctx.admin.name,
        );
    } catch (error) {
        console.warn(`[${ctx.admin.name}] Error changing customThemes settings.`);
        console.verbose.dir(error);
        return sendTypedResp({
            error: `Error saving the configuration file: ${emsg(error)}`,
        });
    }

    //Sending output
    return sendTypedResp({ success: true });
}
