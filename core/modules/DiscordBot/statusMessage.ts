import { txEnv } from '@core/globalData';
import { msToShortishDuration } from '@lib/misc';
import { FxMonitorHealth } from '@shared/enums';
import jsonForgivingParse from '@shared/jsonForgivingParse';
import { buildDiscordCardMessageFromEmbed } from './componentsV2';
import { translateDiscord } from './discordLocale';

const emojiRegex = /^\p{RGI_Emoji}$/v;
const defaultFooterIconUrl = 'https://cdn.discordapp.com/emojis/1062339910654246964.webp?size=96&quality=lossless';

const actionRowType = 1;
const buttonType = 2;
const secondaryButtonStyle = 2;
const linkButtonStyle = 5;
const playerListPageButtonPrefix = 'fxpanel:playerList:page:';

const t = (key: string, data: Record<string, unknown> = {}) => {
    return translateDiscord(`status_message.${key}`, data);
};

type PlainObject = Record<string, unknown>;
type PlainButtonEmoji = {
    id?: string;
    name?: string;
    animated?: boolean;
};
type PlainLinkButton = {
    type: number;
    style: number;
    label: string;
    url: string;
    emoji?: PlainButtonEmoji;
};
type PlainCustomButton = {
    type: number;
    style: number;
    label: string;
    custom_id: string;
    disabled?: boolean;
    emoji?: PlainButtonEmoji;
};
type PlainActionRow = {
    type: number;
    components: (PlainLinkButton | PlainCustomButton)[];
};
type PlayerListPlaceholderData = {
    playerList: string;
    playerListInline: string;
    playerListSummary: string;
    playerListColumns: string[];
    playerListPage: number;
    playerListTotalPages: number;
    playerListPageSummary: string;
    useColumnFieldLayout: boolean;
};
type GeneratePlayerListMessageOptions = {
    page?: number;
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

const isValidEmbedUrl = (url: unknown) => {
    return typeof url === 'string' && /^(https?|discord):\/\//.test(url);
};

const isValidButtonEmoji = (emoji: unknown) => {
    if (typeof emoji !== 'string') return false;
    if (/^\d{17,19}$/.test(emoji)) return true;
    if (/^<a?:\w{2,32}:\d{17,19}>$/.test(emoji)) return true;
    return emojiRegex.test(emoji);
};

const invalidUrlMessage = t('errors.invalid_url_details');

const invalidPlaceholderMessage = t('errors.invalid_placeholder_details');

const invalidEmojiMessage = t('errors.invalid_emoji_details');

const getInvalidUrlError = (url: unknown, prefix?: string) => {
    const printableUrl = typeof url === 'string' ? url : '';
    const messageHead = printableUrl.length
        ? t('errors.invalid_url', { url: printableUrl })
        : t('errors.empty_url');
    const badPlaceholderMessage = printableUrl.startsWith('{{') ? invalidPlaceholderMessage : '';

    return [prefix ? `${prefix} ${messageHead}` : messageHead, invalidUrlMessage, badPlaceholderMessage]
        .filter(Boolean)
        .join('\n');
};

const assertValidUrl = (url: unknown, prefix?: string) => {
    if (!isValidEmbedUrl(url)) {
        throw new Error(getInvalidUrlError(url, prefix));
    }
};

const resolveEmbedColor = (value: unknown) => {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffff) {
        return value;
    }

    if (typeof value !== 'string') {
        throw new Error(t('errors.invalid_status_color', { value: String(value) }));
    }

    const trimmedValue = value.trim();
    if (!trimmedValue.length) {
        throw new Error(t('errors.empty_status_color'));
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

    throw new Error(t('errors.invalid_status_color', { value: trimmedValue }));
};

const normalizeIconUrlKey = (input: PlainObject) => {
    if ('iconURL' in input && !('icon_url' in input)) {
        input.icon_url = input.iconURL;
    }
    delete input.iconURL;

    return input;
};

const normalizeFooterData = (value: unknown) => {
    if (!isPlainObject(value)) {
        throw new Error(t('errors.footer_object'));
    }

    const footer = normalizeIconUrlKey(structuredClone(value) as PlainObject);
    if (typeof footer.text !== 'string' || !footer.text.length) {
        throw new Error(t('errors.footer_text'));
    }
    if (footer.icon_url !== undefined) {
        assertValidUrl(footer.icon_url, 'Embed footer');
    }

    return footer;
};

const normalizeAuthorData = (value: unknown) => {
    if (!isPlainObject(value)) {
        throw new Error(t('errors.author_object'));
    }

    const author = normalizeIconUrlKey(structuredClone(value) as PlainObject);
    if (typeof author.name !== 'string' || !author.name.length) {
        throw new Error(t('errors.author_name'));
    }
    if (author.url !== undefined) {
        assertValidUrl(author.url, 'Embed author');
    }
    if (author.icon_url !== undefined) {
        assertValidUrl(author.icon_url, 'Embed author icon');
    }

    return author;
};

const normalizeMediaData = (value: unknown, sectionName: string) => {
    if (!isPlainObject(value)) {
        throw new Error(t('errors.media_object', { sectionName }));
    }

    const media = structuredClone(value) as PlainObject;
    assertValidUrl(media.url, `Embed ${sectionName}`);
    return media;
};

const normalizeFields = (value: unknown) => {
    if (!Array.isArray(value)) {
        throw new Error(t('errors.fields_array'));
    }

    const normalizedFields = [] as PlainObject[];
    for (const field of value) {
        if (!isPlainObject(field)) {
            throw new Error(t('errors.field_object'));
        }
        if (typeof field.name !== 'string' || !field.name.length) {
            throw new Error(t('errors.field_name'));
        }
        if (typeof field.value !== 'string' || !field.value.length) {
            throw new Error(t('errors.field_value'));
        }
        if (field.inline !== undefined && typeof field.inline !== 'boolean') {
            throw new Error(t('errors.field_inline'));
        }

        normalizedFields.push(structuredClone(field) as PlainObject);
    }

    return normalizedFields;
};

const normalizeEmbedData = (processedEmbedData: unknown, statusColor: unknown) => {
    if (!isPlainObject(processedEmbedData)) {
        throw new Error(t('errors.embed_object'));
    }

    const embed = structuredClone(processedEmbedData) as PlainObject;
    if (embed.title !== undefined && typeof embed.title !== 'string') {
        throw new Error(t('errors.title_string'));
    }
    if (embed.description !== undefined && typeof embed.description !== 'string') {
        throw new Error(t('errors.description_string'));
    }
    if (embed.url !== undefined) {
        assertValidUrl(embed.url);
    }
    if (embed.footer !== undefined) {
        embed.footer = normalizeFooterData(embed.footer);
    }
    if (embed.author !== undefined) {
        embed.author = normalizeAuthorData(embed.author);
    }
    if (embed.image !== undefined) {
        embed.image = normalizeMediaData(embed.image, 'image');
    }
    if (embed.thumbnail !== undefined) {
        embed.thumbnail = normalizeMediaData(embed.thumbnail, 'thumbnail');
    }
    if (embed.fields !== undefined) {
        embed.fields = normalizeFields(embed.fields);
    }

    embed.color = resolveEmbedColor(statusColor);
    embed.timestamp = new Date().toISOString();
    if (!embed.footer) {
        embed.footer = {
            icon_url: defaultFooterIconUrl,
            text: `fxPanel ${txEnv.txaVersion} • ${t('footer_updated_every_minute')}`,
        };
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

const buildButtonsRow = (buttons: unknown, processValue: (inputValue: unknown) => unknown): PlainActionRow | undefined => {
    if (!Array.isArray(buttons) || !buttons.length) {
        return undefined;
    }
    if (buttons.length > 5) {
        throw new Error(t('errors.too_many_buttons'));
    }

    const components = [] as PlainLinkButton[];
    for (const cfgButton of buttons) {
        if (!isValidButtonConfig(cfgButton)) {
            throw new Error(t('errors.invalid_button_config'));
        }

        const processedLabel = processValue(cfgButton.label);
        if (typeof processedLabel !== 'string' || !processedLabel.length) {
            throw new Error(t('errors.button_label_empty'));
        }

        const processedUrl = processValue(cfgButton.url);
        if (!isValidEmbedUrl(processedUrl)) {
            throw new Error(getInvalidUrlError(processedUrl, `for button \`${cfgButton.label}\`.`));
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
                throw new Error(t('errors.invalid_button_emoji', { label: cfgButton.label, details: invalidEmojiMessage }));
            }
            button.emoji = buildButtonEmoji(processedEmoji);
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

const getConfigPositiveInteger = (config: PlainObject, key: string, fallback: number) => {
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

    return fallback;
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
    let output = inputString;
    for (const [key, value] of Object.entries(values)) {
        output = output.replaceAll(`{{${key}}}`, String(value));
    }
    return output;
};

const parseServerEndpoint = (value: string | null | undefined) => {
    if (!value?.length) return null;

    const ipv6Match = value.match(/^\[([^\]]+)\]:(\d+)$/);
    if (ipv6Match) {
        return {
            host: ipv6Match[1],
            port: ipv6Match[2],
        };
    }

    const separatorIndex = value.lastIndexOf(':');
    if (separatorIndex <= 0 || separatorIndex === value.length - 1) return null;

    return {
        host: value.slice(0, separatorIndex),
        port: value.slice(separatorIndex + 1),
    };
};

const buildPlayerListPagerRow = (embedConfigJson: PlainObject, playerListData: PlayerListPlaceholderData) => {
    const showPagerButtons = embedConfigJson.showPagerButtons !== false;
    if (!showPagerButtons || playerListData.playerListTotalPages <= 1) {
        return undefined;
    }

    const pagerPrevLabel = getConfigString(embedConfigJson, 'pagerPrevLabel', t('pager.prev'));
    const pagerNextLabel = getConfigString(embedConfigJson, 'pagerNextLabel', t('pager.next'));
    const pageLabelTemplate = getConfigString(
        embedConfigJson,
        'pagerPageLabelTemplate',
        t('pager.page_label', {
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

const expandPlayerListFields = (
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

const buildPlayerListPlaceholderData = (embedConfigJson: PlainObject, requestedPage = 1): PlayerListPlaceholderData => {
    const players = txCore.fxPlayerlist.getPlayerList();
    const emptyPlayerListString = getConfigString(embedConfigJson, 'emptyPlayerListString', t('empty_player_list'));
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

    const renderLine = (template: string, player: (typeof visiblePlayers)[number], index: number) => {
        return replaceTemplateValues(template, {
            index: pageStartIndex + index + 1,
            netid: player.netid,
            displayName: player.displayName,
            pureName: player.pureName,
            license: player.license ?? 'unknown',
            playTimeMinutes: player.playTimeMinutes ?? 0,
            playTime: msToShortishDuration(Math.max(player.playTimeMinutes ?? 0, 0) * 60_000),
            sessionTimeSeconds: player.sessionTimeSeconds ?? 0,
            sessionTimeMinutes: Math.ceil(Math.max(player.sessionTimeSeconds ?? 0, 0) / 60),
            sessionTime: msToShortishDuration(Math.max(player.sessionTimeSeconds ?? 0, 0) * 1000),
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
    const playerListInline = inlineEntries.length ? inlineEntries.join(playerListInlineSeparator) : emptyPlayerListString;
    const pageStartNumber = visiblePlayers.length ? pageStartIndex + 1 : 0;
    const pageEndNumber = visiblePlayers.length ? pageStartIndex + visiblePlayers.length : 0;
    const playerListSummary = t('player_list_summary', { count: players.length });
    const playerListPageSummary = !players.length
        ? t('player_list_page_summary_empty')
        : t('player_list_page_summary', {
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

const buildPlaceholders = (rawEmbedJson: string, embedConfigJson: PlainObject, playerListPage = 1) => {
    let embedJson;
    try {
        embedJson = jsonForgivingParse(rawEmbedJson);
        if (!(embedJson instanceof Object)) throw new Error('not an Object');
    } catch (error) {
        throw new Error(t('errors.embed_json_error', { message: emsg(error) }));
    }

    const serverCfxId = txCore.cacheStore.get('fxsRuntime:cfxId');
    const fxMonitorStatus = txCore.fxMonitor.status;
    const playerCount = txCore.fxPlayerlist.onlineCount;
    const rawMaxPlayers = txCore.cacheStore.get('fxsRuntime:maxClients');
    const serverEndpoint = txCore.fxRunner.child?.netEndpoint ?? null;
    const parsedServerEndpoint = parseServerEndpoint(serverEndpoint);
    const parsedMaxPlayers =
        typeof rawMaxPlayers === 'number'
            ? rawMaxPlayers
            : typeof rawMaxPlayers === 'string'
              ? Number(rawMaxPlayers)
              : NaN;
    const hasParsedMaxPlayers = Number.isFinite(parsedMaxPlayers) && parsedMaxPlayers > 0;
    const joinLeaveTally = txCore.fxPlayerlist.joinLeaveTally;
    const playerListData = buildPlayerListPlaceholderData(embedConfigJson, playerListPage);
    const unknownValue = t('defaults.values.unknown');
    const placeholders = {
        serverName: txConfig.general.serverName,
        statusString: unknownValue,
        statusColor: '#4C3539',
        serverCfxId,
        serverBrowserUrl: `https://servers.fivem.net/servers/detail/${serverCfxId}`,
        serverJoinUrl: `https://cfx.re/join/${serverCfxId}`,
        serverEndpoint: serverEndpoint ?? unknownValue,
        serverIp: parsedServerEndpoint?.host ?? unknownValue,
        serverPort: parsedServerEndpoint?.port ?? unknownValue,
        serverConnectCommand: serverEndpoint ? `connect ${serverEndpoint}` : t('defaults.values.connect_unavailable'),
        serverMaxClients: rawMaxPlayers ?? unknownValue,
        serverClients: playerCount,
        serverAvailableSlots: hasParsedMaxPlayers ? Math.max(parsedMaxPlayers - playerCount, 0) : unknownValue,
        serverOccupancyPercent: hasParsedMaxPlayers
            ? `${Math.round((playerCount / parsedMaxPlayers) * 100)}%`
            : unknownValue,
        nextScheduledRestart: unknownValue,
        uptime: fxMonitorStatus.uptime > 0 ? msToShortishDuration(fxMonitorStatus.uptime) : '--',
        recentJoinCount: joinLeaveTally.joined,
        recentLeaveCount: joinLeaveTally.left,
        playerList: playerListData.playerList,
        playerListColumns: playerListData.playerListColumns.join(playerListInlineSeparatorFallback),
        playerListInline: playerListData.playerListInline,
        playerListSummary: playerListData.playerListSummary,
        playerListPage: playerListData.playerListPage,
        playerListTotalPages: playerListData.playerListTotalPages,
        playerListPageSummary: playerListData.playerListPageSummary,
        configurableEmbedDescription: t('defaults.configurable_embed_description'),
        statusFieldLabel: t('defaults.fields.status'),
        playersFieldLabel: t('defaults.fields.players'),
        connectCommandFieldLabel: t('defaults.fields.connect_command'),
        nextRestartFieldLabel: t('defaults.fields.next_restart'),
        uptimeFieldLabel: t('defaults.fields.uptime'),
        playerListFieldLabel: t('defaults.fields.player_list'),
        connectButtonLabel: t('defaults.buttons.connect'),
        communityButtonLabel: t('defaults.buttons.community'),
        serverPageButtonLabel: t('defaults.buttons.server_page'),
    };

    const schedule = txCore.fxScheduler.getStatus();
    if (typeof schedule.nextRelativeMs !== 'number') {
        placeholders.nextScheduledRestart = t('next_restart.not_scheduled');
    } else if (schedule.nextSkip) {
        placeholders.nextScheduledRestart = t('next_restart.skipped');
    } else {
        const tempFlag = schedule.nextIsTemp ? '(tmp)' : '';
        const relativeTime = msToShortishDuration(schedule.nextRelativeMs);
        if (schedule.nextRelativeMs < 60_000) {
            placeholders.nextScheduledRestart = t('next_restart.right_now', { tempFlag }).trim();
        } else {
            placeholders.nextScheduledRestart = t('next_restart.in', { relativeTime, tempFlag }).trim();
        }
    }

    if (fxMonitorStatus.health === FxMonitorHealth.ONLINE) {
        placeholders.statusString = embedConfigJson?.onlineString ?? t('status.online');
        placeholders.statusColor = embedConfigJson?.onlineColor ?? '#0BA70B';
    } else if (fxMonitorStatus.health === FxMonitorHealth.PARTIAL) {
        placeholders.statusString = embedConfigJson?.partialString ?? t('status.partial');
        placeholders.statusColor = embedConfigJson?.partialColor ?? '#FFF100';
    } else if (fxMonitorStatus.health === FxMonitorHealth.OFFLINE) {
        placeholders.statusString = embedConfigJson?.offlineString ?? t('status.offline');
        placeholders.statusColor = embedConfigJson?.offlineColor ?? '#A70B28';
    }

    return {
        embedJson,
        placeholders,
        playerListData,
    };
};

const playerListInlineSeparatorFallback = ' | ';

const generateEmbedMessage = (
    rawEmbedJson: string,
    rawEmbedConfigJson: string,
    options?: {
        expandPlayerListFields?: boolean;
        includePlayerListPager?: boolean;
        playerListPage?: number;
    },
) => {
    let parsedEmbedConfigJson;
    try {
        parsedEmbedConfigJson = jsonForgivingParse(rawEmbedConfigJson);
        if (!(parsedEmbedConfigJson instanceof Object)) throw new Error('not an Object');
    } catch (error) {
        throw new Error(t('errors.embed_config_error', { message: emsg(error) }));
    }

    const embedConfigJson = isPlainObject(parsedEmbedConfigJson) ? parsedEmbedConfigJson : {};
    const { embedJson, placeholders, playerListData } = buildPlaceholders(
        rawEmbedJson,
        embedConfigJson,
        options?.playerListPage,
    );

    const replacePlaceholders = (inputString: string) => {
        for (const [key, value] of Object.entries(placeholders)) {
            inputString = inputString.replaceAll(`{{${key}}}`, String(value));
        }
        return inputString;
    };

    const processValue = (inputValue: unknown): unknown => {
        if (typeof inputValue === 'string') {
            return replacePlaceholders(inputValue);
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
            const processed = processValue(value);
            if (key === 'url' && !isValidEmbedUrl(processed)) {
                throw new Error(getInvalidUrlError(processed));
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
        embed = normalizeEmbedData(processedEmbedData, placeholders.statusColor);
    } catch (error) {
        throw new Error(t('errors.embed_class_error', { message: emsg(error) }));
    }

    let buttonsRow: PlainActionRow | undefined;
    try {
        buttonsRow = buildButtonsRow(embedConfigJson?.buttons, processValue);
    } catch (error) {
        throw new Error(t('errors.embed_buttons_error', { message: emsg(error) }));
    }

    const components = [] as PlainActionRow[];
    if (buttonsRow) {
        components.push(buttonsRow);
    }
    if (options?.includePlayerListPager) {
        const pagerRow = buildPlayerListPagerRow(embedConfigJson, playerListData);
        if (pagerRow) {
            components.push(pagerRow);
        }
    }

    return {
        messagePayload: {
            ...buildDiscordCardMessageFromEmbed(embed, {
                actionRows: components.length ? components : undefined,
            }),
        },
        playerListData,
    };
};

export const generateStatusMessage = (
    rawEmbedJson: string = txConfig.discordBot.embedJson,
    rawEmbedConfigJson: string = txConfig.discordBot.embedConfigJson,
) => {
    return generateEmbedMessage(rawEmbedJson, rawEmbedConfigJson).messagePayload;
};

export const generatePlayerListMessage = (
    rawEmbedJson: string = txConfig.discordBot.playerListEmbedJson,
    rawEmbedConfigJson: string = txConfig.discordBot.playerListEmbedConfigJson,
    options?: GeneratePlayerListMessageOptions,
) => {
    return generateEmbedMessage(rawEmbedJson, rawEmbedConfigJson, {
        expandPlayerListFields: true,
        includePlayerListPager: true,
        playerListPage: options?.page,
    }).messagePayload;
};