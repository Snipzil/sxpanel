import jsonForgivingParse from '../jsonForgivingParse';
import {
    createDraftId,
    DiscordEmbedConfigDraftSchema,
    DiscordEmbedDraftSchema,
    type DiscordEmbedConfigDraft,
    type DiscordEmbedDraft,
    type DiscordEmbedFieldDraft,
    type DiscordLinkButtonDraft,
} from './types';

const EMBED_KNOWN_KEYS = new Set([
    'title',
    'url',
    'description',
    'color',
    'fields',
    'image',
    'thumbnail',
    'footer',
    'author',
    'timestamp',
]);

const CONFIG_KNOWN_KEYS = new Set([
    'onlineColor',
    'partialColor',
    'offlineColor',
    'onlineString',
    'partialString',
    'offlineString',
    'playerLineTemplate',
    'playerInlineTemplate',
    'playerColumnTemplate',
    'playerColumnCount',
    'playersPerColumn',
    'maxPlayersShown',
    'playerListSeparator',
    'playerListInlineSeparator',
    'showPagerButtons',
    'pagerPrevLabel',
    'pagerNextLabel',
    'pagerPageLabelTemplate',
    'emptyPlayerListString',
    'buttons',
]);

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
};

const readMediaUrl = (value: unknown) => {
    if (!isPlainObject(value)) return undefined;
    return typeof value.url === 'string' ? value.url : undefined;
};

const readFooter = (value: unknown) => {
    if (!isPlainObject(value)) return {};
    return {
        footerText: typeof value.text === 'string' ? value.text : undefined,
        footerIconUrl: typeof value.icon_url === 'string' ? value.icon_url : undefined,
    };
};

const parseFields = (value: unknown): DiscordEmbedFieldDraft[] => {
    if (!Array.isArray(value)) return [];
    return value.filter(isPlainObject).map((field, index) => ({
        id: `field_${index}_${createDraftId()}`,
        name: typeof field.name === 'string' ? field.name : '',
        value: typeof field.value === 'string' ? field.value : '',
        inline: typeof field.inline === 'boolean' ? field.inline : undefined,
    }));
};

const parseButtons = (value: unknown): DiscordLinkButtonDraft[] => {
    if (!Array.isArray(value)) return [];
    return value.filter(isPlainObject).map((btn, index) => ({
        id: `btn_${index}_${createDraftId()}`,
        label: typeof btn.label === 'string' ? btn.label : '',
        url: typeof btn.url === 'string' ? btn.url : '',
        emoji: typeof btn.emoji === 'string' ? btn.emoji : undefined,
    }));
};

const readOptionalString = (value: unknown) => (typeof value === 'string' ? value : undefined);

const readOptionalPositiveInt = (value: unknown) => {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
    if (typeof value === 'string' && /^\d+$/.test(value)) {
        const parsed = Number.parseInt(value, 10);
        if (parsed > 0) return parsed;
    }
    return undefined;
};

export const parseEmbedJson = (raw: string): DiscordEmbedDraft => {
    const parsed = jsonForgivingParse(raw);
    if (!isPlainObject(parsed)) {
        throw new Error('Embed JSON must be an object');
    }

    const footer = readFooter(parsed.footer);
    const extra: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
        if (!EMBED_KNOWN_KEYS.has(key)) {
            extra[key] = value;
        }
    }

    const draft = {
        title: readOptionalString(parsed.title),
        url: readOptionalString(parsed.url),
        description: readOptionalString(parsed.description),
        color: readOptionalString(parsed.color),
        thumbnailUrl: readMediaUrl(parsed.thumbnail),
        imageUrl: readMediaUrl(parsed.image),
        footerText: footer.footerText,
        footerIconUrl: footer.footerIconUrl,
        fields: parseFields(parsed.fields),
        extra,
    };

    return DiscordEmbedDraftSchema.parse(draft);
};

export const parseEmbedConfigJson = (raw: string): DiscordEmbedConfigDraft => {
    const parsed = jsonForgivingParse(raw);
    if (!isPlainObject(parsed)) {
        throw new Error('Embed config JSON must be an object');
    }

    const extra: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
        if (!CONFIG_KNOWN_KEYS.has(key)) {
            extra[key] = value;
        }
    }

    const draft = {
        onlineColor: readOptionalString(parsed.onlineColor) ?? '#0BA70B',
        partialColor: readOptionalString(parsed.partialColor) ?? '#FFF100',
        offlineColor: readOptionalString(parsed.offlineColor) ?? '#A70B28',
        onlineString: readOptionalString(parsed.onlineString),
        partialString: readOptionalString(parsed.partialString),
        offlineString: readOptionalString(parsed.offlineString),
        playerLineTemplate: readOptionalString(parsed.playerLineTemplate),
        playerInlineTemplate: readOptionalString(parsed.playerInlineTemplate),
        playerColumnTemplate: readOptionalString(parsed.playerColumnTemplate),
        playerColumnCount: readOptionalPositiveInt(parsed.playerColumnCount),
        playersPerColumn: readOptionalPositiveInt(parsed.playersPerColumn),
        maxPlayersShown: readOptionalPositiveInt(parsed.maxPlayersShown),
        playerListSeparator: readOptionalString(parsed.playerListSeparator),
        playerListInlineSeparator: readOptionalString(parsed.playerListInlineSeparator),
        showPagerButtons: typeof parsed.showPagerButtons === 'boolean' ? parsed.showPagerButtons : undefined,
        pagerPrevLabel: readOptionalString(parsed.pagerPrevLabel),
        pagerNextLabel: readOptionalString(parsed.pagerNextLabel),
        pagerPageLabelTemplate: readOptionalString(parsed.pagerPageLabelTemplate),
        emptyPlayerListString: readOptionalString(parsed.emptyPlayerListString),
        buttons: parseButtons(parsed.buttons),
        extra,
    };

    return DiscordEmbedConfigDraftSchema.parse(draft);
};

export const tryParseEmbedDrafts = (embedJson: string, embedConfigJson: string) => {
    try {
        return {
            ok: true as const,
            embed: parseEmbedJson(embedJson),
            config: parseEmbedConfigJson(embedConfigJson),
        };
    } catch (error) {
        return {
            ok: false as const,
            error: error instanceof Error ? error.message : String(error),
        };
    }
};
