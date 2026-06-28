import { txEnv } from '@core/globalData';
import { msToShortishDuration } from '@lib/misc';
import { FxMonitorHealth } from '@shared/enums';
import jsonForgivingParse from '@shared/jsonForgivingParse';
import { emsg } from '@shared/emsg';
import {
    assembleDiscordEmbedMessage,
    buildPlayerListPlaceholderDataFromPlayers,
    playerListInlineSeparatorFallback,
    type MockPlayer,
    type PlainObject,
} from '@shared/discordEmbedPreview/processEmbed';
import { getDisplayPlayerCount } from '@lib/fxserver/httpHealthCheck';
import { translateDiscord } from './discordLocale';

const defaultFooterIconUrl = 'https://cdn.discordapp.com/emojis/1062339910654246964.webp?size=96&quality=lossless';

const t = (key: string, data: Record<string, unknown> = {}) => {
    return translateDiscord(`status_message.${key}`, data);
};

const msg: (key: string, data?: Record<string, unknown>) => string = (key, data = {}) => t(key, data);

type GeneratePlayerListMessageOptions = {
    page?: number;
};

const isPlainObject = (value: unknown): value is PlainObject => {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
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

const buildPlayerListPlaceholderData = (embedConfigJson: PlainObject, requestedPage = 1) => {
    const players = txCore.fxPlayerlist.getPlayerList() as MockPlayer[];
    return buildPlayerListPlaceholderDataFromPlayers(embedConfigJson, players, msg, requestedPage);
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
    const playerCount = getDisplayPlayerCount();
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
        embedJson: embedJson as PlainObject,
        placeholders,
        playerListData,
    };
};

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

    return assembleDiscordEmbedMessage({
        embedJson,
        embedConfigJson,
        placeholders,
        playerListData,
        msg,
        options: {
            expandPlayerListFields: options?.expandPlayerListFields,
            includePlayerListPager: options?.includePlayerListPager,
            defaultFooter: {
                icon_url: defaultFooterIconUrl,
                text: `sxPanel ${txEnv.txaVersion} • ${t('footer_updated_every_minute')}`,
            },
        },
    });
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
