import {
    discordLogRouteDefinitions,
    discordMenuCommandDefinitions,
    normalizeDiscordLogRoutes,
    type DiscordLogRouteConfig,
    type DiscordLogRouteKey,
} from '@shared/discordLogRoutes';
import { permissionsMap } from '@shared/permissions';
import type { SystemLogCategory, SystemLogEntry } from '@shared/systemLogTypes';
import { buildDiscordCardMessageFromEmbed } from './componentsV2';

export type DiscordLogMessagePayload = {
    channelId: string;
    guildId: string | null;
    flags?: number;
    components: Record<string, unknown>[];
    allowedMentions?: Record<string, unknown>;
};

type ServerLogEntry = {
    ts: number;
    src: {
        id: string | false;
        name: string;
    };
    msg: string;
};

type ServerLogEvent = {
    type?: unknown;
    data?: unknown;
};

type ServerMenuEventData = {
    action?: unknown;
    message?: unknown;
    commandId?: unknown;
    permissionId?: unknown;
    location?: unknown;
};

const routeLabelByKey = new Map(discordLogRouteDefinitions.map((route) => [route.key, route.label]));
const menuCommandById = new Map(discordMenuCommandDefinitions.map((command) => [command.id, command]));

const systemLogRouteByCategory: Record<SystemLogCategory, DiscordLogRouteKey> = {
    action: 'system.action',
    command: 'system.command',
    login: 'system.login',
    config: 'system.config',
    monitor: 'system.monitor',
    scheduler: 'system.scheduler',
    system: 'system.system',
};

const routeColorByKey: Record<DiscordLogRouteKey, number> = {
    'system.action': 0x2563eb,
    'system.command': 0x7c3aed,
    'system.login': 0x16a34a,
    'system.config': 0xd97706,
    'system.monitor': 0xdc2626,
    'system.scheduler': 0x0891b2,
    'system.system': 0x475569,
    'server.menu': 0xf59e0b,
};

const truncate = (value: string, maxLength: number) => {
    return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
};

const resolveRoute = (routesValue: unknown, routeKey: DiscordLogRouteKey) => {
    return normalizeDiscordLogRoutes(routesValue).find((route) => route.key === routeKey) ?? null;
};

const buildPayload = (route: DiscordLogRouteConfig, embed: Record<string, unknown>): DiscordLogMessagePayload => {
    return {
        channelId: route.channelId!,
        guildId: null,
        ...buildDiscordCardMessageFromEmbed(embed, {
            allowedMentions: { parse: [] },
        }),
    };
};

const formatLocation = (value: unknown) => {
    if (!value || typeof value !== 'object') return 'Unknown';

    const location = value as Record<string, unknown>;
    const x = typeof location.x === 'number' ? location.x : Number(location.x);
    const y = typeof location.y === 'number' ? location.y : Number(location.y);
    const z = typeof location.z === 'number' ? location.z : Number(location.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        return 'Unknown';
    }

    return `X: ${x.toFixed(2)}, Y: ${y.toFixed(2)}, Z: ${z.toFixed(2)}`;
};

export const buildSystemLogDiscordPayload = (routesValue: unknown, entry: SystemLogEntry) => {
    const routeKey = systemLogRouteByCategory[entry.category];
    const route = resolveRoute(routesValue, routeKey);
    if (!route?.enabled || !route.channelId) return false;
    if (route.useEntryFilter) {
        if (typeof entry.actionId !== 'string' || !route.entryFilter.includes(entry.actionId)) {
            return false;
        }
    }

    const embed = {
        title: routeLabelByKey.get(routeKey) ?? 'fxPanel Log',
        color: routeColorByKey[routeKey],
        description: truncate(entry.action, 2048),
        fields: [
            {
                name: 'Username',
                value: truncate(entry.author, 1024),
                inline: true,
            },
            {
                name: 'Category',
                value: entry.category,
                inline: true,
            },
            {
                name: 'Time',
                value: `<t:${Math.floor(entry.ts / 1000)}:F>`,
                inline: true,
            },
        ],
    } satisfies Record<string, unknown>;

    return buildPayload(route, embed);
};

export const buildServerMenuDiscordPayload = (
    routesValue: unknown,
    rawEvent: ServerLogEvent,
    logEntry: ServerLogEntry,
) => {
    if (rawEvent.type !== 'MenuEvent') return false;

    const route = resolveRoute(routesValue, 'server.menu');
    if (!route?.enabled || !route.channelId) return false;

    const eventData = rawEvent.data && typeof rawEvent.data === 'object'
        ? (rawEvent.data as ServerMenuEventData)
        : {};
    const commandId =
        typeof eventData.commandId === 'string' && eventData.commandId.length
            ? eventData.commandId
            : typeof eventData.action === 'string' && eventData.action.length
              ? eventData.action
              : 'unknown';

    if (route.useEntryFilter && !route.entryFilter.includes(commandId)) {
        return false;
    }

    const commandDefinition = menuCommandById.get(commandId);
    const permissionId =
        typeof eventData.permissionId === 'string' && eventData.permissionId.length
            ? eventData.permissionId
            : commandDefinition?.permissionId;
    const permissionLabel = permissionId ? (permissionsMap.get(permissionId)?.label ?? permissionId) : 'Unknown';
    const description =
        typeof eventData.message === 'string' && eventData.message.length
            ? eventData.message
            : logEntry.msg;

    const embed = {
        title: routeLabelByKey.get('server.menu') ?? 'Admin Command Log',
        color: routeColorByKey['server.menu'],
        description: truncate(description, 2048),
        fields: [
            {
                name: 'Username',
                value: truncate(logEntry.src.name, 1024),
                inline: true,
            },
            {
                name: 'Command',
                value: commandDefinition?.label ?? commandId,
                inline: true,
            },
            {
                name: 'Permission',
                value: truncate(permissionLabel, 1024),
                inline: true,
            },
            {
                name: 'Location',
                value: formatLocation(eventData.location),
                inline: false,
            },
            {
                name: 'Time',
                value: `<t:${Math.floor(logEntry.ts / 1000)}:F>`,
                inline: false,
            },
        ],
    } satisfies Record<string, unknown>;

    return buildPayload(route, embed);
};