import { parseEmbedConfigJson, parseEmbedJson } from './parse';
import type { DiscordEmbedConfigDraft, DiscordEmbedDraft } from './types';

export const serializeEmbedJson = (draft: DiscordEmbedDraft, pretty = false) => {
    const output: Record<string, unknown> = { ...draft.extra };

    if (draft.title !== undefined) output.title = draft.title;
    if (draft.url !== undefined) output.url = draft.url;
    if (draft.description !== undefined) output.description = draft.description;
    if (draft.color !== undefined) output.color = draft.color;

    if (draft.thumbnailUrl) {
        output.thumbnail = { url: draft.thumbnailUrl };
    }

    if (draft.imageUrl) {
        output.image = { url: draft.imageUrl };
    }

    if (draft.footerText || draft.footerIconUrl) {
        output.footer = {
            ...(draft.footerText ? { text: draft.footerText } : {}),
            ...(draft.footerIconUrl ? { icon_url: draft.footerIconUrl } : {}),
        };
    }

    if (draft.fields.length) {
        output.fields = draft.fields.map(({ name, value, inline }) => ({
            name,
            value,
            ...(inline !== undefined ? { inline } : {}),
        }));
    }

    return JSON.stringify(output, null, pretty ? 4 : undefined);
};

export const serializeEmbedConfigJson = (draft: DiscordEmbedConfigDraft, pretty = false) => {
    const output: Record<string, unknown> = { ...draft.extra };

    output.onlineColor = draft.onlineColor;
    output.partialColor = draft.partialColor;
    output.offlineColor = draft.offlineColor;

    const optionalStrings: Array<[keyof DiscordEmbedConfigDraft, string]> = [
        ['onlineString', 'onlineString'],
        ['partialString', 'partialString'],
        ['offlineString', 'offlineString'],
        ['playerLineTemplate', 'playerLineTemplate'],
        ['playerInlineTemplate', 'playerInlineTemplate'],
        ['playerColumnTemplate', 'playerColumnTemplate'],
        ['playerListSeparator', 'playerListSeparator'],
        ['playerListInlineSeparator', 'playerListInlineSeparator'],
        ['pagerPrevLabel', 'pagerPrevLabel'],
        ['pagerNextLabel', 'pagerNextLabel'],
        ['pagerPageLabelTemplate', 'pagerPageLabelTemplate'],
        ['emptyPlayerListString', 'emptyPlayerListString'],
    ];

    for (const [draftKey, outKey] of optionalStrings) {
        const value = draft[draftKey];
        if (typeof value === 'string' && value.length) {
            output[outKey] = value;
        }
    }

    if (draft.playerColumnCount !== undefined) output.playerColumnCount = draft.playerColumnCount;
    if (draft.playersPerColumn !== undefined) output.playersPerColumn = draft.playersPerColumn;
    if (draft.maxPlayersShown !== undefined) output.maxPlayersShown = draft.maxPlayersShown;
    if (draft.showPagerButtons !== undefined) output.showPagerButtons = draft.showPagerButtons;

    if (draft.buttons.length) {
        output.buttons = draft.buttons.map(({ label, url, emoji }) => ({
            label,
            url,
            ...(emoji ? { emoji } : {}),
        }));
    }

    return JSON.stringify(output, null, pretty ? 4 : undefined);
};

export const beautifyEmbedJsonPair = (embedJson: string, embedConfigJson: string) => {
    return {
        embedJson: serializeEmbedJson(parseEmbedJson(embedJson), true),
        embedConfigJson: serializeEmbedConfigJson(parseEmbedConfigJson(embedConfigJson), true),
    };
};
