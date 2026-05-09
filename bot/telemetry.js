const { AsyncLocalStorage } = require('node:async_hooks');
const { randomUUID } = require('node:crypto');

const commandTelemetryStorage = new AsyncLocalStorage();

const outcomePriority = {
    success: 0,
    denied: 1,
    timed_out: 2,
    failed: 3,
};

const createCommandTelemetryContext = (commandName) => {
    const startedAtMs = Date.now();

    return {
        id: randomUUID(),
        ts: Math.floor(startedAtMs / 1000),
        startedAtMs,
        commandName,
        outcome: 'success',
        denialReason: undefined,
        requestType: undefined,
        bridgeRequestCount: 0,
        interactionAckMs: undefined,
        bridgeRoundtripMs: 0,
        handlerDurationMs: 0,
    };
};

const markInteractionAcknowledged = (context) => {
    if (!context || typeof context.interactionAckMs === 'number') return;
    context.interactionAckMs = Date.now() - context.startedAtMs;
};

const instrumentInteractionAck = (interaction, context) => {
    const methodNames = ['reply', 'deferReply', 'update', 'showModal'];
    const restores = [];

    for (const methodName of methodNames) {
        if (typeof interaction[methodName] !== 'function') continue;

        const original = interaction[methodName].bind(interaction);
        interaction[methodName] = async (...args) => {
            const result = await original(...args);
            markInteractionAcknowledged(context);
            return result;
        };
        restores.push(() => {
            interaction[methodName] = original;
        });
    }

    return () => {
        for (const restore of restores) {
            restore();
        }
    };
};

const updateCommandOutcome = (context, outcome, denialReason) => {
    if (!context || !outcome) return;

    const shouldReplace = outcomePriority[outcome] >= outcomePriority[context.outcome];
    if (shouldReplace) {
        context.outcome = outcome;
        context.denialReason = outcome === 'denied' ? denialReason ?? context.denialReason ?? 'unknown' : undefined;
        return;
    }

    if (outcome === 'denied' && !context.denialReason && denialReason) {
        context.denialReason = denialReason;
    }
};

const noteBridgeRequestTelemetry = (context, telemetry = {}) => {
    if (!context) return;

    context.bridgeRequestCount += 1;
    if (typeof telemetry.requestType === 'string' && telemetry.requestType.length) {
        if (!context.requestType) {
            context.requestType = telemetry.requestType;
        } else if (context.requestType !== telemetry.requestType) {
            context.requestType = 'multiple';
        }
    }
    if (typeof telemetry.bridgeRoundtripMs === 'number' && Number.isFinite(telemetry.bridgeRoundtripMs)) {
        context.bridgeRoundtripMs += telemetry.bridgeRoundtripMs;
    }
    if (typeof telemetry.handlerDurationMs === 'number' && Number.isFinite(telemetry.handlerDurationMs)) {
        context.handlerDurationMs += telemetry.handlerDurationMs;
    }

    updateCommandOutcome(context, telemetry.outcome, telemetry.denialReason);
};

const markCommandFailure = (context, error) => {
    const message = error instanceof Error ? error.message : String(error);
    const outcome = /timeout/i.test(message) ? 'timed_out' : 'failed';
    updateCommandOutcome(context, outcome);
};

const markCommandDenied = (context, denialReason = 'unknown') => {
    updateCommandOutcome(context, 'denied', denialReason);
};

const getCurrentCommandTelemetry = () => commandTelemetryStorage.getStore();

const runWithCommandTelemetry = (context, callback) => {
    return commandTelemetryStorage.run(context, callback);
};

const buildCommandTelemetryEvent = (context) => {
    if (!context) return null;

    return {
        id: context.id,
        ts: context.ts,
        commandName: context.commandName,
        outcome: context.outcome,
        ...(context.outcome === 'denied' && context.denialReason ? { denialReason: context.denialReason } : {}),
        ...(context.requestType ? { requestType: context.requestType } : {}),
        ...(context.bridgeRequestCount > 0 ? { bridgeRequestCount: context.bridgeRequestCount } : {}),
        ...(typeof context.interactionAckMs === 'number'
            ? { interactionAckMs: Math.max(0, Math.round(context.interactionAckMs)) }
            : {}),
        ...(context.bridgeRequestCount > 0
            ? { bridgeRoundtripMs: Math.max(0, Math.round(context.bridgeRoundtripMs)) }
            : {}),
        ...(context.handlerDurationMs > 0 ? { handlerDurationMs: Math.max(0, Math.round(context.handlerDurationMs)) } : {}),
    };
};

module.exports = {
    buildCommandTelemetryEvent,
    createCommandTelemetryContext,
    getCurrentCommandTelemetry,
    instrumentInteractionAck,
    markCommandDenied,
    markCommandFailure,
    noteBridgeRequestTelemetry,
    runWithCommandTelemetry,
};