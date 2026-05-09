export const botCommandOutcomes = ['success', 'denied', 'failed', 'timed_out'] as const;
export type BotCommandOutcome = (typeof botCommandOutcomes)[number];

export const botCommandDenialReasons = [
    'unlinked_account',
    'missing_permissions',
    'invalid_target',
    'feature_disabled',
    'invalid_request',
    'rate_limited',
    'unknown',
] as const;
export type BotCommandDenialReason = (typeof botCommandDenialReasons)[number];

export type BotCommandEvent = {
    id: string;
    ts: number;
    commandName: string;
    outcome: BotCommandOutcome;
    denialReason?: BotCommandDenialReason;
    requestType?: string;
    bridgeRequestCount?: number;
    interactionAckMs?: number;
    bridgeRoundtripMs?: number;
    handlerDurationMs?: number;
};

export type BotCommandResponseTelemetry = {
    outcome: BotCommandOutcome;
    denialReason?: BotCommandDenialReason;
    requestType?: string;
    handlerDurationMs?: number;
};

export type BotCommandRollup = {
    total: number;
    success: number;
    denied: number;
    failed: number;
    timedOut: number;
    successRate: number;
    avgInteractionAckMs: number;
    avgBridgeRoundtripMs: number;
    avgHandlerDurationMs: number;
};

export type BotCommandOverview = {
    total: number;
    success: number;
    denied: number;
    failed: number;
    timedOut: number;
    uniqueCommands: number;
    successRate: number;
};

export type BotCommandLatencySummary = {
    avgInteractionAckMs: number;
    p95InteractionAckMs: number;
    avgBridgeRoundtripMs: number;
    p95BridgeRoundtripMs: number;
    avgHandlerDurationMs: number;
    p95HandlerDurationMs: number;
};

export type BotCommandBreakdownEntry = {
    commandName: string;
    total: number;
    success: number;
    denied: number;
    failed: number;
    timedOut: number;
    avgInteractionAckMs: number;
    avgBridgeRoundtripMs: number;
    avgHandlerDurationMs: number;
};

export type BotCommandDenialBreakdownEntry = {
    reason: BotCommandDenialReason;
    count: number;
};

export type BotCommandTimelineDay = {
    date: string;
    total: number;
    success: number;
    denied: number;
    failed: number;
    timedOut: number;
};

export type BotCommandAnalyticsSummary = {
    overview: BotCommandOverview;
    latency: BotCommandLatencySummary;
    byCommand: BotCommandBreakdownEntry[];
    denialReasons: BotCommandDenialBreakdownEntry[];
    timelineDays: BotCommandTimelineDay[];
    rollups: {
        '7d': BotCommandRollup;
        '30d': BotCommandRollup;
    };
};