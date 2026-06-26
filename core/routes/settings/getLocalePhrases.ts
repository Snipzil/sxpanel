const modulename = 'WebServer:GetLocalePhrases';
import consoleFactory from '@lib/console';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import { GenericApiErrorResp } from '@shared/genericApiTypes';
import type { LocaleType } from '@shared/localeMap';
const console = consoleFactory(modulename);

export type GetLocalePhrasesResp = {
    phrases: LocaleType;
};

/**
 * Returns locale phrases for the panel UI (built-in or custom file).
 */
export default async function GetLocalePhrases(ctx: AuthedCtx) {
    const sendTypedResp = (data: GetLocalePhrasesResp | GenericApiErrorResp) => ctx.send(data);

    try {
        const lang = txConfig.general.language ?? 'en';
        const phrases = txCore.translator.getLanguagePhrases(lang) as LocaleType;
        return sendTypedResp({ phrases });
    } catch (error) {
        console.error(`Failed loading locale phrases: ${(error as Error).message}`);
        return sendTypedResp({ error: 'Failed to load locale phrases.' });
    }
}
