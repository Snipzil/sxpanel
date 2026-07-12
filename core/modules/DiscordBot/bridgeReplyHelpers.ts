import { txEnv } from '@core/globalData';
import type { DatabaseBotCommandEventType } from '@modules/Database/databaseTypes';
import type { BotCommandDenialReason, BotCommandResponseTelemetry } from '@shared/discordBotAnalyticsTypes';
import type { SystemLogActionId } from '@shared/systemLogTypes';
import { buildDiscordCardMessageFromEmbed } from './componentsV2';
import { translateDiscord } from './discordLocale';
import type { BridgeMessage } from './bridgeServer';

export const translateBot = (key: string, data: Record<string, unknown> = {}) => {
    return translateDiscord(key, data);
};

export const EPHEMERAL_MESSAGE_FLAG = 1 << 6;

export type ReplyPayload = {
    flags?: number;
    content?: string;
    embeds?: Record<string, unknown>[];
    components?: Record<string, unknown>[];
};

export type BridgeCommandResponse = {
    telemetry?: BotCommandResponseTelemetry;
    [key: string]: unknown;
};

export const replyColors = {
    info: 0x1d76c9,
    success: 0x0ba70b,
    warning: 0xfff100,
    danger: 0xa70b28,
} as const;

export const infoEmbedColor = 0x4262e2;
export const commandFooter = {
    icon_url: 'https://cdn.discordapp.com/emojis/1062339910654246964.webp?size=96&quality=lossless',
    text: `sxPanel ${txEnv.txaVersion}`,
};

export const buildReply = (type: keyof typeof replyColors, description: string, ephemeral = false): ReplyPayload => {
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

export const withTelemetry = <T extends BridgeCommandResponse>(
    response: T,
    telemetry: BotCommandResponseTelemetry,
): T => {
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

export const buildReplyResult = (
    type: keyof typeof replyColors,
    description: string,
    telemetry: BotCommandResponseTelemetry,
    ephemeral = false,
) => {
    return withTelemetry({ reply: buildReply(type, description, ephemeral) }, telemetry);
};

export const buildDeniedReply = (
    type: keyof typeof replyColors,
    description: string,
    denialReason: BotCommandDenialReason,
    ephemeral = true,
) => {
    return buildReplyResult(type, description, { outcome: 'denied', denialReason }, ephemeral);
};

export const buildFailedReply = (type: keyof typeof replyColors, description: string, ephemeral = true) => {
    return buildReplyResult(type, description, { outcome: 'failed' }, ephemeral);
};

export const buildSuccessResponse = <T extends BridgeCommandResponse>(response: T): T => {
    return withTelemetry(response, { outcome: 'success' });
};

export const buildEmbedReply = (embed: Record<string, unknown>, ephemeral = true) => {
    return buildSuccessResponse({
        reply: buildDiscordCardMessageFromEmbed(embed, {
            flags: ephemeral ? EPHEMERAL_MESSAGE_FLAG : undefined,
        }),
    });
};

export const normalizeBotCommandEvent = (message: BridgeMessage): DatabaseBotCommandEventType | null => {
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

export const logDiscordAdminAction = (adminName: string, message: string, actionId?: SystemLogActionId) => {
    txCore.logger.system.write(adminName, message, 'action', { actionId });
};
