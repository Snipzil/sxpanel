const modulename = 'DiscordBot';
import { randomUUID } from 'node:crypto';
import { DuplicateKeyError } from '@modules/Database/dbUtils';
import { UpdateConfigKeySet } from '@modules/ConfigStore/utils';
import { txEnv } from '@core/globalData';
import consoleFactory from '@lib/console';
import { msToShortishDuration, now } from '@lib/misc';
import { findPlayersByIdentifier } from '@lib/player/playerFinder';
import type { DatabaseBotCommandEventType } from '@modules/Database/databaseTypes';
import { DiscordBotStatus } from '@shared/enums';
import type { BotCommandDenialReason, BotCommandResponseTelemetry } from '@shared/discordBotAnalyticsTypes';
import type { SystemLogActionId, SystemLogEntry } from '@shared/systemLogTypes';
import type { DatabaseTicketType } from '@shared/ticketApiTypes';
import { mergePermissions, resolveEffectiveAdminPermissions, resolveMappedRolePermissions } from './rolePermissions';
import BotProcess from './botProcess';
import BridgeServer, { BridgeMessage } from './bridgeServer';
import { buildDiscordCardMessageFromEmbed, buildDiscordCardMessageFromEmbeds } from './componentsV2';
import { generatePlayerListMessage, generateStatusMessage } from './statusMessage';
import {
    buildTicketQueueSummaryEmbed,
    buildTicketSummaryMessagePayload,
    escapeDiscordText,
    normalizeTicketCommandTicketId,
} from './ticketCommandUtils';
import {
    buildServerMenuDiscordPayload,
    buildSystemLogDiscordPayload,
    type DiscordLogMessagePayload,
} from './logRouting';
import { handleModerationCommand } from './moderationCommands';
import { getDiscordLocaleSnapshot, translateDiscord } from './discordLocale';

const console = consoleFactory(modulename);

type MessageTranslationType = {
    key: string;
    data?: object;
};

type AnnouncementType = {
    title?: string | MessageTranslationType;
    description: string | MessageTranslationType;
    type: 'info' | 'success' | 'warning' | 'danger';
};

type SpawnConfig = Pick<TxConfigs['discordBot'], 'enabled' | 'token' | 'guild' | 'warningsChannel'>;

type PersistentEmbedTarget = 'status' | 'playerList';

const persistentEmbedStateKeys = {
    status: {
        channelId: 'discord:status:channelId',
        messageId: 'discord:status:messageId',
    },
    playerList: {
        channelId: 'discord:playerlist:channelId',
        messageId: 'discord:playerlist:messageId',
        page: 'discord:playerlist:page',
    },
} as const;

const persistentEmbedMeta = {
    status: {
        displayName: 'Status embed',
        lowerName: 'status embed',
    },
    playerList: {
        displayName: 'Player list embed',
        lowerName: 'player list embed',
    },
} as const;

const resolvePersistentEmbedTarget = (value: unknown): PersistentEmbedTarget => {
    return value === 'playerList' || value === 'players' ? 'playerList' : 'status';
};

const translateBot = (key: string, data: Record<string, unknown> = {}) => {
    return translateDiscord(key, data);
};

const translatePlayerLookup = (key: string, data: Record<string, unknown> = {}) => {
    return translateBot(`player_lookup.${key}`, data);
};

const translateWhitelist = (key: string, data: Record<string, unknown> = {}) => {
    return translateBot(`whitelist.${key}`, data);
};

const translateTicketCommand = (key: string, data: Record<string, unknown> = {}) => {
    return translateBot(`tickets.queue.command.${key}`, data);
};

const getPersistentEmbedLocaleMeta = (target: PersistentEmbedTarget) => {
    const localeKey = target === 'playerList' ? 'player_list' : 'status';

    return {
        displayName: translateBot(`persistent_embed.${localeKey}.display_name`),
        lowerName: translateBot(`persistent_embed.${localeKey}.lower_name`),
        saved: translateBot(`persistent_embed.${localeKey}.saved`),
        removed: translateBot(`persistent_embed.${localeKey}.removed`),
    };
};

const translatePlayerLookupActionCount = (action: 'ban' | 'warn' | 'kick', count: number) => {
    return count === 1
        ? translateBot(`player_lookup.action_counts.${action}.one`)
        : translateBot(`player_lookup.action_counts.${action}.other`, { count });
};

const EPHEMERAL_MESSAGE_FLAG = 1 << 6;

type ReplyPayload = {
    flags?: number;
    content?: string;
    embeds?: Record<string, unknown>[];
    components?: Record<string, unknown>[];
};

type BridgeCommandResponse = {
    telemetry?: BotCommandResponseTelemetry;
    [key: string]: unknown;
};

type PendingStart = {
    resolve: (message: string) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
};

type DiscordBotAddonLoadFailure = {
    kind: 'command' | 'event';
    filePath: string;
    message: string;
    addonId: string | null;
    updatedAt: number;
};

type DiscordBotAddonRuntimeIssue = {
    addonId: string;
    interactionType: string;
    phase: 'execute' | 'rate_limit';
    handlerId: string;
    message: string;
    filePath: string | null;
    updatedAt: number;
    count: number;
};

type DiscordBotRecoverySource = 'manual' | 'automatic';

type DiscordBotRecoveryAction = {
    action: 'restartRuntime' | 'reloadAddons' | 'resyncRuntime';
    source: DiscordBotRecoverySource;
    ok: boolean;
    message: string;
    at: number;
};

const BRIDGE_AUTO_HEAL_DELAY_MS = 30_000;

const replyColors = {
    info: 0x1d76c9,
    success: 0x0ba70b,
    warning: 0xfff100,
    danger: 0xa70b28,
} as const;

const infoEmbedColor = 0x4262e2;
const commandFooter = {
    icon_url: 'https://cdn.discordapp.com/emojis/1062339910654246964.webp?size=96&quality=lossless',
    text: `fxPanel ${txEnv.txaVersion}`,
};

const buildReply = (type: keyof typeof replyColors, description: string, ephemeral = false): ReplyPayload => {
    return buildDiscordCardMessageFromEmbed(
        {
            description,
            color: replyColors[type],
        },
        {
            flags: ephemeral ? EPHEMERAL_MESSAGE_FLAG : undefined,
        },
    );
};

const withTelemetry = <T extends BridgeCommandResponse>(response: T, telemetry: BotCommandResponseTelemetry): T => {
    const existingTelemetry =
        response.telemetry && typeof response.telemetry === 'object' ? response.telemetry : undefined;

    return {
        ...response,
        telemetry: {
            ...existingTelemetry,
            ...telemetry,
        },
    };
};

const buildReplyResult = (
    type: keyof typeof replyColors,
    description: string,
    telemetry: BotCommandResponseTelemetry,
    ephemeral = false,
) => {
    return withTelemetry({ reply: buildReply(type, description, ephemeral) }, telemetry);
};

const buildDeniedReply = (
    type: keyof typeof replyColors,
    description: string,
    denialReason: BotCommandDenialReason,
    ephemeral = true,
) => {
    return buildReplyResult(type, description, { outcome: 'denied', denialReason }, ephemeral);
};

const buildFailedReply = (type: keyof typeof replyColors, description: string, ephemeral = true) => {
    return buildReplyResult(type, description, { outcome: 'failed' }, ephemeral);
};

const buildSuccessResponse = <T extends BridgeCommandResponse>(response: T): T => {
    return withTelemetry(response, { outcome: 'success' });
};

const normalizeBotCommandEvent = (message: BridgeMessage): DatabaseBotCommandEventType | null => {
    const payload = message.payload;
    if (!payload || typeof payload !== 'object') return null;

    const rawEvent = payload as Record<string, unknown>;
    const outcome = rawEvent.outcome;
    if (
        typeof rawEvent.id !== 'string' ||
        typeof rawEvent.ts !== 'number' ||
        typeof rawEvent.commandName !== 'string' ||
        (outcome !== 'success' && outcome !== 'denied' && outcome !== 'failed' && outcome !== 'timed_out')
    ) {
        return null;
    }

    const denialReason =
        rawEvent.denialReason === 'unlinked_account' ||
        rawEvent.denialReason === 'missing_permissions' ||
        rawEvent.denialReason === 'invalid_target' ||
        rawEvent.denialReason === 'feature_disabled' ||
        rawEvent.denialReason === 'invalid_request' ||
        rawEvent.denialReason === 'rate_limited' ||
        rawEvent.denialReason === 'unknown'
            ? rawEvent.denialReason
            : undefined;

    return {
        id: rawEvent.id,
        ts: rawEvent.ts,
        commandName: rawEvent.commandName,
        outcome,
        ...(denialReason ? { denialReason } : {}),
        ...(typeof rawEvent.requestType === 'string' ? { requestType: rawEvent.requestType } : {}),
        ...(typeof rawEvent.bridgeRequestCount === 'number' ? { bridgeRequestCount: rawEvent.bridgeRequestCount } : {}),
        ...(typeof rawEvent.interactionAckMs === 'number' ? { interactionAckMs: rawEvent.interactionAckMs } : {}),
        ...(typeof rawEvent.bridgeRoundtripMs === 'number' ? { bridgeRoundtripMs: rawEvent.bridgeRoundtripMs } : {}),
        ...(typeof rawEvent.handlerDurationMs === 'number' ? { handlerDurationMs: rawEvent.handlerDurationMs } : {}),
    };
};

const logDiscordAdminAction = (adminName: string, message: string, actionId?: SystemLogActionId) => {
    txCore.logger.system.write(adminName, message, 'action', { actionId });
};

const resolveAdminUser = (requesterId: unknown) => {
    if (typeof requesterId !== 'string' || !requesterId.length) {
        return buildDeniedReply('danger', translateBot('common.could_not_resolve_user'), 'invalid_request');
    }

    const admin = txCore.adminStore.getAdminByProviderUID(requesterId);
    if (!admin) {
        return buildDeniedReply(
            'warning',
            translateBot('common.no_fxpanel_access', { requesterId }),
            'unlinked_account',
        );
    }

    return { admin };
};

const resolveMappedRolePermission = (requesterId: unknown, memberRoles: unknown, reqPerm: string) => {
    const mappedRolePermissions = resolveMappedRolePermissions(memberRoles);
    if (!mappedRolePermissions) {
        if (typeof requesterId !== 'string' || !requesterId.length) {
            return buildDeniedReply('danger', translateBot('common.could_not_resolve_user'), 'invalid_request');
        }

        return buildDeniedReply(
            'warning',
            translateBot('moderation.access.no_access', { requesterId }),
            'unlinked_account',
        );
    }

    if (
        !mappedRolePermissions.permissions.includes('all_permissions') &&
        !mappedRolePermissions.permissions.includes(reqPerm)
    ) {
        const permissionLabel = txCore.adminStore.registeredPermissions[reqPerm] ?? reqPerm;
        return buildDeniedReply(
            'danger',
            translateBot('moderation.access.discord_role_missing_permission', { permissionLabel }),
            'missing_permissions',
        );
    }

    return {
        source: 'role' as const,
        resolvedName: mappedRolePermissions.labels.join(', '),
        actorName: `[Discord] ${mappedRolePermissions.labels.join(', ')}`,
    };
};

const buildAddonRequestHeaders = (headers: unknown, requesterId: unknown, requesterName: unknown) => {
    const sanitizedHeaders =
        headers && typeof headers === 'object'
            ? Object.fromEntries(
                  Object.entries(headers).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
              )
            : {};

    if (typeof requesterId === 'string' && requesterId.length) {
        sanitizedHeaders['x-fxpanel-discord-user-id'] = requesterId;
    }
    if (typeof requesterName === 'string' && requesterName.length) {
        sanitizedHeaders['x-fxpanel-discord-user-name'] = requesterName;
    }

    return sanitizedHeaders;
};

const resolveAddonAdminContext = (requesterId: unknown, requesterName: unknown, memberRoles: unknown) => {
    if (typeof requesterId === 'string' && requesterId.length) {
        const admin = txCore.adminStore.getAdminByProviderUID(requesterId);
        if (admin) {
            const effectivePermissions = resolveEffectiveAdminPermissions(admin, memberRoles).permissions;
            return {
                name: admin.name,
                permissions: effectivePermissions,
                isMaster: admin.isMaster === true,
            };
        }
    }

    const mappedRolePermissions = resolveMappedRolePermissions(memberRoles);
    if (mappedRolePermissions) {
        return {
            name: `[Discord] ${mappedRolePermissions.labels.join(', ')}`,
            permissions: mappedRolePermissions.permissions,
            isMaster: false,
        };
    }

    const fallbackName =
        typeof requesterName === 'string' && requesterName.trim().length
            ? requesterName.trim()
            : typeof requesterId === 'string' && requesterId.length
              ? requesterId
              : 'Unknown';

    return {
        name: `[Discord] ${fallbackName}`,
        permissions: [],
        isMaster: false,
    };
};

const resolveAdminPermission = (requesterId: unknown, memberRoles: unknown, reqPerm: string) => {
    if (typeof requesterId !== 'string' || !requesterId.length) {
        return buildDeniedReply('danger', translateBot('common.could_not_resolve_user'), 'invalid_request');
    }

    const admin = txCore.adminStore.getAdminByProviderUID(requesterId);
    if (admin) {
        const { mappedRolePermissions, permissions: effectivePermissions } = resolveEffectiveAdminPermissions(
            admin,
            memberRoles,
        );
        if (
            admin.isMaster !== true &&
            !effectivePermissions.includes('all_permissions') &&
            !effectivePermissions.includes(reqPerm)
        ) {
            const permissionLabel = txCore.adminStore.registeredPermissions[reqPerm] ?? reqPerm;
            return buildDeniedReply(
                'danger',
                translateBot(
                    mappedRolePermissions
                        ? 'moderation.access.missing_permission_mapped'
                        : 'moderation.access.missing_permission',
                    { permissionLabel },
                ),
                'missing_permissions',
            );
        }

        return {
            admin,
            source: 'admin' as const,
            resolvedName: admin.name,
            actorName: admin.name,
        };
    }

    return resolveMappedRolePermission(requesterId, memberRoles, reqPerm);
};

const buildPlayerLookupReply = (searchId: unknown, adminView: boolean, requesterId: unknown) => {
    if (adminView) {
        const adminResult = resolveAdminUser(requesterId);
        if ('reply' in adminResult) return adminResult;
    }

    if (typeof searchId !== 'string' || !searchId.trim().length) {
        return buildDeniedReply('danger', translateBot('common.invalid_identifier'), 'invalid_target');
    }

    let players;
    try {
        players = findPlayersByIdentifier(searchId.trim().toLowerCase());
    } catch (error) {
        return buildFailedReply('danger', translatePlayerLookup('lookup_failed', { message: emsg(error) }));
    }

    if (!players.length) {
        return buildDeniedReply(
            'warning',
            translatePlayerLookup('no_players_found', { searchId }),
            'invalid_target',
            false,
        );
    }

    if (players.length > 10) {
        return buildDeniedReply(
            'warning',
            translatePlayerLookup('too_many_players', { searchId }),
            'invalid_target',
            false,
        );
    }

    const formatDate = (ts: number) => {
        return new Date(ts * 1000).toLocaleDateString(txCore.translator.canonical, { dateStyle: 'long' });
    };
    const truncate = (input: string, maxLen = 1000) => {
        return input.length > maxLen ? `${input.substring(0, maxLen)}…` : input;
    };

    const embeds = [] as Record<string, unknown>[];
    for (const player of players) {
        const dbData = player.getDbData();
        if (!dbData) continue;

        const bodyText: Record<string, string> = {
            [translatePlayerLookup('fields.play_time')]: msToShortishDuration(dbData.playTime * 60 * 1000),
            [translatePlayerLookup('fields.join_date')]: formatDate(dbData.tsJoined),
            [translatePlayerLookup('fields.last_connection')]: formatDate(dbData.tsLastConnection),
            [translatePlayerLookup('fields.whitelisted')]: dbData.tsWhitelisted
                ? formatDate(dbData.tsWhitelisted)
                : translatePlayerLookup('values.not_yet'),
        };

        const embed: Record<string, unknown> = {
            title: player.displayName,
            color: infoEmbedColor,
            footer: commandFooter,
        };

        if (adminView) {
            const actionHistory = player.getHistory();
            const actionCount = { ban: 0, warn: 0, kick: 0 };
            for (const entry of actionHistory) {
                if (entry.type in actionCount) {
                    actionCount[entry.type as keyof typeof actionCount]++;
                }
            }

            const banText = translatePlayerLookupActionCount('ban', actionCount.ban);
            const warnText = translatePlayerLookupActionCount('warn', actionCount.warn);
            const kickText = translatePlayerLookupActionCount('kick', actionCount.kick);
            bodyText[translatePlayerLookup('fields.log')] = translatePlayerLookup('log_summary', {
                banText,
                warnText,
                kickText,
            });

            const notesText = dbData.notes ? dbData.notes.text : translatePlayerLookup('values.nothing_here');
            const idsText = dbData.ids.length ? dbData.ids.join('\n') : translatePlayerLookup('values.nothing_here');
            embed.fields = [
                {
                    name: translatePlayerLookup('fields.notes'),
                    value: `\`\`\`${truncate(notesText)}\`\`\``,
                },
                {
                    name: translatePlayerLookup('fields.identifiers'),
                    value: `\`\`\`${truncate(idsText)}\`\`\``,
                },
            ];
        }

        embed.description = Object.entries(bodyText)
            .map(([label, value]) => `**• ${label}:** \`${value}\``)
            .join('\n');
        embeds.push(embed);
    }

    return buildSuccessResponse({ reply: buildDiscordCardMessageFromEmbeds(embeds) });
};

const buildEmbedReply = (embed: Record<string, unknown>, ephemeral = true) => {
    return buildSuccessResponse({
        reply: buildDiscordCardMessageFromEmbed(embed, {
            flags: ephemeral ? EPHEMERAL_MESSAGE_FLAG : undefined,
        }),
    });
};

const resolveTicketFromMessage = (message: BridgeMessage) => {
    const normalizedTicketId = normalizeTicketCommandTicketId(message.ticketId);
    if (normalizedTicketId) {
        const ticket = txCore.database.tickets.findOne(normalizedTicketId);
        if (!ticket) {
            return buildDeniedReply(
                'warning',
                translateTicketCommand('ticket_not_found', { ticketId: normalizedTicketId }),
                'invalid_target',
            );
        }

        return { ticket };
    }

    if (typeof message.threadId === 'string' && message.threadId.length) {
        const ticket = txCore.database.tickets.findByDiscordThread(message.threadId);
        if (!ticket) {
            return buildDeniedReply('warning', translateTicketCommand('thread_not_linked'), 'invalid_target');
        }

        return { ticket };
    }

    return buildDeniedReply(
        'danger',
        translateTicketCommand('provide_ticket_or_thread'),
        'invalid_target',
    );
};

const buildTicketCommandSummaryReply = (
    ticket: DatabaseTicketType,
    options?: { title?: string; note?: string; color?: number },
) => {
    const messagePayload = buildTicketSummaryMessagePayload(ticket, {
            title: options?.title,
            note: options?.note,
            color: options?.color,
            footer: commandFooter,
    });

    return buildSuccessResponse({
        reply: {
            flags: EPHEMERAL_MESSAGE_FLAG,
            ...messagePayload,
        },
        messagePayload,
    });
};

/**
 * Module that handles the discord bot bridge, provides methods to resolve members and send announcements,
 * as well as the standalone bot process lifecycle.
 */
export default class DiscordBot {
    static readonly configKeysWatched = [
        'discordBot.embedJson',
        'discordBot.embedConfigJson',
        'discordBot.playerListEmbedJson',
        'discordBot.playerListEmbedConfigJson',
        'discordBot.presence',
        'discordBot.customCommands',
        'discordBot.rolePermissions',
        'discordBot.logRoutes',
    ];

    readonly cooldowns = new Map();
    readonly #botProcess: BotProcess;
    #bridgeServer: BridgeServer | undefined;
    #bridgeRuntimeConfig: { port: number; secret: string } | undefined;
    #pendingStart: PendingStart | undefined;
    #closingBridge = false;
    #ignoreNextBridgeDisconnect = false;
    #runtimeBridgeSecret: string | undefined;
    #lastGuildMembersCacheRefresh = 0;
    #lastStatus = DiscordBotStatus.Disabled;
    #lastExplicitStatus = DiscordBotStatus.Disabled;
    #activeBotConfig: SpawnConfig | false | undefined;
    #lastReadyAt: number | undefined;
    #lastBridgeAuthenticatedAt: number | undefined;
    #lastBridgeDisconnectedAt: number | undefined;
    #bridgeDisconnectedSince: number | undefined;
    #bridgeConnectCount = 0;
    #bridgeDisconnectCount = 0;
    #lastReconnectDurationMs: number | undefined;
    #bridgeAutoHealAt: number | undefined;
    #bridgeAutoHealTimer: NodeJS.Timeout | undefined;
    #lastBotError:
        | {
              code: string | null;
              message: string;
              at: number;
          }
        | undefined;
    #lastProcessFailure:
        | {
              reason: string;
              at: number;
          }
        | undefined;
    #lastRecoveryAction: DiscordBotRecoveryAction | undefined;
    #runtimeDiagnostics: {
        addonLoadFailures: DiscordBotAddonLoadFailure[];
        addonRuntimeIssues: DiscordBotAddonRuntimeIssue[];
        updatedAt: number | undefined;
    } = {
        addonLoadFailures: [],
        addonRuntimeIssues: [],
        updatedAt: undefined,
    };
    guildName: string | undefined;

    constructor() {
        this.#botProcess = new BotProcess({
            onError: ({ reason }) => {
                this.#handleBotProcessFailure(reason);
            },
            onExit: ({ reason }) => {
                this.#handleBotProcessFailure(reason);
            },
        });

        setImmediate(() => {
            if (txConfig.discordBot.enabled) {
                this.startBot().catch((error) => {
                    console.error(`Initial Discord bot startup failed: ${emsg(error)}`);
                });
            }
        });

        setInterval(() => {
            if (this.#isBotEnabled()) {
                this.updateBotStatus().catch(() => {});
                this.#syncDiscordLinkedAdminAuths().catch(() => {});
            }
        }, 60_000);
        setInterval(() => {
            this.refreshWsStatus();
        }, 7500);
    }

    public handleConfigUpdate(updatedConfigs: UpdateConfigKeySet) {
        if (!this.#isBotEnabled()) return false;

        const shouldReloadCommands = updatedConfigs.hasMatch('discordBot.customCommands');
        const shouldRefreshAdminAuths = updatedConfigs.hasMatch('discordBot.rolePermissions');

        if (shouldReloadCommands && this.#bridgeServer?.isReady) {
            this.#bridgeServer.send({ type: 'reloadCommands' });
        }
        if (shouldRefreshAdminAuths) {
            txCore.webServer.webSocket.reCheckAdminAuths().catch(() => {});
        }

        return this.updateBotStatus();
    }

    public handleAddonReload() {
        if (!this.#bridgeServer?.isReady) return false;

        this.#bridgeServer.send({ type: 'configSnapshot', payload: this.#buildConfigSnapshot() });
        this.#bridgeServer.send({ type: 'reloadCommands' });
        return true;
    }

    public handleShutdown() {
        this.#rejectPendingStart(new Error('Discord bot shutdown.'));
        this.#clearBridgeAutoHealTimer();
        void this.#stopRuntime();
    }

    async attemptBotReset(botCfg: SpawnConfig | false) {
        this.#lastGuildMembersCacheRefresh = 0;
        this.#activeBotConfig = botCfg;
        this.#rejectPendingStart(new Error('Discord bot restart superseded.'));

        if (!botCfg || !botCfg.enabled) {
            this.#clearBridgeAutoHealTimer();
            await this.#stopRuntime();
            this.guildName = undefined;
            this.#lastExplicitStatus = DiscordBotStatus.Disabled;
            this.refreshWsStatus();
            return true;
        }

        return await this.startBot(botCfg);
    }

    get isClientReady() {
        return this.#bridgeServer?.isReady === true && this.#lastExplicitStatus === DiscordBotStatus.Ready;
    }

    get status(): DiscordBotStatus {
        if (!this.#isBotEnabled()) {
            return DiscordBotStatus.Disabled;
        }

        if (this.isClientReady) {
            return DiscordBotStatus.Ready;
        }

        return this.#lastExplicitStatus;
    }

    getDiagnostics() {
        const currentTs = Date.now();

        return {
            enabled: this.#isBotEnabled(),
            status: this.status,
            isClientReady: this.isClientReady,
            guildName: this.guildName ?? null,
            lastReadyAt: this.#lastReadyAt ?? null,
            lastBotError: this.#lastBotError ?? null,
            lastProcessFailure: this.#lastProcessFailure ?? null,
            lastRecoveryAction: this.#lastRecoveryAction ?? null,
            bridge: {
                isConnected: this.#bridgeServer?.isReady === true,
                connectCount: this.#bridgeConnectCount,
                disconnectCount: this.#bridgeDisconnectCount,
                lastAuthenticatedAt: this.#lastBridgeAuthenticatedAt ?? null,
                lastDisconnectedAt: this.#lastBridgeDisconnectedAt ?? null,
                disconnectedForMs: this.#bridgeDisconnectedSince ? currentTs - this.#bridgeDisconnectedSince : null,
                lastReconnectDurationMs: this.#lastReconnectDurationMs ?? null,
                autoHealAt: this.#bridgeAutoHealAt ?? null,
            },
            process: {
                isRunning: this.#botProcess.isRunning,
                hasPendingRestart: this.#botProcess.hasPendingRestart,
                nextRestartDelayMs: this.#botProcess.nextRestartDelayMs,
                lastOutputLine: this.#botProcess.lastOutputLine ?? null,
                lastErrorLine: this.#botProcess.lastErrorLine ?? null,
            },
            runtime: {
                addonLoadFailures: this.#runtimeDiagnostics.addonLoadFailures,
                addonRuntimeIssues: this.#runtimeDiagnostics.addonRuntimeIssues,
                updatedAt: this.#runtimeDiagnostics.updatedAt ?? null,
            },
        };
    }

    async restartRuntime(source: DiscordBotRecoverySource = 'manual') {
        const botCfg = this.#getCurrentSpawnConfig();
        if (!botCfg?.enabled) {
            const error = new Error('Discord bot is disabled.');
            this.#recordRecoveryAction('restartRuntime', source, false, error.message);
            throw error;
        }

        try {
            const result = await this.attemptBotReset(botCfg);
            const message = typeof result === 'string' ? result : 'Discord bot restart requested.';
            this.#recordRecoveryAction('restartRuntime', source, true, message);
            return message;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.#recordRecoveryAction('restartRuntime', source, false, message);
            throw error;
        }
    }

    async reloadRuntimeAddons(source: DiscordBotRecoverySource = 'manual') {
        if (!this.handleAddonReload()) {
            const error = new Error('Discord bridge is not connected.');
            this.#recordRecoveryAction('reloadAddons', source, false, error.message);
            throw error;
        }

        const message = 'Discord bot addon commands and events reload requested.';
        this.#recordRecoveryAction('reloadAddons', source, true, message);
        return message;
    }

    async resyncRuntime(source: DiscordBotRecoverySource = 'manual') {
        const updated = await this.updateBotStatus();
        if (!updated) {
            const error = new Error('Discord bridge is not connected.');
            this.#recordRecoveryAction('resyncRuntime', source, false, error.message);
            throw error;
        }

        const message = 'Discord bot config snapshot, presence, and embeds were resynced.';
        this.#recordRecoveryAction('resyncRuntime', source, true, message);
        return message;
    }

    applyRuntimeDiagnostics(payload: {
        addonLoadFailures?: DiscordBotAddonLoadFailure[];
        addonRuntimeIssues?: DiscordBotAddonRuntimeIssue[];
        updatedAt?: number;
    }) {
        if (Array.isArray(payload.addonLoadFailures)) {
            this.#runtimeDiagnostics.addonLoadFailures = payload.addonLoadFailures.map((entry) => ({
                kind: entry.kind === 'event' ? 'event' : 'command',
                filePath: String(entry.filePath ?? ''),
                message: String(entry.message ?? ''),
                addonId: typeof entry.addonId === 'string' && entry.addonId.length ? entry.addonId : null,
                updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : Date.now(),
            }));
        }

        if (Array.isArray(payload.addonRuntimeIssues)) {
            this.#runtimeDiagnostics.addonRuntimeIssues = payload.addonRuntimeIssues.map((entry) => ({
                addonId: String(entry.addonId ?? ''),
                interactionType: String(entry.interactionType ?? ''),
                phase: entry.phase === 'rate_limit' ? 'rate_limit' : 'execute',
                handlerId: String(entry.handlerId ?? ''),
                message: String(entry.message ?? ''),
                filePath: typeof entry.filePath === 'string' && entry.filePath.length ? entry.filePath : null,
                updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : Date.now(),
                count: typeof entry.count === 'number' && entry.count > 0 ? entry.count : 1,
            }));
        }

        this.#runtimeDiagnostics.updatedAt =
            typeof payload.updatedAt === 'number' ? payload.updatedAt : Date.now();
    }

    refreshWsStatus() {
        if (this.#lastStatus !== this.status) {
            this.#lastStatus = this.status;
            txCore.webServer.webSocket.pushRefresh('status');
        }
    }

    async sendAnnouncement(content: AnnouncementType) {
        if (!this.#isBotEnabled()) return;
        if (!this.#bridgeServer?.isReady) {
            console.verbose.warn('not ready yet to send announcement');
            return false;
        }

        try {
            this.#bridgeServer.send({
                type: 'sendAnnouncement',
                title: this.#translate(content.title),
                description: this.#translate(content.description),
                announcementType: content.type,
            });
            return true;
        } catch (error) {
            console.error(`Error sending Discord announcement: ${emsg(error)}`);
            return false;
        }
    }

    async postLogMessage(payload: DiscordLogMessagePayload) {
        if (!this.#isBotEnabled()) return false;
        if (!this.#bridgeServer?.isReady) return false;

        const channelId = typeof payload.channelId === 'string' ? payload.channelId.trim() : '';
        if (!channelId.length || !Array.isArray(payload.components) || payload.components.length === 0) {
            return false;
        }

        this.#bridgeServer.send({
            type: 'postLogMessage',
            payload: {
                channelId,
                guildId:
                    typeof payload.guildId === 'string' && payload.guildId.length
                        ? payload.guildId
                        : (txConfig.discordBot.logGuildOverride ?? txConfig.discordBot.guild ?? null),
                flags: payload.flags,
                components: payload.components,
                allowedMentions: payload.allowedMentions,
            },
        });
        return true;
    }

    async handleSystemLogEntry(entry: SystemLogEntry) {
        const payload = buildSystemLogDiscordPayload(txConfig.discordBot.logRoutes, entry);
        if (!payload) return false;

        return await this.postLogMessage(payload);
    }

    async handleServerLogEvent(rawEvent: { type?: unknown; data?: unknown }, logEntry: { ts: number; src: { id: string | false; name: string }; msg: string; type: string }) {
        const payload = buildServerMenuDiscordPayload(txConfig.discordBot.logRoutes, rawEvent, logEntry);
        if (!payload) return false;

        return await this.postLogMessage(payload);
    }

    async updateBotStatus() {
        if (!this.#bridgeServer?.isReady) {
            console.verbose.warn('not ready yet to update status');
            return false;
        }

        const snapshot = this.#buildConfigSnapshot();
        this.#bridgeServer.send({ type: 'configSnapshot', payload: snapshot });
        this.#bridgeServer.send({ type: 'updatePresence', payload: snapshot.discordBot.presence });

        for (const target of ['status', 'playerList'] as const) {
            const { channelId, messageId } = this.#getPersistentEmbedState(target);
            if (!channelId || !messageId) continue;

            try {
                this.#bridgeServer.send({
                    type: 'updateStatusEmbed',
                    payload: {
                        channelId,
                        messageId,
                        messagePayload: this.#buildPersistentEmbedMessagePayload(target),
                    },
                });
            } catch (error) {
                console.verbose.warn(`Failed to update ${persistentEmbedMeta[target].lowerName}: ${emsg(error)}`);
            }
        }

        return true;
    }

    startBot(botCfg?: SpawnConfig) {
        botCfg ??= this.#getCurrentSpawnConfig();
        if (!botCfg?.enabled) return;
        if (typeof botCfg.token !== 'string' || !botCfg.token.length) {
            throw this.#buildError('Discord bot enabled while token is not set.');
        }
        if (typeof botCfg.guild !== 'string' || !botCfg.guild.length) {
            throw this.#buildError('Discord bot enabled while guild id is not set.');
        }

        this.#activeBotConfig = botCfg;

        return (async () => {
            const bridgePort = txConfig.discordBot.bridgePort;
            const bridgeSecret = this.#getBridgeSecret();
            await this.#ensureBridgeServer(bridgePort, bridgeSecret);

            this.guildName = undefined;
            this.#lastExplicitStatus = DiscordBotStatus.Starting;
            this.refreshWsStatus();

            this.#ignoreNextBridgeDisconnect = this.#bridgeServer?.isReady === true && this.#botProcess.isRunning;
            const waitForReady = this.#createStartPromise();
            this.#botProcess.restart({
                token: botCfg.token,
                guild: botCfg.guild,
                bridgePort,
                secret: bridgeSecret,
            });

            try {
                return await waitForReady;
            } catch (error) {
                this.#ignoreNextBridgeDisconnect = false;
                this.#lastExplicitStatus = DiscordBotStatus.Error;
                this.refreshWsStatus();
                this.#botProcess.stop();
                throw error;
            }
        })();
    }

    async createTicketThread(
        channelId: string,
        threadName: string,
        ticket: DatabaseTicketType,
        screenshotBuffer?: Buffer,
    ): Promise<void> {
        if (!this.#bridgeServer?.isReady) throw new Error('discord bot not ready yet');

        const messagePayload = buildTicketSummaryMessagePayload(ticket, {
            footer: commandFooter,
        });

        const response = (await this.#bridgeServer.request('createTicketThread', {
            channelId,
            threadName,
            ticket,
            messagePayload,
            screenshotBase64: screenshotBuffer ? screenshotBuffer.toString('base64') : undefined,
        })) as { threadId?: string };

        if (!response?.threadId) {
            throw new Error('Discord bridge did not return a thread id.');
        }

        txCore.database.tickets.setDiscordThread(ticket.id, response.threadId);
    }

    async postTicketThreadMessage(
        ticketId: string,
        authorName: string,
        content: string,
        imageUrls?: string[],
    ): Promise<void> {
        if (!this.#bridgeServer?.isReady) return;

        const threadId = txCore.database.tickets.getDiscordThreadId(ticketId);
        if (!threadId) return;

        this.#bridgeServer.send({
            type: 'postTicketMessage',
            threadId,
            authorName,
            content,
            imageUrls,
        });
    }

    async refreshMemberCache() {
        if (!this.#isBotEnabled()) throw new Error('discord bot is disabled');
        if (!this.#bridgeServer?.isReady) throw new Error('discord bot not ready yet');

        const currTs = Date.now();
        if (currTs - this.#lastGuildMembersCacheRefresh <= 60_000) {
            return false;
        }

        const refreshed = await this.#bridgeServer.request('refreshMemberCache');
        if (refreshed) {
            this.#lastGuildMembersCacheRefresh = currTs;
            return true;
        }

        return false;
    }

    async #syncDiscordLinkedAdminAuths() {
        if (!this.isClientReady) return false;
        if (!txConfig.discordBot.rolePermissions.length) return false;

        try {
            await this.refreshMemberCache();
        } catch {
            // Role checks can still resolve individual members even if a bulk refresh fails.
        }

        await txCore.webServer.webSocket.reCheckAdminAuths();
        return true;
    }

    async resolveMemberRoles(uid: string) {
        if (!this.#isBotEnabled()) throw new Error('discord bot is disabled');
        if (!this.#bridgeServer?.isReady) throw new Error('discord bot not ready yet');

        return (await this.#bridgeServer.request('resolveMemberRoles', { uid })) as {
            isMember: boolean;
            memberRoles?: string[];
        };
    }

    async resolveMemberProfile(uid: string) {
        if (!this.#bridgeServer?.isReady) throw new Error('discord bot not ready yet');

        return (await this.#bridgeServer.request('resolveMemberProfile', { uid })) as {
            tag: string;
            avatar: string;
        };
    }

    readonly #handleBridgePushMessage = async (message: BridgeMessage) => {
        switch (message.type) {
            case 'botStatus': {
                this.#handleBotStatus(message);
                return;
            }
            case 'botDiagnostics': {
                this.applyRuntimeDiagnostics((message.payload ?? message.diagnostics ?? {}) as {
                    addonLoadFailures?: DiscordBotAddonLoadFailure[];
                    addonRuntimeIssues?: DiscordBotAddonRuntimeIssue[];
                    updatedAt?: number;
                });
                return;
            }
            case 'botCommandUsage': {
                if (typeof message.commandName === 'string') {
                    txManager.txRuntime.botCommands.count(message.commandName);
                }
                return;
            }
            case 'botCommandTelemetry': {
                const event = normalizeBotCommandEvent(message);
                if (event) {
                    txCore.database.botAnalytics.recordCommandEvent(event);
                }
                return;
            }
            case 'syncAdminDiscordRoleChange': {
                await this.#handleAdminDiscordRoleChange(message);
                return;
            }
            case 'ticketThreadMessage': {
                this.#handleTicketThreadMessage(message);
                return;
            }
            default: {
                console.verbose.warn(`Unhandled Discord bridge push message: ${message.type}`);
            }
        }
    };

    async #handleAdminDiscordRoleChange(message: BridgeMessage) {
        const discordId = typeof message.uid === 'string' ? message.uid.trim() : '';
        if (!discordId.length) return false;

        const linkedAdmin = txCore.adminStore.getAdminByProviderUID(discordId);
        if (!linkedAdmin?.providers.discord) return false;

        const addedRoleIds = Array.isArray(message.addedRoleIds)
            ? message.addedRoleIds.filter((roleId): roleId is string => typeof roleId === 'string' && roleId.length > 0)
            : [];
        const removedRoleIds = Array.isArray(message.removedRoleIds)
            ? message.removedRoleIds.filter((roleId): roleId is string => typeof roleId === 'string' && roleId.length > 0)
            : [];
        const changedRoleIds = [...new Set([...addedRoleIds, ...removedRoleIds])];
        if (!changedRoleIds.length) return false;

        const touchesMappedRole = txConfig.discordBot.rolePermissions.some((mapping) => {
            return mapping.discordRoleIds.some((roleId) => changedRoleIds.includes(roleId));
        });
        if (!touchesMappedRole) return false;

        const roleLookup = await this.resolveMemberRoles(discordId).catch(() => ({ isMember: false, memberRoles: [] }));
        const memberRoles = roleLookup.isMember === true && Array.isArray(roleLookup.memberRoles)
            ? roleLookup.memberRoles
            : [];
        const mappedRolePermissions = resolveMappedRolePermissions(memberRoles);

        await txCore.adminStore.syncAdminDiscordRolePermissions(
            discordId,
            mappedRolePermissions
                ? {
                      permissions: mappedRolePermissions.permissions,
                      presetIds: mappedRolePermissions.presetIds,
                      roleIds: memberRoles,
                  }
                : false,
        );

        return true;
    }

    #attachBridgeRequestTelemetry(message: BridgeMessage, response: unknown, handlerStartedAt: number) {
        const requestType = typeof message.type === 'string' ? message.type : 'unknown';
        const handlerDurationMs = Math.max(0, Date.now() - handlerStartedAt);

        if (!response || typeof response !== 'object' || Array.isArray(response)) {
            return {
                payload: response,
                telemetry: {
                    outcome: 'success',
                    requestType,
                    handlerDurationMs,
                },
            };
        }

        const typedResponse = response as BridgeCommandResponse;
        return {
            ...typedResponse,
            telemetry: {
                outcome: 'success',
                ...(typedResponse.telemetry ?? {}),
                requestType,
                handlerDurationMs,
            },
        };
    }

    readonly #handleBridgeRequest = async (message: BridgeMessage) => {
        const handlerStartedAt = Date.now();
        let response: unknown;

        switch (message.type) {
            case 'configSnapshot': {
                response = this.#buildConfigSnapshot();
                break;
            }
            case 'playerLookup': {
                response = buildPlayerLookupReply(message.searchId, message.adminView === true, message.requesterId);
                break;
            }
            case 'permissionCheck': {
                const permissionResult = resolveAdminPermission(
                    message.requesterId,
                    message.memberRoles,
                    String(message.requiredPermission ?? ''),
                );
                if ('reply' in permissionResult) {
                    response = withTelemetry({ granted: false }, permissionResult.telemetry ?? { outcome: 'denied', denialReason: 'missing_permissions' });
                    break;
                }

                response = buildSuccessResponse({
                    granted: true,
                    resolvedName: permissionResult.resolvedName,
                    source: permissionResult.source,
                });
                break;
            }
            case 'whitelistCommand': {
                response = this.#handleWhitelistCommand(message);
                break;
            }
            case 'ticketCommand': {
                response = this.#handleTicketCommand(message);
                break;
            }
            case 'moderationCommand': {
                response = await handleModerationCommand(message, {
                    buildReply,
                    adminStore: txCore.adminStore,
                    logAction: logDiscordAdminAction,
                    footer: commandFooter,
                    infoEmbedColor,
                });
                break;
            }
            case 'persistentEmbedCommand':
            case 'statusEmbedCommand': {
                response = this.#handlePersistentEmbedCommand(message);
                break;
            }
            case 'persistentEmbedPage': {
                response = this.#handlePersistentEmbedPageRequest(message);
                break;
            }
            case 'addonRoute': {
                response = await this.#handleAddonRouteRequest(message);
                break;
            }
            default: {
                throw new Error(`Unhandled Discord bridge request type: ${message.type}`);
            }
        }

        return this.#attachBridgeRequestTelemetry(message, response, handlerStartedAt);
    };

    async #ensureBridgeServer(port: number, secret: string) {
        if (
            this.#bridgeServer &&
            this.#bridgeRuntimeConfig?.port === port &&
            this.#bridgeRuntimeConfig.secret === secret
        ) {
            await this.#bridgeServer.listen();
            return;
        }

        await this.#closeBridgeServer();
        this.#bridgeRuntimeConfig = { port, secret };
        this.#bridgeServer = new BridgeServer({
            port,
            secret,
            onAuthenticated: () => {
                const currentTs = Date.now();
                this.#bridgeConnectCount += 1;
                this.#lastBridgeAuthenticatedAt = currentTs;
                if (this.#bridgeDisconnectedSince) {
                    this.#lastReconnectDurationMs = currentTs - this.#bridgeDisconnectedSince;
                }
                this.#bridgeDisconnectedSince = undefined;
                this.#clearBridgeAutoHealTimer();
            },
            onDisconnected: () => {
                if (this.#ignoreNextBridgeDisconnect) {
                    this.#ignoreNextBridgeDisconnect = false;
                    return;
                }
                if (this.#closingBridge || !this.#isBotEnabled()) return;
                this.#lastBridgeDisconnectedAt = Date.now();
                this.#bridgeDisconnectCount += 1;
                this.#bridgeDisconnectedSince ??= this.#lastBridgeDisconnectedAt;
                this.#lastExplicitStatus = DiscordBotStatus.Error;
                this.refreshWsStatus();
                if (this.#pendingStart) {
                    this.#botProcess.stop();
                    this.#rejectPendingStart(new Error('Discord bridge disconnected before the bot reported ready.'));
                    return;
                }

                this.#scheduleBridgeAutoHeal();
            },
            onPushMessage: this.#handleBridgePushMessage,
            onRequest: this.#handleBridgeRequest,
        });
        await this.#bridgeServer.listen();
    }

    async #stopRuntime() {
        this.#clearBridgeAutoHealTimer();
        this.#botProcess.stop();
        await this.#closeBridgeServer();
    }

    async #closeBridgeServer() {
        if (!this.#bridgeServer) return;

        this.#closingBridge = true;
        try {
            await this.#bridgeServer.close();
        } finally {
            this.#closingBridge = false;
        }
    }

    #createStartPromise() {
        this.#rejectPendingStart(new Error('Discord bot startup superseded.'));

        const waitForReady = new Promise<string>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.#pendingStart = undefined;
                reject(new Error('Discord bot startup timed out.'));
            }, 20_000);
            this.#pendingStart = { resolve, reject, timer };
        });

        void waitForReady.catch(() => {});
        return waitForReady;
    }

    #resolvePendingStart(message: string) {
        if (!this.#pendingStart) return;

        clearTimeout(this.#pendingStart.timer);
        this.#pendingStart.resolve(message);
        this.#pendingStart = undefined;
    }

    #rejectPendingStart(error: Error) {
        if (!this.#pendingStart) return;

        clearTimeout(this.#pendingStart.timer);
        this.#pendingStart.reject(error);
        this.#pendingStart = undefined;
    }

    #buildConfigSnapshot() {
        const activeBotConfig = this.#activeBotConfig && this.#activeBotConfig !== false ? this.#activeBotConfig : null;
        const runtimeConfig = {
            ...txConfig.discordBot,
            guild: activeBotConfig?.guild ?? txConfig.discordBot.guild,
            warningsChannel: activeBotConfig?.warningsChannel ?? txConfig.discordBot.warningsChannel,
        };
        const { token, bridgeSecret, oauthClientSecret, ...publicDiscordConfig } = runtimeConfig;

        return {
            discordBot: publicDiscordConfig,
            discordBotLocale: getDiscordLocaleSnapshot(),
            discordBotAddons: txCore.addonManager?.getDiscordBotManifest() ?? [],
            locale: txConfig.general.language,
            playerCount: txCore.fxPlayerlist.onlineCount,
            maxPlayers: txCore.cacheStore.get('fxsRuntime:maxClients') ?? '??',
            serverName: txConfig.general.serverName,
            uptime: txCore.fxMonitor.status.uptime,
        };
    }

    #buildPersistentEmbedMessagePayload(target: PersistentEmbedTarget, options?: { page?: number }) {
        const messagePayload =
            target === 'playerList'
                ? generatePlayerListMessage(undefined, undefined, { page: options?.page ?? this.#getPersistentEmbedPage() })
                : generateStatusMessage();

        return messagePayload as {
            embeds?: Record<string, unknown>[];
            components?: Record<string, unknown>[];
        };
    }

    #getPersistentEmbedPage() {
        const rawPage = txCore.cacheStore.get(persistentEmbedStateKeys.playerList.page);
        if (typeof rawPage === 'number' && Number.isInteger(rawPage) && rawPage > 0) {
            return rawPage;
        }
        if (typeof rawPage === 'string' && /^\d+$/.test(rawPage)) {
            const parsedPage = Number.parseInt(rawPage, 10);
            if (parsedPage > 0) {
                return parsedPage;
            }
        }

        return 1;
    }

    #setPersistentEmbedPage(page: number) {
        txCore.cacheStore.set(persistentEmbedStateKeys.playerList.page, page);
    }

    #getPersistentEmbedState(target: PersistentEmbedTarget) {
        const targetStateKeys = persistentEmbedStateKeys[target];
        const channelId = txCore.cacheStore.get(targetStateKeys.channelId);
        const messageId = txCore.cacheStore.get(targetStateKeys.messageId);

        return {
            channelId: typeof channelId === 'string' ? channelId : undefined,
            messageId: typeof messageId === 'string' ? messageId : undefined,
        };
    }

    async #handleAddonRouteRequest(message: BridgeMessage) {
        const addonId = typeof message.addonId === 'string' ? message.addonId.trim() : '';
        if (!addonId) throw new Error('Addon ID is required.');

        const routePath = typeof message.path === 'string' ? message.path.trim() : '';
        if (!routePath.startsWith('/')) {
            throw new Error('Addon route path must start with "/".');
        }

        const addon = txCore.addonManager?.getAddon(addonId);
        if (!addon || addon.state !== 'running') {
            throw new Error(`Addon ${addonId} is not running.`);
        }
        if (!addon.process) {
            throw new Error(`Addon ${addonId} does not expose a server entry.`);
        }

        const method = typeof message.method === 'string' && message.method.trim().length
            ? message.method.toUpperCase()
            : 'POST';

        return await addon.process.handleHttpRequest({
            method,
            path: routePath,
            headers: buildAddonRequestHeaders(message.headers, message.requesterId, message.requesterName),
            body: message.body ?? null,
            admin: resolveAddonAdminContext(message.requesterId, message.requesterName, message.memberRoles),
        });
    }

    #handleBotStatus(message: BridgeMessage) {
        if (message.status === 'ready') {
            this.#ignoreNextBridgeDisconnect = false;
            this.#botProcess.markHealthy();
            this.guildName = typeof message.guildName === 'string' ? message.guildName : undefined;
            this.#lastExplicitStatus = DiscordBotStatus.Ready;
            this.#lastReadyAt = Date.now();
            this.#lastBotError = undefined;
            this.#clearBridgeAutoHealTimer();

            const userTag = typeof message.tag === 'string' ? message.tag : 'unknown';
            const guildLabel = this.guildName ?? this.#getCurrentSpawnConfig()?.guild ?? 'unknown';
            this.#resolvePendingStart(`Discord bot running as \`${userTag}\` on \`${guildLabel}\`.`);
            this.refreshWsStatus();
            this.updateBotStatus().catch(() => {});
            this.#syncDiscordLinkedAdminAuths().catch(() => {});
            return;
        }

        if (message.status === 'error') {
            this.#ignoreNextBridgeDisconnect = false;
            this.guildName = undefined;
            this.#lastExplicitStatus = DiscordBotStatus.Error;
            this.refreshWsStatus();
            this.#botProcess.stop();

            const errorMessage = typeof message.message === 'string' ? message.message : 'Discord bot reported an error.';
            const errorCode = typeof message.code === 'string' || typeof message.code === 'number' ? message.code : 'unknown';
            this.#lastBotError = {
                code: String(errorCode),
                message: errorMessage,
                at: Date.now(),
            };
            console.error(`Discord bot reported an error (${String(errorCode)}): ${errorMessage}`);

            const error = this.#buildError(
                errorMessage,
                message.code,
            );
            if (message.clientId) {
                Object.assign(error, { clientId: message.clientId });
            }
            if (message.prohibitedPermsInUse) {
                Object.assign(error, { prohibitedPermsInUse: message.prohibitedPermsInUse });
            }
            this.#rejectPendingStart(error);
        }
    }

    #handleBotProcessFailure(reason: string) {
        this.#ignoreNextBridgeDisconnect = false;
        this.guildName = undefined;
        this.#lastExplicitStatus = DiscordBotStatus.Error;
        this.#lastProcessFailure = {
            reason,
            at: Date.now(),
        };
        this.refreshWsStatus();

        if (this.#pendingStart) {
            this.#botProcess.stop();
            this.#rejectPendingStart(new Error(reason));
        }
    }

    #handleTicketThreadMessage(message: BridgeMessage) {
        if (typeof message.threadId !== 'string') return;
        if (typeof message.authorName !== 'string') return;
        if (typeof message.content !== 'string') return;
        if (typeof message.ts !== 'number') return;

        try {
            const ticket = txCore.database.tickets.findByDiscordThread(message.threadId);
            if (!ticket) return;

            const ticketMessage = {
                author: message.authorName,
                authorType: 'discord' as const,
                content: message.content,
                imageUrls: Array.isArray(message.imageUrls)
                    ? message.imageUrls.filter((entry): entry is string => typeof entry === 'string').slice(0, 3)
                    : undefined,
                ts: message.ts,
            };
            txCore.database.tickets.addMessage(ticket.id, ticketMessage);
            txCore.fxRunner.sendEvent('ticketNewMessage', {
                ticketId: ticket.id,
                reporterLicense: ticket.reporter.license,
                message: ticketMessage,
            });
        } catch (error) {
            console.error(`Failed to process ticket message for thread ${String(message.threadId)}: ${emsg(error)}`);
        }
    }

    #handleWhitelistCommand(message: BridgeMessage) {
        const permissionResult = resolveAdminPermission(message.requesterId, message.memberRoles, 'players.whitelist');
        if ('reply' in permissionResult) return permissionResult;
        const adminName = permissionResult.actorName;

        if (message.subcommand === 'member') {
            if (typeof message.identifier !== 'string' || typeof message.playerName !== 'string') {
                return buildDeniedReply('danger', translateWhitelist('failed_resolve_member'), 'invalid_request');
            }

            try {
                txCore.database.whitelist.registerApproval({
                    identifier: message.identifier,
                    playerName: message.playerName,
                    playerAvatar: typeof message.playerAvatar === 'string' ? message.playerAvatar : null,
                    tsApproved: now(),
                    approvedBy: adminName,
                });
                txCore.fxRunner.sendEvent('whitelistPreApproval', {
                    action: 'added',
                    identifier: message.identifier,
                    playerName: message.playerName,
                    adminName,
                });
            } catch (error) {
                return buildFailedReply(
                    'danger',
                    translateWhitelist('save_approval_failed', { message: emsg(error) }),
                    false,
                );
            }

            const replyMessage = translateWhitelist('approval_added', { playerName: message.playerName });
            logDiscordAdminAction(adminName, replyMessage, 'whitelist.approval.add');
            return buildSuccessResponse({ reply: buildReply('success', replyMessage) });
        }

        if (message.subcommand === 'request') {
            if (typeof message.requestId !== 'string' || message.requestId.length !== 5 || message.requestId[0] !== 'R') {
                return buildDeniedReply('danger', translateWhitelist('invalid_request_id'), 'invalid_request');
            }

            const requests = txCore.database.whitelist.findManyRequests({ id: message.requestId });
            if (!requests.length) {
                return buildDeniedReply(
                    'warning',
                    translateWhitelist('request_not_found', { requestId: message.requestId }),
                    'invalid_target',
                    false,
                );
            }

            const request = requests[0];
            const playerName = request.discordTag ?? request.playerDisplayName;
            try {
                txCore.database.whitelist.registerApproval({
                    identifier: `license:${request.license}`,
                    playerName,
                    playerAvatar: request.discordAvatar ? request.discordAvatar : null,
                    tsApproved: now(),
                    approvedBy: adminName,
                });
                txCore.fxRunner.sendEvent('whitelistRequest', {
                    action: 'approved',
                    playerName,
                    requestId: request.id,
                    license: request.license,
                    adminName,
                });
            } catch (error) {
                if (!(error instanceof DuplicateKeyError)) {
                    return buildFailedReply(
                        'danger',
                        translateWhitelist('save_request_approval_failed', { message: emsg(error) }),
                        false,
                    );
                }
            }

            try {
                txCore.database.whitelist.removeManyRequests({ id: message.requestId });
            } catch (error) {
                return buildFailedReply(
                    'danger',
                    translateWhitelist('remove_request_failed', { message: emsg(error) }),
                    false,
                );
            }

            const replyMessage = translateWhitelist('request_approved', {
                requestId: message.requestId,
                playerName,
            });
            logDiscordAdminAction(adminName, replyMessage, 'whitelist.request.approve');
            return buildSuccessResponse({ reply: buildReply('success', replyMessage) });
        }

        return buildDeniedReply(
            'danger',
            translateWhitelist('subcommand_not_found', { subcommand: String(message.subcommand) }),
            'invalid_request',
        );
    }

    #handleTicketCommand(message: BridgeMessage) {
        const permissionResult = resolveAdminPermission(message.requesterId, message.memberRoles, 'players.reports');
        if ('reply' in permissionResult) return permissionResult;

        if (!txConfig.gameFeatures.reportsEnabled) {
            return buildDeniedReply('warning', translateTicketCommand('reports_disabled'), 'feature_disabled');
        }

        const adminName = permissionResult.actorName;
        const subcommand = typeof message.subcommand === 'string' ? message.subcommand : '';

        if (subcommand === 'summary') {
            const normalizedTicketId = normalizeTicketCommandTicketId(message.ticketId);
            if (normalizedTicketId) {
                const ticket = txCore.database.tickets.findOne(normalizedTicketId);
                if (!ticket) {
                    return buildDeniedReply(
                        'warning',
                        translateTicketCommand('ticket_not_found', { ticketId: normalizedTicketId }),
                        'invalid_target',
                    );
                }

                return buildTicketCommandSummaryReply(ticket);
            }

            if (typeof message.threadId === 'string' && message.threadId.length) {
                const ticket = txCore.database.tickets.findByDiscordThread(message.threadId);
                if (!ticket) {
                    return buildDeniedReply('warning', translateTicketCommand('thread_not_linked'), 'invalid_target');
                }

                return buildTicketCommandSummaryReply(ticket);
            }

            const analytics = txCore.database.tickets.getAnalytics(30);
            const activeTickets = txCore.database.tickets
                .findAll()
                .filter((ticket) => ticket.status === 'open' || ticket.status === 'inReview')
                .sort((left, right) => right.tsLastActivity - left.tsLastActivity);

            return buildEmbedReply(
                buildTicketQueueSummaryEmbed(analytics, activeTickets, {
                    footer: commandFooter,
                }),
            );
        }

        const ticketResult = resolveTicketFromMessage(message);
        if ('reply' in ticketResult) return ticketResult;

        const ticket = ticketResult.ticket;

        if (subcommand === 'claim') {
            const nextClaimer = ticket.claimedBy === adminName ? null : adminName;
            const success = txCore.database.tickets.setClaimed(ticket.id, nextClaimer);
            if (!success) {
                return buildFailedReply('danger', translateTicketCommand('update_failed', { ticketId: ticket.id }));
            }

            txCore.database.tickets.addActivityEntry(ticket.id, {
                ts: now(),
                adminName,
                action: nextClaimer ? 'claimed' : 'unclaimed',
                details: nextClaimer ?? undefined,
            });
            logDiscordAdminAction(
                adminName,
                nextClaimer ? `Claimed ticket ${ticket.id}.` : `Unclaimed ticket ${ticket.id}.`,
                nextClaimer ? 'ticket.claim' : 'ticket.unclaim',
            );

            const updatedTicket = txCore.database.tickets.findOne(ticket.id) ?? {
                ...ticket,
                claimedBy: nextClaimer ?? undefined,
            };

            return buildTicketCommandSummaryReply(updatedTicket, {
                title: translateTicketCommand(nextClaimer ? 'claim_title' : 'unclaim_title', { ticketId: ticket.id }),
                note: nextClaimer
                    ? translateTicketCommand('assigned_note', { adminName: escapeDiscordText(nextClaimer) })
                    : translateTicketCommand('unassigned_note'),
                color: replyColors.success,
            });
        }

        if (subcommand === 'assign') {
            const assigneeDiscordId = typeof message.assigneeDiscordId === 'string' ? message.assigneeDiscordId.trim() : '';
            if (!assigneeDiscordId.length) {
                return buildDeniedReply('danger', translateTicketCommand('assign_missing_member'), 'invalid_request');
            }

            const assignee = txCore.adminStore.getAdminByProviderUID(assigneeDiscordId);
            if (!assignee) {
                return buildDeniedReply(
                    'warning',
                    translateTicketCommand('assign_unlinked_member'),
                    'invalid_target',
                );
            }

            if (ticket.claimedBy === assignee.name) {
                return buildTicketCommandSummaryReply(ticket, {
                    title: translateTicketCommand('assignment_title', { ticketId: ticket.id }),
                    note: translateTicketCommand('already_assigned_note', {
                        adminName: escapeDiscordText(assignee.name),
                    }),
                });
            }

            const success = txCore.database.tickets.setClaimed(ticket.id, assignee.name);
            if (!success) {
                return buildFailedReply('danger', translateTicketCommand('assign_failed', { ticketId: ticket.id }));
            }

            txCore.database.tickets.addActivityEntry(ticket.id, {
                ts: now(),
                adminName,
                action: 'assigned',
                details: assignee.name,
            });
            logDiscordAdminAction(adminName, `Assigned ticket ${ticket.id} to ${assignee.name}.`, 'ticket.assign');

            const updatedTicket = txCore.database.tickets.findOne(ticket.id) ?? {
                ...ticket,
                claimedBy: assignee.name,
            };

            return buildTicketCommandSummaryReply(updatedTicket, {
                title: translateTicketCommand('assigned_title', { ticketId: ticket.id }),
                note: translateTicketCommand('assigned_note', { adminName: escapeDiscordText(assignee.name) }),
                color: replyColors.success,
            });
        }

        if (subcommand === 'resolve') {
            if (ticket.status === 'resolved') {
                return withTelemetry(
                    buildTicketCommandSummaryReply(ticket, {
                        title: translateTicketCommand('already_resolved_title', { ticketId: ticket.id }),
                        note: translateTicketCommand('already_resolved_note'),
                    }),
                    { outcome: 'denied', denialReason: 'invalid_target' },
                );
            }

            if (ticket.status === 'closed') {
                return withTelemetry(
                    buildTicketCommandSummaryReply(ticket, {
                        title: translateTicketCommand('already_closed_title', { ticketId: ticket.id }),
                        note: translateTicketCommand('already_closed_note'),
                        color: replyColors.warning,
                    }),
                    { outcome: 'denied', denialReason: 'invalid_target' },
                );
            }

            const success = txCore.database.tickets.setStatus(ticket.id, 'resolved', adminName);
            if (!success) {
                return buildFailedReply('danger', translateTicketCommand('resolve_failed', { ticketId: ticket.id }));
            }

            txCore.database.tickets.addActivityEntry(ticket.id, {
                ts: now(),
                adminName,
                action: 'resolved',
            });
            logDiscordAdminAction(adminName, `Resolved ticket ${ticket.id}.`, 'ticket.resolve');

            const updatedTicket = txCore.database.tickets.findOne(ticket.id) ?? {
                ...ticket,
                status: 'resolved',
                resolvedBy: adminName,
                tsResolved: now(),
            };
            void this.sendAnnouncement({
                type: 'success',
                title: translateTicketCommand('resolved_announcement_title', { ticketId: ticket.id }),
                description: translateTicketCommand('resolved_announcement_description', {
                    reporterName: escapeDiscordText(ticket.reporter.name),
                    category: escapeDiscordText(ticket.category),
                    adminName: escapeDiscordText(adminName),
                }),
            });

            return buildTicketCommandSummaryReply(updatedTicket, {
                title: translateTicketCommand('resolved_title', { ticketId: ticket.id }),
                note: translateTicketCommand('resolved_note', { adminName: escapeDiscordText(adminName) }),
                color: replyColors.success,
            });
        }

        if (subcommand === 'reopen') {
            if (ticket.status === 'open') {
                return withTelemetry(
                    buildTicketCommandSummaryReply(ticket, {
                        title: translateTicketCommand('already_open_title', { ticketId: ticket.id }),
                        note: translateTicketCommand('already_open_note'),
                    }),
                    { outcome: 'denied', denialReason: 'invalid_target' },
                );
            }

            const success = txCore.database.tickets.setStatus(ticket.id, 'open');
            if (!success) {
                return buildFailedReply('danger', translateTicketCommand('reopen_failed', { ticketId: ticket.id }));
            }

            txCore.database.tickets.addActivityEntry(ticket.id, {
                ts: now(),
                adminName,
                action: 'reopened',
            });
            logDiscordAdminAction(adminName, `Reopened ticket ${ticket.id}.`, 'ticket.reopen');

            const updatedTicket = txCore.database.tickets.findOne(ticket.id) ?? {
                ...ticket,
                status: 'open',
                resolvedBy: undefined,
                tsResolved: undefined,
            };

            return buildTicketCommandSummaryReply(updatedTicket, {
                title: translateTicketCommand('reopened_title', { ticketId: ticket.id }),
                note: translateTicketCommand('reopened_note', { adminName: escapeDiscordText(adminName) }),
                color: replyColors.info,
            });
        }

        return buildDeniedReply(
            'danger',
            translateTicketCommand('subcommand_not_found', { subcommand }),
            'invalid_request',
        );
    }

    #handlePersistentEmbedCommand(message: BridgeMessage) {
        const permissionResult = resolveAdminPermission(message.requesterId, message.memberRoles, 'settings.write');
        if ('reply' in permissionResult) return permissionResult;

        const adminName = permissionResult.actorName;
        const action = message.action;
        const target = resolvePersistentEmbedTarget(message.target ?? message.embedType);
        const targetStateKeys = persistentEmbedStateKeys[target];
        const targetMeta = getPersistentEmbedLocaleMeta(target);
        if (action === 'getState') {
            return {
                ...this.#getPersistentEmbedState(target),
                ...(target === 'playerList' ? { page: this.#getPersistentEmbedPage() } : {}),
            };
        }

        if (action === 'getMessage') {
            try {
                return buildSuccessResponse({ messagePayload: this.#buildPersistentEmbedMessagePayload(target) });
            } catch (error) {
                return buildReplyResult(
                    'warning',
                    translateBot('persistent_embed.generate_failed', {
                        embedLabel: targetMeta.lowerName,
                        message: emsg(error),
                    }),
                    { outcome: 'failed' },
                    true,
                );
            }
        }

        if (action === 'saveLocation') {
            if (typeof message.channelId !== 'string' || typeof message.messageId !== 'string') {
                return buildDeniedReply(
                    'danger',
                    translateBot('persistent_embed.invalid_location', { embedLabel: targetMeta.lowerName }),
                    'invalid_target',
                );
            }

            txCore.cacheStore.set(targetStateKeys.channelId, message.channelId);
            txCore.cacheStore.set(targetStateKeys.messageId, message.messageId);
            if (target === 'playerList') {
                this.#setPersistentEmbedPage(1);
            }
            logDiscordAdminAction(
                adminName,
                targetMeta.saved,
                target === 'status' ? 'embed.status.save' : 'embed.player_list.save',
            );
            return buildSuccessResponse({ ok: true });
        }

        if (action === 'clearLocation') {
            txCore.cacheStore.delete(targetStateKeys.channelId);
            txCore.cacheStore.delete(targetStateKeys.messageId);
            if (target === 'playerList') {
                txCore.cacheStore.delete(targetStateKeys.page);
            }
            if (message.logAction !== false) {
                logDiscordAdminAction(
                    adminName,
                    targetMeta.removed,
                    target === 'status' ? 'embed.status.clear' : 'embed.player_list.clear',
                );
            }
            return buildSuccessResponse({ ok: true });
        }

        return buildDeniedReply(
            'danger',
            translateBot('persistent_embed.unknown_action', { action: String(action) }),
            'invalid_request',
        );
    }

    #handlePersistentEmbedPageRequest(message: BridgeMessage) {
        const target = resolvePersistentEmbedTarget(message.target ?? message.embedType);
        if (target !== 'playerList') {
            return {
                reply: buildReply('warning', translateBot('persistent_embed.pagination_only_player_list'), true),
            };
        }

        const { channelId, messageId } = this.#getPersistentEmbedState(target);
        if (!channelId || !messageId) {
            return { reply: buildReply('warning', translateBot('persistent_embed.player_list_not_configured'), true) };
        }
        if (message.channelId !== channelId || message.messageId !== messageId) {
            return {
                reply: buildReply('warning', translateBot('persistent_embed.player_list_no_longer_active'), true),
            };
        }

        const requestedPage =
            typeof message.page === 'number'
                ? message.page
                : typeof message.page === 'string' && /^\d+$/.test(message.page)
                  ? Number.parseInt(message.page, 10)
                  : NaN;
        if (!Number.isInteger(requestedPage) || requestedPage < 1) {
            return { reply: buildReply('danger', translateBot('persistent_embed.invalid_page'), true) };
        }

        this.#setPersistentEmbedPage(requestedPage);

        try {
            return {
                messagePayload: this.#buildPersistentEmbedMessagePayload(target, { page: requestedPage }),
            };
        } catch (error) {
            return {
                reply: buildReply(
                    'warning',
                    translateBot('persistent_embed.page_change_failed', { message: emsg(error) }),
                    true,
                ),
            };
        }
    }

    #translate(content: string | MessageTranslationType | undefined) {
        if (!content) return undefined;
        if (typeof content === 'string') return content;
        return txCore.translator.t(content.key, content.data);
    }

    #recordRecoveryAction(
        action: DiscordBotRecoveryAction['action'],
        source: DiscordBotRecoverySource,
        ok: boolean,
        message: string,
    ) {
        this.#lastRecoveryAction = {
            action,
            source,
            ok,
            message,
            at: Date.now(),
        };
    }

    #clearBridgeAutoHealTimer() {
        if (this.#bridgeAutoHealTimer) {
            clearTimeout(this.#bridgeAutoHealTimer);
            this.#bridgeAutoHealTimer = undefined;
        }
        this.#bridgeAutoHealAt = undefined;
    }

    #scheduleBridgeAutoHeal() {
        if (this.#bridgeAutoHealTimer || !this.#botProcess.isRunning || this.#pendingStart) return;

        this.#bridgeAutoHealAt = Date.now() + BRIDGE_AUTO_HEAL_DELAY_MS;
        this.#bridgeAutoHealTimer = setTimeout(() => {
            this.#bridgeAutoHealTimer = undefined;
            this.#bridgeAutoHealAt = undefined;
            if (this.#bridgeServer?.isReady || !this.#isBotEnabled()) return;

            this.restartRuntime('automatic').catch((error) => {
                console.error(`Discord bot bridge auto-heal failed: ${error instanceof Error ? error.message : String(error)}`);
            });
        }, BRIDGE_AUTO_HEAL_DELAY_MS);
    }

    #isBotEnabled() {
        if (this.#activeBotConfig !== undefined) {
            return this.#activeBotConfig !== false && this.#activeBotConfig.enabled;
        }

        return txConfig.discordBot.enabled;
    }

    #getCurrentSpawnConfig(): SpawnConfig | undefined {
        if (this.#activeBotConfig && this.#activeBotConfig !== false) {
            return this.#activeBotConfig;
        }

        if (!txConfig.discordBot.enabled) return undefined;
        return {
            enabled: txConfig.discordBot.enabled,
            token: txConfig.discordBot.token,
            guild: txConfig.discordBot.guild,
            warningsChannel: txConfig.discordBot.warningsChannel,
        };
    }

    #getBridgeSecret() {
        if (typeof txConfig.discordBot.bridgeSecret === 'string' && txConfig.discordBot.bridgeSecret.length) {
            return txConfig.discordBot.bridgeSecret;
        }

        this.#runtimeBridgeSecret ??= randomUUID();
        return this.#runtimeBridgeSecret;
    }

    #buildError(message: string, code?: unknown) {
        const error = new Error(message) as Error & { code?: unknown };
        if (typeof code !== 'undefined') {
            error.code = code;
        }
        return error;
    }
}