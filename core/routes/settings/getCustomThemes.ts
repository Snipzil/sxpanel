const modulename = 'WebServer:GetCustomThemes';
import consoleFactory from '@lib/console';
import { CustomThemeDataType } from '@modules/ConfigStore/schema/appearance';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import { GenericApiErrorResp } from '@shared/genericApiTypes';
const console = consoleFactory(modulename);

//Response type
export type GetCustomThemesSuccessResp = CustomThemeDataType[];

/**
 * Retrieves the custom themes from the config file
 */
export default async function GetCustomThemes(ctx: AuthedCtx) {
    const sendTypedResp = (data: GetCustomThemesSuccessResp | GenericApiErrorResp) => ctx.send(data);
    return sendTypedResp(txConfig.appearance.customThemes);
}
