const addonInteractionKindCodes = Object.freeze({
    button: 'btn',
    modal: 'mdl',
    stringSelectMenu: 'ssm',
    userSelectMenu: 'usm',
    roleSelectMenu: 'rsm',
    mentionableSelectMenu: 'msm',
    channelSelectMenu: 'csm',
});

const addonInteractionKindNames = Object.freeze(Object.keys(addonInteractionKindCodes));
const addonInteractionCodeToKind = new Map(
    Object.entries(addonInteractionKindCodes).map(([kind, code]) => [code, kind]),
);
const addonRuntimeIssueLimit = 50;

const toNonEmptyString = (value) => {
    if (typeof value !== 'string') return undefined;

    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
};

const normalizeRateLimit = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    const max = value.max;
    const windowMs = value.windowMs;
    if (!Number.isInteger(max) || !Number.isInteger(windowMs)) return null;
    if (max < 1 || windowMs < 1_000) return null;

    return { max, windowMs };
};

const createInteractionRegistry = () => {
    return Object.fromEntries(addonInteractionKindNames.map((kind) => [kind, new Map()]));
};

const resolveInteractionCollection = (command, kind) => {
    const nested = command?.interactions;
    if (nested && typeof nested === 'object' && !Array.isArray(nested) && nested[kind]) {
        return nested[kind];
    }

    return command?.[kind];
};

const normalizeInteractionHandlerEntry = (value) => {
    if (typeof value === 'function') {
        return {
            execute: value,
            rateLimit: null,
        };
    }

    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.execute !== 'function') {
        return null;
    }

    return {
        execute: value.execute,
        rateLimit: normalizeRateLimit(value.rateLimit),
    };
};

const decodeInteractionState = (rawState) => {
    if (!rawState) return undefined;

    try {
        const decoded = Buffer.from(rawState, 'base64url').toString('utf8');
        try {
            return JSON.parse(decoded);
        } catch {
            return decoded;
        }
    } catch {
        return undefined;
    }
};

const buildInteractionKey = (addonId, action) => `${addonId}:${action}`;

const parseAddonInteractionId = (customId) => {
    if (typeof customId !== 'string' || !customId.startsWith('fxa:')) return null;

    const parts = customId.split(':');
    if (parts.length < 4) return null;

    const addonId = toNonEmptyString(parts[1]);
    const kind = addonInteractionCodeToKind.get(parts[2]);
    const action = toNonEmptyString(parts[3]);
    if (!addonId || !kind || !action) return null;

    const rawState = parts.length > 4 ? parts.slice(4).join(':') : undefined;

    return {
        addonId,
        kind,
        action,
        rawState,
        state: decodeInteractionState(rawState),
    };
};

const createAddonRuntimeState = () => {
    return {
        commands: new Map(),
        interactionHandlers: createInteractionRegistry(),
        rateLimitBuckets: new Map(),
        runtimeIssues: [],
    };
};

const resetAddonRuntimeRegistries = (runtimeState) => {
    runtimeState.commands.clear();
    runtimeState.rateLimitBuckets.clear();

    for (const kind of addonInteractionKindNames) {
        runtimeState.interactionHandlers[kind].clear();
    }
};

const registerAddonCommandModule = (runtimeState, { addonId, addonRateLimit, commandName, filePath, command }) => {
    const normalizedAddonRateLimit = normalizeRateLimit(addonRateLimit);
    const commandRateLimit = normalizeRateLimit(command.rateLimit) ?? normalizedAddonRateLimit;
    const autocompleteRateLimit = normalizeRateLimit(command.autocompleteRateLimit) ?? commandRateLimit;

    runtimeState.commands.set(commandName, {
        addonId,
        filePath,
        rateLimit: commandRateLimit,
        autocompleteRateLimit,
    });

    for (const kind of addonInteractionKindNames) {
        const collection = resolveInteractionCollection(command, kind);
        if (!collection || typeof collection !== 'object' || Array.isArray(collection)) continue;

        for (const [action, rawHandler] of Object.entries(collection)) {
            const normalizedAction = toNonEmptyString(action);
            const handler = normalizeInteractionHandlerEntry(rawHandler);
            if (!normalizedAction || !handler) continue;

            runtimeState.interactionHandlers[kind].set(buildInteractionKey(addonId, normalizedAction), {
                addonId,
                action: normalizedAction,
                kind,
                commandName,
                filePath,
                execute: handler.execute,
                rateLimit: handler.rateLimit ?? commandRateLimit,
            });
        }
    }
};

const getAddonCommandMetadata = (runtimeState, commandName) => {
    return runtimeState.commands.get(commandName) ?? null;
};

const resolveAddonInteractionHandler = (runtimeState, customId) => {
    const parsed = parseAddonInteractionId(customId);
    if (!parsed) return null;

    return {
        parsed,
        handler: runtimeState.interactionHandlers[parsed.kind].get(buildInteractionKey(parsed.addonId, parsed.action)) ?? null,
    };
};

const consumeAddonRateLimit = (runtimeState, { addonId, handlerId, requesterId, rateLimit }) => {
    const normalizedRateLimit = normalizeRateLimit(rateLimit);
    if (!normalizedRateLimit) {
        return {
            limited: false,
            remaining: null,
            resetAt: null,
        };
    }

    const now = Date.now();
    const subjectId = toNonEmptyString(requesterId) ?? 'anonymous';
    const bucketKey = `${addonId}:${handlerId}:${subjectId}`;
    const existingBucket = runtimeState.rateLimitBuckets.get(bucketKey);

    if (!existingBucket || existingBucket.resetAt <= now) {
        const nextBucket = {
            count: 1,
            resetAt: now + normalizedRateLimit.windowMs,
        };
        runtimeState.rateLimitBuckets.set(bucketKey, nextBucket);

        return {
            limited: false,
            remaining: Math.max(0, normalizedRateLimit.max - 1),
            resetAt: nextBucket.resetAt,
        };
    }

    if (existingBucket.count >= normalizedRateLimit.max) {
        return {
            limited: true,
            remaining: 0,
            resetAt: existingBucket.resetAt,
        };
    }

    existingBucket.count += 1;

    return {
        limited: false,
        remaining: Math.max(0, normalizedRateLimit.max - existingBucket.count),
        resetAt: existingBucket.resetAt,
    };
};

const recordAddonRuntimeIssue = (runtimeState, issue) => {
    const addonId = toNonEmptyString(issue?.addonId);
    const interactionType = toNonEmptyString(issue?.interactionType);
    const phase = issue?.phase === 'rate_limit' ? 'rate_limit' : 'execute';
    const handlerId = toNonEmptyString(issue?.handlerId);
    const message = toNonEmptyString(issue?.message);
    if (!addonId || !interactionType || !handlerId || !message) return null;

    const updatedAt = typeof issue.updatedAt === 'number' ? issue.updatedAt : Date.now();
    const signature = `${addonId}:${interactionType}:${phase}:${handlerId}:${message}`;
    const existingIssue = runtimeState.runtimeIssues.find((entry) => entry.signature === signature);

    if (existingIssue) {
        existingIssue.count += 1;
        existingIssue.updatedAt = updatedAt;
        return existingIssue;
    }

    const nextIssue = {
        signature,
        addonId,
        interactionType,
        phase,
        handlerId,
        message,
        filePath: toNonEmptyString(issue?.filePath) ?? null,
        updatedAt,
        count: 1,
    };
    runtimeState.runtimeIssues.unshift(nextIssue);

    if (runtimeState.runtimeIssues.length > addonRuntimeIssueLimit) {
        runtimeState.runtimeIssues.length = addonRuntimeIssueLimit;
    }

    return nextIssue;
};

module.exports = {
    createAddonRuntimeState,
    resetAddonRuntimeRegistries,
    registerAddonCommandModule,
    getAddonCommandMetadata,
    resolveAddonInteractionHandler,
    consumeAddonRateLimit,
    recordAddonRuntimeIssue,
};