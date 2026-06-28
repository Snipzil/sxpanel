import { emsg } from '../emsg';
import { buildDiscordCardMessageFromEmbed } from './componentsV2';
import type { DiscordCardMessagePayload } from './componentsV2';
import { substitutePlaceholders } from './substitutePlaceholders';
import { formatPreviewPlayTime, formatPreviewSessionTime, type MockPlayer } from './mockPlayers';

const emojiRegex = /^\p{Extended_Pictographic}$/u;

export const actionRowType = 1;
export const buttonType = 2;
export const secondaryButtonStyle = 2;
export const linkButtonStyle = 5;
export const playerListPageButtonPrefix = 'sxpanel:playerList:page:';
export const playerListInlineSeparatorFallback = ' | ';

export type PlainObject = Record<string, unknown>;

export type MsgFn = (key: string, data?: Record<string, unknown>) => string;

export type PlainButtonEmoji = {
    id?: string;
    name?: string;
    animated?: boolean;
};

export type PlainLinkButton = {
    type: number;
    style: number;
    label: string;
    url: string;
    emoji?: PlainButtonEmoji;
};

export type PlainCustomButton = {
    type: number;
    style: number;
    label: string;
    custom_id: string;
    disabled?: boolean;
    emoji?: PlainButtonEmoji;
};

export type PlainActionRow = {
    type: number;
    components: (PlainLinkButton | PlainCustomButton)[];
};

export type PlayerListPlaceholderData = {
    playerList: string;
    playerListInline: string;
    playerListSummary: string;
    playerListColumns: string[];
    playerListPage: number;
    playerListTotalPages: number;
    playerListPageSummary: string;
    useColumnFieldLayout: boolean;
};

export type AssembleDiscordEmbedMessageOptions = {
    expandPlayerListFields?: boolean;
    includePlayerListPager?: boolean;
    defaultFooter?: { icon_url: string; text: string };
    /** Panel preview: substitute unresolved URLs and relax footer validation. */
    previewLenient?: boolean;
};

const PREVIEW_LENIENT_JOIN_URL = 'https://cfx.re/join/previewcfx123';

export type AssembleDiscordEmbedMessageInput = {
    embedJson: PlainObject;
    embedConfigJson: PlainObject;
    placeholders: Record<string, unknown>;
    playerListData: PlayerListPlaceholderData;
    msg: MsgFn;
    options?: AssembleDiscordEmbedMessageOptions;
};

const isPlainObject = (value: unknown): value is PlainObject => {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
};

const isValidButtonConfig = (btn: unknown) => {
    return (
        isPlainObject(btn) &&
        typeof btn.label === 'string' &&
        btn.label.length &&
        typeof btn.url === 'string' &&
        (typeof btn.emoji === 'string' || btn.emoji === undefined)
    );
};

export const isValidEmbedUrl = (url: unknown) => {
    return typeof url === 'string' && /^(https?|discord):\/\//.test(url);
};

const isValidButtonEmoji = (emoji: unknown) => {
    if (typeof emoji !== 'string') return false;
    if (/^\d{17,19}$/.test(emoji)) return true;
    if (/^<a?:\w{2,32}:\d{17,19}>$/.test(emoji)) return true;
    return emojiRegex.test(emoji);
};

const getInvalidUrlError = (url: unknown, msg: MsgFn, prefix?: string) => {
    const printableUrl = typeof url === 'string' ? url : '';
    const messageHead = printableUrl.length
        ? msg('errors.invalid_url', { url: printableUrl })
        : msg('errors.empty_url');
    const badPlaceholderMessage = printableUrl.startsWith('{{') ? msg('errors.invalid_placeholder_details') : '';

    return [prefix ? `${prefix} ${messageHead}` : messageHead, msg('errors.invalid_url_details'), badPlaceholderMessage]
        .filter(Boolean)
        .join('\n');
};

const assertValidUrl = (url: unknown, msg: MsgFn, prefix?: string) => {
    if (!isValidEmbedUrl(url)) {
        throw new Error(getInvalidUrlError(url, msg, prefix));
    }
};

export const resolveEmbedColor = (value: unknown, msg: MsgFn) => {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffff) {
        return value;
    }

    if (typeof value !== 'string') {
        throw new Error(msg('errors.invalid_status_color', { value: String(value) }));
    }

    const trimmedValue = value.trim();
    if (!trimmedValue.length) {
        throw new Error(msg('errors.empty_status_color'));
    }

    const normalizedHex = trimmedValue.replace(/^#/, '').replace(/^0x/i, '');
    if (/^[0-9a-f]{3}$/i.test(normalizedHex)) {
        return Number.parseInt(
            normalizedHex
                .split('')
                .map((char) => char + char)
                .join(''),
            16,
        );
    }
    if (/^[0-9a-f]{6}$/i.test(normalizedHex)) {
        return Number.parseInt(normalizedHex, 16);
    }
    if (/^\d+$/.test(trimmedValue)) {
        const parsedValue = Number(trimmedValue);
        if (Number.isInteger(parsedValue) && parsedValue >= 0 && parsedValue <= 0xffffff) {
            return parsedValue;
        }
    }

    throw new Error(msg('errors.invalid_status_color', { value: trimmedValue }));
};

const normalizeIconUrlKey = (input: PlainObject) => {
    if ('iconURL' in input && !('icon_url' in input)) {
        input.icon_url = input.iconURL;
    }
    delete input.iconURL;

    return input;
};

const normalizeFooterData = (
    value: unknown,
    msg: MsgFn,
    previewLenient?: boolean,
    defaultFooter?: { icon_url: string; text: string },
) => {
    if (!isPlainObject(value)) {
        throw new Error(msg('errors.footer_object'));
    }

    const footer = normalizeIconUrlKey(structuredClone(value) as PlainObject);
    if (typeof footer.text !== 'string' || !footer.text.length) {
        if (previewLenient && defaultFooter?.text) {
            footer.text = defaultFooter.text;
        } else {
            throw new Error(msg('errors.footer_text'));
        }
    }
    if (footer.icon_url !== undefined) {
        assertValidUrl(footer.icon_url, msg, 'Embed footer');
    }

    return footer;
};

const normalizeAuthorData = (value: unknown, msg: MsgFn) => {
    if (!isPlainObject(value)) {
        throw new Error(msg('errors.author_object'));
    }

    const author = normalizeIconUrlKey(structuredClone(value) as PlainObject);
    if (typeof author.name !== 'string' || !author.name.length) {
        throw new Error(msg('errors.author_name'));
    }
    if (author.url !== undefined) {
        assertValidUrl(author.url, msg, 'Embed author');
    }
    if (author.icon_url !== undefined) {
        assertValidUrl(author.icon_url, msg, 'Embed author icon');
    }

    return author;
};

const normalizeMediaData = (value: unknown, sectionName: string, msg: MsgFn) => {
    if (!isPlainObject(value)) {
        throw new Error(msg('errors.media_object', { sectionName }));
    }

    const media = structuredClone(value) as PlainObject;
    assertValidUrl(media.url, msg, `Embed ${sectionName}`);
    return media;
};

const normalizeMediaDataLenient = (value: unknown, sectionName: string, msg: MsgFn, previewLenient?: boolean) => {
    if (!isPlainObject(value)) {
        throw new Error(msg('errors.media_object', { sectionName }));
    }

    const media = structuredClone(value) as PlainObject;
    const url = typeof media.url === 'string' ? media.url.trim() : '';

    if (previewLenient && url.length && !isValidEmbedUrl(url)) {
        return media;
    }

    assertValidUrl(media.url, msg, `Embed ${sectionName}`);
    return media;
};

const normalizeFields = (value: unknown, msg: MsgFn) => {
    if (!Array.isArray(value)) {
        throw new Error(msg('errors.fields_array'));
    }

    const normalizedFields = [] as PlainObject[];
    for (const field of value) {
        if (!isPlainObject(field)) {
            throw new Error(msg('errors.field_object'));
        }
        if (typeof field.name !== 'string' || !field.name.length) {
            throw new Error(msg('errors.field_name'));
        }
        if (typeof field.value !== 'string' || !field.value.length) {
            throw new Error(msg('errors.field_value'));
        }
        if (field.inline !== undefined && typeof field.inline !== 'boolean') {
            throw new Error(msg('errors.field_inline'));
        }

        normalizedFields.push(structuredClone(field) as PlainObject);
    }

    return normalizedFields;
};

const normalizeEmbedData = (
    processedEmbedData: unknown,
    statusColor: unknown,
    msg: MsgFn,
    defaultFooter?: { icon_url: string; text: string },
    previewLenient?: boolean,
) => {
    if (!isPlainObject(processedEmbedData)) {
        throw new Error(msg('errors.embed_object'));
    }

    const embed = structuredClone(processedEmbedData) as PlainObject;
    if (embed.title !== undefined && typeof embed.title !== 'string') {
        throw new Error(msg('errors.title_string'));
    }
    if (embed.description !== undefined && typeof embed.description !== 'string') {
        throw new Error(msg('errors.description_string'));
    }
    if (embed.url !== undefined) {
        assertValidUrl(embed.url, msg);
    }
    if (embed.footer !== undefined) {
        embed.footer = normalizeFooterData(embed.footer, msg, previewLenient, defaultFooter);
    }
    if (embed.author !== undefined) {
        embed.author = normalizeAuthorData(embed.author, msg);
    }
    if (embed.image !== undefined) {
        embed.image = normalizeMediaDataLenient(embed.image, 'image', msg, previewLenient);
    }
    if (embed.thumbnail !== undefined) {
        embed.thumbnail = normalizeMediaDataLenient(embed.thumbnail, 'thumbnail', msg, previewLenient);
    }
    if (embed.fields !== undefined) {
        embed.fields = normalizeFields(embed.fields, msg);
    }

    embed.color = resolveEmbedColor(statusColor, msg);
    embed.timestamp = new Date().toISOString();
    if (!embed.footer && defaultFooter) {
        embed.footer = defaultFooter;
    }

    return embed;
};

const buildButtonEmoji = (emoji: string) => {
    if (/^\d{17,19}$/.test(emoji)) {
        return { id: emoji };
    }

    const customEmojiMatch = emoji.match(/^<(a?):(\w{2,32}):(\d{17,19})>$/);
    if (customEmojiMatch) {
        return {
            animated: customEmojiMatch[1] === 'a',
            id: customEmojiMatch[3],
            name: customEmojiMatch[2],
        };
    }

    return { name: emoji };
};

const buildButtonsRow = (
    buttons: unknown,
    processValue: (inputValue: unknown) => unknown,
    msg: MsgFn,
    previewLenient?: boolean,
): PlainActionRow | undefined => {
    if (!Array.isArray(buttons) || !buttons.length) {
        return undefined;
    }
    if (buttons.length > 5) {
        throw new Error(msg('errors.too_many_buttons'));
    }

    const components = [] as PlainLinkButton[];
    for (const cfgButton of buttons) {
        if (!isValidButtonConfig(cfgButton)) {
            throw new Error(msg('errors.invalid_button_config'));
        }

        const processedLabel = processValue(cfgButton.label);
        if (typeof processedLabel !== 'string' || !processedLabel.length) {
            throw new Error(msg('errors.button_label_empty'));
        }

        let processedUrl = processValue(cfgButton.url);
        if (!isValidEmbedUrl(processedUrl)) {
            if (previewLenient) {
                processedUrl = PREVIEW_LENIENT_JOIN_URL;
            } else {
                throw new Error(getInvalidUrlError(processedUrl, msg, `for button \`${cfgButton.label}\`.`));
            }
        }

        const button = {
            type: buttonType,
            style: linkButtonStyle,
            label: processedLabel,
            url: processedUrl,
        } as PlainLinkButton;

        if (cfgButton.emoji !== undefined) {
            const processedEmoji = processValue(cfgButton.emoji);
            if (!isValidButtonEmoji(processedEmoji)) {
                throw new Error(
                    msg('errors.invalid_button_emoji', {
                        label: cfgButton.label,
                        details: msg('errors.invalid_emoji_details'),
                    }),
                );
            }
            button.emoji = buildButtonEmoji(String(processedEmoji));
        }

        components.push(button);
    }

    return {
        type: actionRowType,
        components,
    };
};

const getConfigString = (config: PlainObject, key: string, fallback: string) => {
    const value = config[key];
    return typeof value === 'string' && value.length ? value : fallback;
};

const getOptionalConfigPositiveInteger = (config: PlainObject, key: string) => {
    const value = config[key];
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
        return value;
    }
    if (typeof value === 'string' && /^\d+$/.test(value)) {
        const parsedValue = Number.parseInt(value, 10);
        if (parsedValue > 0) {
            return parsedValue;
        }
    }

    return undefined;
};

const replaceTemplateValues = (inputString: string, values: Record<string, unknown>) => {
    return substitutePlaceholders(inputString, values);
};

const buildPlayerListPagerRow = (
    embedConfigJson: PlainObject,
    playerListData: PlayerListPlaceholderData,
    msg: MsgFn,
) => {
    const showPagerButtons = embedConfigJson.showPagerButtons !== false;
    if (!showPagerButtons || playerListData.playerListTotalPages <= 1) {
        return undefined;
    }

    const pagerPrevLabel = getConfigString(embedConfigJson, 'pagerPrevLabel', msg('pager.prev'));
    const pagerNextLabel = getConfigString(embedConfigJson, 'pagerNextLabel', msg('pager.next'));
    const pageLabelTemplate = getConfigString(
        embedConfigJson,
        'pagerPageLabelTemplate',
        msg('pager.page_label', {
            playerListPage: '{{playerListPage}}',
            playerListTotalPages: '{{playerListTotalPages}}',
        }),
    );
    const pageLabel = replaceTemplateValues(pageLabelTemplate, {
        playerListPage: playerListData.playerListPage,
        playerListTotalPages: playerListData.playerListTotalPages,
    });

    return {
        type: actionRowType,
        components: [
            {
                type: buttonType,
                style: secondaryButtonStyle,
                label: pagerPrevLabel,
                custom_id: `${playerListPageButtonPrefix}${Math.max(playerListData.playerListPage - 1, 1)}`,
                disabled: playerListData.playerListPage <= 1,
            },
            {
                type: buttonType,
                style: secondaryButtonStyle,
                label: pageLabel,
                custom_id: `${playerListPageButtonPrefix}${playerListData.playerListPage}`,
                disabled: true,
            },
            {
                type: buttonType,
                style: secondaryButtonStyle,
                label: pagerNextLabel,
                custom_id: `${playerListPageButtonPrefix}${Math.min(
                    playerListData.playerListPage + 1,
                    playerListData.playerListTotalPages,
                )}`,
                disabled: playerListData.playerListPage >= playerListData.playerListTotalPages,
            },
        ],
    } as PlainActionRow;
};

export const expandPlayerListFields = (
    rawEmbedData: PlainObject,
    processedEmbedData: PlainObject,
    playerListData: PlayerListPlaceholderData,
) => {
    if (!Array.isArray(rawEmbedData.fields) || !Array.isArray(processedEmbedData.fields)) {
        return processedEmbedData;
    }

    const expandedFields = [] as PlainObject[];
    for (const [index, processedFieldValue] of processedEmbedData.fields.entries()) {
        const rawFieldValue = rawEmbedData.fields[index];
        if (!isPlainObject(rawFieldValue) || !isPlainObject(processedFieldValue)) {
            expandedFields.push(structuredClone(processedFieldValue) as PlainObject);
            continue;
        }

        const rawFieldPlaceholder = typeof rawFieldValue.value === 'string' ? rawFieldValue.value.trim() : '';
        const shouldExpandColumns =
            rawFieldPlaceholder === '{{playerListColumns}}' ||
            (rawFieldPlaceholder === '{{playerList}}' && playerListData.useColumnFieldLayout);
        if (!shouldExpandColumns) {
            expandedFields.push(structuredClone(processedFieldValue) as PlainObject);
            continue;
        }

        const columnValues = playerListData.playerListColumns.length
            ? playerListData.playerListColumns
            : [playerListData.playerList];
        const baseFieldName =
            typeof processedFieldValue.name === 'string' && processedFieldValue.name.length
                ? processedFieldValue.name
                : '\u200b';

        for (const [columnIndex, columnValue] of columnValues.entries()) {
            expandedFields.push({
                ...structuredClone(processedFieldValue),
                name: columnIndex === 0 ? baseFieldName : '\u200b',
                value: columnValue,
                inline: playerListData.useColumnFieldLayout,
            });
        }
    }

    return {
        ...processedEmbedData,
        fields: expandedFields,
    };
};

export const buildPlayerListPlaceholderDataFromPlayers = (
    embedConfigJson: PlainObject,
    players: MockPlayer[],
    msg: MsgFn,
    requestedPage = 1,
): PlayerListPlaceholderData => {
    const emptyPlayerListString = getConfigString(embedConfigJson, 'emptyPlayerListString', msg('empty_player_list'));
    const playerLineTemplate = getConfigString(embedConfigJson, 'playerLineTemplate', '`#{{netid}}` {{displayName}}');
    const playerInlineTemplate = getConfigString(embedConfigJson, 'playerInlineTemplate', '{{displayName}}');
    const playerColumnTemplate = getConfigString(embedConfigJson, 'playerColumnTemplate', playerInlineTemplate);
    const playerListSeparator = getConfigString(embedConfigJson, 'playerListSeparator', '\n');
    const playerListInlineSeparator = getConfigString(embedConfigJson, 'playerListInlineSeparator', ', ');
    const configuredPlayerColumnCount = getOptionalConfigPositiveInteger(embedConfigJson, 'playerColumnCount');
    const playerColumnCount = configuredPlayerColumnCount ?? 3;
    const configuredPlayersPerColumn = getOptionalConfigPositiveInteger(embedConfigJson, 'playersPerColumn');
    const legacyMaxPlayersShown = getOptionalConfigPositiveInteger(embedConfigJson, 'maxPlayersShown');
    const playersPerColumn =
        configuredPlayersPerColumn ??
        (legacyMaxPlayersShown && configuredPlayerColumnCount
            ? Math.max(Math.ceil(legacyMaxPlayersShown / playerColumnCount), 1)
            : 10);
    const playersPerPage = Math.max(playerColumnCount * playersPerColumn, 1);
    const totalPages = Math.max(Math.ceil(players.length / playersPerPage), 1);
    const currentPage = Math.min(Math.max(requestedPage, 1), totalPages);
    const pageStartIndex = players.length ? (currentPage - 1) * playersPerPage : 0;
    const visiblePlayers = players.slice(pageStartIndex, pageStartIndex + playersPerPage);
    const useColumnFieldLayout = playerColumnCount > 1;

    const renderLine = (template: string, player: MockPlayer, index: number) => {
        return replaceTemplateValues(template, {
            index: pageStartIndex + index + 1,
            netid: player.netid,
            displayName: player.displayName,
            pureName: player.pureName,
            license: player.license ?? 'unknown',
            playTimeMinutes: player.playTimeMinutes ?? 0,
            playTime: formatPreviewPlayTime(player.playTimeMinutes ?? 0),
            sessionTimeSeconds: player.sessionTimeSeconds ?? 0,
            sessionTimeMinutes: Math.ceil(Math.max(player.sessionTimeSeconds ?? 0, 0) / 60),
            sessionTime: formatPreviewSessionTime(player.sessionTimeSeconds ?? 0),
            tags: player.tags.length ? player.tags.join(', ') : 'none',
        }).trim();
    };

    const multilineEntries = visiblePlayers
        .map((player, index) => renderLine(playerLineTemplate, player, index))
        .filter((line) => line.length);
    const inlineEntries = visiblePlayers
        .map((player, index) => renderLine(playerInlineTemplate, player, index))
        .filter((line) => line.length);
    const columnEntries = visiblePlayers
        .map((player, index) => renderLine(playerColumnTemplate, player, index))
        .filter((line) => line.length);
    const playerListColumns = [] as string[];
    for (let columnIndex = 0; columnIndex < playerColumnCount; columnIndex++) {
        const start = columnIndex * playersPerColumn;
        const columnLines = columnEntries.slice(start, start + playersPerColumn);
        if (!columnLines.length) continue;
        playerListColumns.push(columnLines.join(playerListSeparator));
    }

    const playerList = multilineEntries.length ? multilineEntries.join(playerListSeparator) : emptyPlayerListString;
    const playerListInline = inlineEntries.length
        ? inlineEntries.join(playerListInlineSeparator)
        : emptyPlayerListString;
    const pageStartNumber = visiblePlayers.length ? pageStartIndex + 1 : 0;
    const pageEndNumber = visiblePlayers.length ? pageStartIndex + visiblePlayers.length : 0;
    const playerListSummary = msg('player_list_summary', { count: players.length });
    const playerListPageSummary = !players.length
        ? msg('player_list_page_summary_empty')
        : msg('player_list_page_summary', {
              currentPage,
              totalPages,
              startNumber: pageStartNumber,
              endNumber: pageEndNumber,
          });

    return {
        playerList,
        playerListInline,
        playerListSummary,
        playerListColumns,
        playerListPage: currentPage,
        playerListTotalPages: totalPages,
        playerListPageSummary,
        useColumnFieldLayout,
    };
};

export const assembleDiscordEmbedMessage = (input: AssembleDiscordEmbedMessageInput) => {
    const { embedJson, embedConfigJson, placeholders, playerListData, msg, options } = input;
    const previewLenient = options?.previewLenient === true;

    const processValue = (inputValue: unknown): unknown => {
        if (typeof inputValue === 'string') {
            return substitutePlaceholders(inputValue, placeholders);
        }
        if (Array.isArray(inputValue)) {
            return inputValue.map((arrValue) => processValue(arrValue));
        }
        if (isPlainObject(inputValue)) {
            return processObject(inputValue);
        }
        return inputValue;
    };

    const processObject = (inputData: PlainObject) => {
        const input = structuredClone(inputData) as PlainObject;
        const out = {} as PlainObject;
        for (const [key, value] of Object.entries(input)) {
            let processed = processValue(value);
            if (key === 'url' && !isValidEmbedUrl(processed)) {
                if (previewLenient) {
                    processed = PREVIEW_LENIENT_JOIN_URL;
                } else {
                    throw new Error(getInvalidUrlError(processed, msg));
                }
            }
            out[key] = processed;
        }
        return out;
    };

    let processedEmbedData = processObject(embedJson);
    if (options?.expandPlayerListFields) {
        processedEmbedData = expandPlayerListFields(embedJson, processedEmbedData, playerListData);
    }

    let embed;
    try {
        embed = normalizeEmbedData(
            processedEmbedData,
            placeholders.statusColor,
            msg,
            options?.defaultFooter,
            previewLenient,
        );
    } catch (error) {
        throw new Error(msg('errors.embed_class_error', { message: emsg(error) }));
    }

    let buttonsRow: PlainActionRow | undefined;
    try {
        buttonsRow = buildButtonsRow(embedConfigJson?.buttons, processValue, msg, previewLenient);
    } catch (error) {
        throw new Error(msg('errors.embed_buttons_error', { message: emsg(error) }));
    }

    const components = [] as PlainActionRow[];
    if (buttonsRow) {
        components.push(buttonsRow);
    }
    if (options?.includePlayerListPager) {
        const pagerRow = buildPlayerListPagerRow(embedConfigJson, playerListData, msg);
        if (pagerRow) {
            components.push(pagerRow);
        }
    }

    const messagePayload: DiscordCardMessagePayload = {
        ...buildDiscordCardMessageFromEmbed(embed, {
            actionRows: components.length ? components : undefined,
        }),
    };

    return {
        messagePayload,
        playerListData,
    };
};
