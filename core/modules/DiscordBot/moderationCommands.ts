import { msToShortishDuration, now as runtimeNow } from '@lib/misc';
import { findPlayersByIdentifier } from '@lib/player/playerFinder';
import playerResolver from '@lib/player/playerResolver';
import type { PlayerClass } from '@lib/player/playerClasses';
import { SYM_CURRENT_MUTEX } from '@lib/symbols';
import type { DatabaseActionBanType, DatabaseActionType } from '@modules/Database/databaseTypes';
import { handleRevokeAction } from '@routes/history/actions';
import { handleBan, handleKick, handleSaveNote, handleWarning } from '@routes/player/actions';
import type { BotCommandDenialReason, BotCommandResponseTelemetry } from '@shared/discordBotAnalyticsTypes';
import type { SystemLogActionId } from '@shared/systemLogTypes';
import { buildDiscordCardMessageFromEmbed } from './componentsV2';
import { translateDiscord } from './discordLocale';
import { escapeDiscordText } from './ticketCommandUtils';
import type { BridgeMessage } from './bridgeServer';

const t = (key: string, data?: Record<string, unknown>) => {
    return translateDiscord(`moderation.${key}`, data);
};

type ReplyType = 'info' | 'success' | 'warning' | 'danger';

type ReplyPayload = {
    flags?: number;
    content?: string;
    embeds?: Record<string, unknown>[];
    components?: Record<string, unknown>[];
};

type ReplyResult = {
    reply: ReplyPayload;
    telemetry?: BotCommandResponseTelemetry;
};

type LinkedAdmin = {
    name: string;
    permissions?: string[];
    isMaster?: boolean;
};

type ModerationCommandDependencies = {
    buildReply: (type: ReplyType, description: string, ephemeral?: boolean) => ReplyPayload;
    adminStore: {
        getAdminByProviderUID: (uid: string) => LinkedAdmin | undefined;
        registeredPermissions: Record<string, string>;
    };
    logAction: (adminName: string, message: string, actionId?: SystemLogActionId) => void;
    footer?: Record<string, unknown>;
    infoEmbedColor?: number;
    now?: () => number;
};

const EPHEMERAL_MESSAGE_FLAG = 1 << 6;
const DEFAULT_HISTORY_LIMIT = 5;
const MAX_HISTORY_LIMIT = 10;
const MAX_NOTES_LENGTH = 3500;
const MAX_AMBIGUOUS_TARGETS = 5;

const truncate = (input: string, maxLength: number) => {
    if (input.length <= maxLength) return input;
    return `${input.slice(0, Math.max(0, maxLength - 3))}...`;
};

const normalizePermissions = (permissions: unknown) => {
    if (!Array.isArray(permissions)) return [];
    return permissions.filter((permission): permission is string => typeof permission === 'string');
};

const adminHasPermission = (admin: { isMaster?: boolean; permissions: string[] }, permission: string) => {
    if (admin.isMaster === true) return true;
    return admin.permissions.includes('all_permissions') || admin.permissions.includes(permission);
};

const buildEmbedReply = (embed: Record<string, unknown>, ephemeral = true): ReplyResult => {
    return {
        reply: buildDiscordCardMessageFromEmbed(embed, {
            flags: ephemeral ? EPHEMERAL_MESSAGE_FLAG : undefined,
        }),
        telemetry: {
            outcome: 'success',
        },
    };
};

const buildReplyResult = (
    deps: ModerationCommandDependencies,
    type: ReplyType,
    description: string,
    telemetry: BotCommandResponseTelemetry,
    ephemeral = true,
): ReplyResult => {
    return {
        reply: deps.buildReply(type, description, ephemeral),
        telemetry,
    };
};

const buildDeniedReply = (
    deps: ModerationCommandDependencies,
    type: ReplyType,
    description: string,
    denialReason: BotCommandDenialReason,
    ephemeral = true,
): ReplyResult => {
    return buildReplyResult(deps, type, description, { outcome: 'denied', denialReason }, ephemeral);
};

const buildFailedReply = (
    deps: ModerationCommandDependencies,
    type: ReplyType,
    description: string,
    ephemeral = true,
): ReplyResult => {
    return buildReplyResult(deps, type, description, { outcome: 'failed' }, ephemeral);
};

const buildSuccessReply = (result: ReplyResult): ReplyResult => {
    return {
        ...result,
        telemetry: {
            ...(result.telemetry ?? {}),
            outcome: 'success',
        },
    };
};

const resolveLinkedAdminAccess = (
    deps: ModerationCommandDependencies,
    requesterId: unknown,
    requiredPermission?: string,
) => {
    if (typeof requesterId !== 'string' || !requesterId.length) {
        return buildDeniedReply(deps, 'danger', t('access.could_not_resolve_user'), 'invalid_request');
    }

    const linkedAdmin = deps.adminStore.getAdminByProviderUID(requesterId);
    if (!linkedAdmin) {
        return buildDeniedReply(
            deps,
            'warning',
            t('access.no_access', { requesterId }),
            'unlinked_account',
        );
    }

    const admin = {
        ...linkedAdmin,
        permissions: normalizePermissions(linkedAdmin.permissions),
        isMaster: linkedAdmin.isMaster === true,
    };

    if (requiredPermission && !adminHasPermission(admin, requiredPermission)) {
        const permissionLabel = deps.adminStore.registeredPermissions[requiredPermission] ?? 'Unknown';
        return buildDeniedReply(
            deps,
            'danger',
            t('access.missing_permission', { permissionLabel }),
            'missing_permissions',
        );
    }

    return { admin };
};

const resolveTargetPlayer = (deps: ModerationCommandDependencies, searchId: unknown) => {
    if (typeof searchId !== 'string' || !searchId.trim().length) {
        return buildDeniedReply(deps, 'danger', t('target.invalid_identifier'), 'invalid_target');
    }

    const normalizedSearchId = searchId.trim().toLowerCase();
    const serverIdMatch = normalizedSearchId.match(/^serverid:(\d+)$/);
    if (serverIdMatch) {
        const serverId = Number.parseInt(serverIdMatch[1], 10);
        if (!Number.isInteger(serverId) || serverId < 1) {
            return buildDeniedReply(deps, 'danger', t('target.invalid_server_id'), 'invalid_target');
        }

        try {
            const player = playerResolver(SYM_CURRENT_MUTEX, serverId, undefined) as PlayerClass;
            return { player, normalizedSearchId };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return buildDeniedReply(
                deps,
                'warning',
                t('target.server_id_not_resolved', { serverId, message }),
                'invalid_target',
            );
        }
    }

    let players;
    try {
        players = findPlayersByIdentifier(normalizedSearchId);
    } catch (error) {
        return buildFailedReply(deps, 'danger', emsg(error));
    }

    const dedupedPlayers = [] as PlayerClass[];
    const seenLicenses = new Set<string>();
    for (const player of players) {
        if (player.license && seenLicenses.has(player.license)) continue;
        if (player.license) seenLicenses.add(player.license);
        dedupedPlayers.push(player);
    }

    if (!dedupedPlayers.length) {
        return buildDeniedReply(
            deps,
            'warning',
            t('target.no_player_match', { searchId: normalizedSearchId }),
            'invalid_target',
        );
    }

    if (dedupedPlayers.length > 1) {
        const preview = dedupedPlayers.slice(0, MAX_AMBIGUOUS_TARGETS).map((player) => {
            return `• **${escapeDiscordText(player.displayName)}** (\`${player.license ?? 'unknown'}\`)`;
        });
        const remainder = dedupedPlayers.length - preview.length;
        const suffix = remainder > 0 ? `\n${t('target.multiple_players_more', { count: remainder })}` : '';
        return buildDeniedReply(
            deps,
            'warning',
            t('target.multiple_players', { searchId: normalizedSearchId }) + `\n\n${preview.join('\n')}${suffix}`,
            'invalid_target',
        );
    }

    const player = dedupedPlayers[0];
    if (!player.license) {
        return buildDeniedReply(deps, 'danger', t('target.invalid_license'), 'invalid_target');
    }

    try {
        return {
            player: playerResolver(null, null, player.license) as PlayerClass,
            normalizedSearchId,
        };
    } catch {
        return { player, normalizedSearchId };
    }
};

const createRouteCtx = (
    admin: { name: string; permissions: string[]; isMaster: boolean },
    body: Record<string, unknown>,
    deps: ModerationCommandDependencies,
) => {
    const hasPermission = (permission: string) => adminHasPermission(admin, permission);
    return {
        request: { body },
        admin: {
            name: admin.name,
            permissions: admin.permissions,
            isMaster: admin.isMaster,
            testPermission: (permission: string) => hasPermission(permission),
            hasPermission: (permission: string) => hasPermission(permission),
            logAction: (message: string, actionId?: SystemLogActionId) => deps.logAction(admin.name, message, actionId),
        },
    } as any;
};

const toRouteReply = (
    deps: ModerationCommandDependencies,
    result: { error?: string } | undefined,
    successDescription: string,
) => {
    if (result && typeof result.error === 'string') {
        return buildFailedReply(deps, 'danger', result.error);
    }

    return buildSuccessReply({
        reply: deps.buildReply('success', successDescription, true),
    });
};

const getSortedHistory = (player: PlayerClass) => {
    return [...player.getHistory()].sort((left, right) => right.timestamp - left.timestamp);
};

const buildHistoryStatus = (action: DatabaseActionType, currentTs: number) => {
    if (action.revocation) {
        const reasonSuffix = action.revocation.reason ? ` (${escapeDiscordText(action.revocation.reason)})` : '';
        return t('history.status.revoked', {
            author: escapeDiscordText(action.revocation.author),
            timestamp: action.revocation.timestamp,
            reasonSuffix,
        });
    }

    if (action.type === 'ban') {
        if (action.expiration === false) {
            return t('history.status.permanent');
        }

        if (action.expiration <= currentTs) {
            return t('history.status.expired', { timestamp: action.expiration });
        }

        return t('history.status.expires', {
            timestamp: action.expiration,
            duration: msToShortishDuration((action.expiration - currentTs) * 1000),
        });
    }

    if (action.type === 'warn') {
        return action.acked ? t('history.status.acked') : t('history.status.pending_ack');
    }

    return t('history.status.executed');
};

const buildHistoryFieldValue = (action: DatabaseActionType, currentTs: number) => {
    const lines = [
        t('history.by', { author: escapeDiscordText(action.author), timestamp: action.timestamp }),
        `${t('history.status_label')}: ${buildHistoryStatus(action, currentTs)}`,
        `${t('history.reason_label')}: ${truncate(escapeDiscordText(action.reason), 700)}`,
    ];

    if (action.type === 'ban' && action.expiration !== false && action.expiration > currentTs) {
        lines.push(t('history.duration_left', { duration: msToShortishDuration((action.expiration - currentTs) * 1000) }));
    }

    return truncate(lines.join('\n'), 1024);
};

const buildNotesReply = (player: PlayerClass, deps: ModerationCommandDependencies) => {
    const dbData = player.getDbData();
    const notesText = dbData?.notes?.text?.trim().length ? dbData.notes.text.trim() : t('notes.none');
    const lastEdited =
        dbData?.notes?.lastAdmin && dbData?.notes?.tsLastEdit
            ? t('notes.last_updated', {
                admin: escapeDiscordText(dbData.notes.lastAdmin),
                timestamp: dbData.notes.tsLastEdit,
            })
            : t('notes.no_metadata');

    return buildEmbedReply({
        title: `${t('notes.title')} · ${truncate(escapeDiscordText(player.displayName), 150)}`,
        color: deps.infoEmbedColor,
        description: truncate(escapeDiscordText(notesText), MAX_NOTES_LENGTH),
        fields: [
            {
                name: t('notes.fields.license'),
                value: `\`${player.license ?? 'unknown'}\``,
                inline: false,
            },
            {
                name: t('notes.fields.last_edited'),
                value: lastEdited,
                inline: false,
            },
        ],
        ...(deps.footer ? { footer: deps.footer } : {}),
    });
};

const buildHistoryReply = (
    player: PlayerClass,
    deps: ModerationCommandDependencies,
    limit: unknown,
) => {
    const parsedLimit = typeof limit === 'number' && Number.isInteger(limit) ? limit : Number.parseInt(String(limit ?? ''), 10);
    const historyLimit = Number.isInteger(parsedLimit)
        ? Math.min(MAX_HISTORY_LIMIT, Math.max(1, parsedLimit))
        : DEFAULT_HISTORY_LIMIT;
    const actionHistory = getSortedHistory(player);
    if (!actionHistory.length) {
        return buildDeniedReply(
            deps,
            'warning',
            t('history.none', { playerName: escapeDiscordText(player.displayName) }),
            'invalid_target',
        );
    }

    const currentTs = deps.now ? deps.now() : runtimeNow();
    const embed = {
        title: `${t('history.title')} · ${truncate(escapeDiscordText(player.displayName), 150)}`,
        color: deps.infoEmbedColor,
        description: t('history.description', {
            count: Math.min(historyLimit, actionHistory.length),
            license: player.license ?? 'unknown',
        }),
        fields: actionHistory.slice(0, historyLimit).map((action) => {
            return {
                name: `${action.id} · ${action.type.toUpperCase()}`,
                value: buildHistoryFieldValue(action, currentTs),
                inline: false,
            };
        }),
        ...(deps.footer ? { footer: deps.footer } : {}),
    } satisfies Record<string, unknown>;

    return buildEmbedReply(embed);
};

const resolveSingleActiveBan = (player: PlayerClass, deps: ModerationCommandDependencies) => {
    const currentTs = deps.now ? deps.now() : runtimeNow();
    const activeBans = getSortedHistory(player).filter((entry): entry is DatabaseActionBanType => {
        return entry.type === 'ban' && !entry.revocation && (entry.expiration === false || entry.expiration > currentTs);
    });

    if (!activeBans.length) {
        return buildDeniedReply(
            deps,
            'warning',
            t('unban.none', { playerName: escapeDiscordText(player.displayName) }),
            'invalid_target',
        );
    }

    if (activeBans.length > 1) {
        const preview = activeBans.slice(0, MAX_AMBIGUOUS_TARGETS).map((action) => {
            const expiration = action.expiration === false ? 'permanent' : `<t:${action.expiration}:f>`;
            return `• \`${action.id}\` by **${escapeDiscordText(action.author)}** (${expiration})`;
        });
        const remainder = activeBans.length - preview.length;
        const suffix = remainder > 0 ? `\n${t('unban.multiple_more', { count: remainder })}` : '';
        return buildDeniedReply(
            deps,
            'warning',
            t('unban.multiple', { playerName: escapeDiscordText(player.displayName) }) +
                `\n\n${preview.join('\n')}${suffix}`,
            'invalid_target',
        );
    }

    return { action: activeBans[0] };
};

export const handleModerationCommand = async (
    message: BridgeMessage,
    deps: ModerationCommandDependencies,
): Promise<ReplyResult> => {
    const command = typeof message.command === 'string' ? message.command : '';

    if (command === 'warn') {
        const adminResult = resolveLinkedAdminAccess(deps, message.requesterId, 'players.warn');
        if ('reply' in adminResult) return adminResult;

        const playerResult = resolveTargetPlayer(deps, message.searchId);
        if ('reply' in playerResult) return playerResult;

        const reason = typeof message.reason === 'string' ? message.reason.trim() : '';
        const ctx = createRouteCtx(adminResult.admin, { reason }, deps);
        const result = await handleWarning(ctx, playerResult.player);
        return toRouteReply(deps, result, t('success.warned', { playerName: escapeDiscordText(playerResult.player.displayName) }));
    }

    if (command === 'kick') {
        const adminResult = resolveLinkedAdminAccess(deps, message.requesterId, 'players.kick');
        if ('reply' in adminResult) return adminResult;

        const playerResult = resolveTargetPlayer(deps, message.searchId);
        if ('reply' in playerResult) return playerResult;

        const reason = typeof message.reason === 'string' ? message.reason.trim() : '';
        const ctx = createRouteCtx(adminResult.admin, { reason }, deps);
        const result = await handleKick(ctx, playerResult.player);
        return toRouteReply(deps, result, t('success.kicked', { playerName: escapeDiscordText(playerResult.player.displayName) }));
    }

    if (command === 'ban') {
        const adminResult = resolveLinkedAdminAccess(deps, message.requesterId, 'players.ban');
        if ('reply' in adminResult) return adminResult;

        const playerResult = resolveTargetPlayer(deps, message.searchId);
        if ('reply' in playerResult) return playerResult;

        const duration = typeof message.duration === 'string' ? message.duration.trim().toLowerCase() : '';
        const reason = typeof message.reason === 'string' ? message.reason.trim() : '';
        const ctx = createRouteCtx(adminResult.admin, { duration, reason }, deps);
        const result = await handleBan(ctx, playerResult.player);
        const durationLabel = duration.length ? duration : t('success.permanent_duration');
        return toRouteReply(
            deps,
            result,
            t('success.banned', {
                playerName: escapeDiscordText(playerResult.player.displayName),
                duration: escapeDiscordText(durationLabel),
            }),
        );
    }

    if (command === 'unban') {
        const adminResult = resolveLinkedAdminAccess(deps, message.requesterId, 'players.unban');
        if ('reply' in adminResult) return adminResult;

        const reason = typeof message.reason === 'string' ? message.reason.trim() : '';
        let actionId = typeof message.actionId === 'string' ? message.actionId.trim().toUpperCase() : '';
        let action = actionId.length ? txCore.database.actions.findOne(actionId) : null;

        if (!actionId.length) {
            const playerResult = resolveTargetPlayer(deps, message.searchId);
            if ('reply' in playerResult) return playerResult;

            const banResult = resolveSingleActiveBan(playerResult.player, deps);
            if ('reply' in banResult) return banResult;

            actionId = banResult.action.id;
            action = banResult.action;
        }

        const ctx = createRouteCtx(adminResult.admin, { actionId, reason }, deps);
        const result = await handleRevokeAction(ctx);
        return toRouteReply(
            deps,
            result,
            t('success.unbanned', {
                actionId,
                targetLabel: action?.playerName ? ` ${t('success.unbanned_target', { playerName: escapeDiscordText(action.playerName) })}` : '',
            }),
        );
    }

    if (command === 'notes') {
        const adminResult = resolveLinkedAdminAccess(deps, message.requesterId);
        if ('reply' in adminResult) return adminResult;

        const playerResult = resolveTargetPlayer(deps, message.searchId);
        if ('reply' in playerResult) return playerResult;

        const action = typeof message.action === 'string' ? message.action : 'view';
        if (action === 'view') {
            return buildNotesReply(playerResult.player, deps);
        }

        if (action === 'set') {
            const note = typeof message.note === 'string' ? message.note.trim() : '';
            if (!note.length) {
                return buildDeniedReply(deps, 'danger', t('notes.empty'), 'invalid_request');
            }

            const ctx = createRouteCtx(adminResult.admin, { note }, deps);
            const result = await handleSaveNote(ctx, playerResult.player);
            return toRouteReply(
                deps,
                result,
                t('notes.updated', { playerName: escapeDiscordText(playerResult.player.displayName) }),
            );
        }

        return buildDeniedReply(
            deps,
            'danger',
            t('notes.action_not_found', { action: String(message.action) }),
            'invalid_request',
        );
    }

    if (command === 'history') {
        const adminResult = resolveLinkedAdminAccess(deps, message.requesterId);
        if ('reply' in adminResult) return adminResult;

        const playerResult = resolveTargetPlayer(deps, message.searchId);
        if ('reply' in playerResult) return playerResult;

        return buildHistoryReply(playerResult.player, deps, message.limit);
    }

    return buildDeniedReply(
        deps,
        'danger',
        t('command_not_found', { command: command || 'unknown' }),
        'invalid_request',
    );
};