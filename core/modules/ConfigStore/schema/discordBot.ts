import { z } from 'zod';
import { discordSnowflakeSchema, typeDefinedConfig, typeNullableConfig } from './utils';
import {
    defaultEmbedConfigJson,
    defaultEmbedJson,
    defaultPlayerListEmbedConfigJson,
    defaultPlayerListEmbedJson,
} from '@modules/DiscordBot/defaultJsons';
import { SYM_FIXER_DEFAULT } from '@lib/symbols';
import {
    isDiscordLogRouteKey,
    normalizeDiscordLogRoutes,
} from '@shared/discordLogRoutes';

const enabled = typeDefinedConfig({
    name: 'Bot Enabled',
    default: false,
    validator: z.boolean(),
    fixer: SYM_FIXER_DEFAULT,
});

const token = typeNullableConfig({
    name: 'Bot Token',
    default: null,
    validator: z.string().min(1).nullable(),
    fixer: SYM_FIXER_DEFAULT,
});

const guild = typeNullableConfig({
    name: 'Server ID',
    default: null,
    validator: discordSnowflakeSchema.nullable(),
    fixer: SYM_FIXER_DEFAULT,
});

const warningsChannel = typeNullableConfig({
    name: 'Warnings Channel ID',
    default: null,
    validator: discordSnowflakeSchema.nullable(),
    fixer: SYM_FIXER_DEFAULT,
});

const logGuildOverride = typeNullableConfig({
    name: 'Discord Log Guild Override',
    default: null,
    validator: discordSnowflakeSchema.nullable(),
    fixer: SYM_FIXER_DEFAULT,
});

//We are not validating the JSON, only that it is a string
export const attemptMinifyJsonString = (input: string) => {
    try {
        return JSON.stringify(JSON.parse(input));
    } catch (error) {
        return input;
    }
};

const embedJson = typeDefinedConfig({
    name: 'Status Embed JSON',
    default: defaultEmbedJson,
    validator: z.string().min(1).transform(attemptMinifyJsonString),
    //NOTE: no true validation in here, done in the module only
    fixer: SYM_FIXER_DEFAULT,
});

const embedConfigJson = typeDefinedConfig({
    name: 'Status Config JSON',
    default: defaultEmbedConfigJson,
    validator: z.string().min(1).transform(attemptMinifyJsonString),
    //NOTE: no true validation in here, done in the module only
    fixer: SYM_FIXER_DEFAULT,
});

const playerListEmbedJson = typeDefinedConfig({
    name: 'Player List Embed JSON',
    default: defaultPlayerListEmbedJson,
    validator: z.string().min(1).transform(attemptMinifyJsonString),
    fixer: SYM_FIXER_DEFAULT,
});

const playerListEmbedConfigJson = typeDefinedConfig({
    name: 'Player List Config JSON',
    default: defaultPlayerListEmbedConfigJson,
    validator: z.string().min(1).transform(attemptMinifyJsonString),
    fixer: SYM_FIXER_DEFAULT,
});

const oauthClientId = typeNullableConfig({
    name: 'OAuth Client ID',
    default: null,
    validator: z.string().min(1).nullable(),
    fixer: SYM_FIXER_DEFAULT,
});

const oauthClientSecret = typeNullableConfig({
    name: 'OAuth Client Secret',
    default: null,
    validator: z.string().min(1).nullable(),
    fixer: SYM_FIXER_DEFAULT,
});

const ticketChannelId = typeNullableConfig({
    name: 'Ticket Threads Channel ID',
    default: null,
    validator: discordSnowflakeSchema.nullable(),
    fixer: SYM_FIXER_DEFAULT,
});

const ticketThreadNotifyEnabled = typeDefinedConfig({
    name: 'Ticket Thread Notifications Enabled',
    default: true,
    validator: z.boolean(),
    fixer: SYM_FIXER_DEFAULT,
});

const bridgePort = typeDefinedConfig({
    name: 'Bridge Port',
    default: 36120,
    validator: z.number().int().min(1024).max(65535),
    fixer: SYM_FIXER_DEFAULT,
});

const bridgeSecret = typeDefinedConfig({
    name: 'Bridge Secret',
    default: '',
    validator: z.string(),
    fixer: SYM_FIXER_DEFAULT,
});

const presence = typeDefinedConfig({
    name: 'Presence Config',
    default: {
        status: 'online',
        activityType: 'Watching',
        activityText: '[{playerCount}/{maxPlayers}] on {serverName}',
        updateIntervalSeconds: 60,
    },
    validator: z
        .object({
            status: z.enum(['online', 'idle', 'dnd', 'invisible']).default('online'),
            activityType: z.enum(['Playing', 'Watching', 'Listening', 'Competing', 'Custom']).default('Watching'),
            activityText: z.string().max(128).default('[{playerCount}/{maxPlayers}] on {serverName}'),
            updateIntervalSeconds: z.number().int().min(30).max(3600).default(60),
        })
        .default({}),
    fixer: SYM_FIXER_DEFAULT,
});

const rolePermissions = typeDefinedConfig({
    name: 'Role Permissions',
    default: [],
    validator: z
        .array(
            z.object({
                id: z.string().uuid(),
                label: z.string(),
                discordRoleIds: z.array(z.string()),
                permissionPresetId: z.string().min(1).nullable().optional(),
                fxPanelPermissions: z.array(z.string()).optional(),
            }),
        )
        .transform((mappings) =>
            mappings.map((mapping) => ({
                id: mapping.id,
                label: mapping.label,
                discordRoleIds: mapping.discordRoleIds,
                permissionPresetId:
                    typeof mapping.permissionPresetId === 'string' && mapping.permissionPresetId.length
                        ? mapping.permissionPresetId
                        : null,
            })),
        )
        .default([]),
    fixer: SYM_FIXER_DEFAULT,
});

const customCommands = typeDefinedConfig({
    name: 'Custom Commands',
    default: [],
    validator: z
        .array(
            z.object({
                id: z.string().uuid(),
                name: z.string().regex(/^[\w-]{1,32}$/),
                description: z.string().max(100),
                enabled: z.boolean().default(true),
                ephemeral: z.boolean().default(true),
                permissionId: z.string().uuid().nullable().default(null),
                responseType: z.enum(['text', 'embed']),
                responseConfig: z.unknown(),
                cooldownSeconds: z.number().int().min(0).max(3600).default(5),
            }),
        )
        .default([]),
    fixer: SYM_FIXER_DEFAULT,
});

const logRoutes = typeDefinedConfig({
    name: 'Discord Log Routes',
    default: [],
    validator: z
        .array(
            z.object({
                key: z.string().refine((value) => isDiscordLogRouteKey(value), 'Invalid Discord log route key.'),
                enabled: z.boolean().default(false),
                channelId: z.string().min(1).nullable().default(null),
                useEntryFilter: z.boolean().default(false),
                entryFilter: z.array(z.string()).default([]),
                useCommandFilter: z.boolean().optional(),
                commandFilter: z.array(z.string()).optional(),
            }),
        )
        .transform((routes) => normalizeDiscordLogRoutes(routes))
        .default([]),
    fixer: SYM_FIXER_DEFAULT,
});

const eventActions = typeDefinedConfig({
    name: 'Event Actions',
    default: [],
    validator: z
        .array(
            z.object({
                id: z.string().uuid(),
                enabled: z.boolean().default(true),
                trigger: z.enum([
                    'player.join',
                    'player.leave',
                    'player.ban',
                    'player.kick',
                    'player.warn',
                    'server.start',
                    'server.stop',
                    'server.restart',
                    'server.crash',
                ]),
                channelId: z.string().nullable().default(null),
                responseType: z.enum(['text', 'embed']),
                responseConfig: z.unknown(),
                cooldownSeconds: z.number().int().min(0).default(0),
            }),
        )
        .default([]),
    fixer: SYM_FIXER_DEFAULT,
});

const appealsChannelId = typeNullableConfig({
    name: 'Appeals Channel ID',
    default: null,
    validator: discordSnowflakeSchema.nullable(),
    fixer: SYM_FIXER_DEFAULT,
});

const embedRefreshIntervalSeconds = typeDefinedConfig({
    name: 'Status Embed Refresh Interval Seconds',
    default: 30,
    validator: z.number().int().min(15).max(300),
    fixer: SYM_FIXER_DEFAULT,
});

export default {
    enabled,
    token,
    guild,
    warningsChannel,
    logGuildOverride,
    bridgePort,
    bridgeSecret,
    presence,
    rolePermissions,
    customCommands,
    logRoutes,
    eventActions,
    appealsChannelId,
    ticketChannelId,
    ticketThreadNotifyEnabled,
    embedJson,
    embedConfigJson,
    playerListEmbedJson,
    playerListEmbedConfigJson,
    embedRefreshIntervalSeconds,
    oauthClientId,
    oauthClientSecret,
} as const;
