/**
 * fxPanel Addon Discord SDK
 *
 * Helper layer for addon-owned Discord commands and events. It wraps the raw
 * bridge object exposed by the standalone bot runtime and also provides a mock
 * bridge for local development.
 */

const addonIdRegex = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const httpMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const addonInteractionKindCodes = Object.freeze({
    button: 'btn',
    modal: 'mdl',
    stringSelectMenu: 'ssm',
    userSelectMenu: 'usm',
    roleSelectMenu: 'rsm',
    mentionableSelectMenu: 'msm',
    channelSelectMenu: 'csm',
});
const addonInteractionCodeToKind = new Map(
    Object.entries(addonInteractionKindCodes).map(([kind, code]) => [code, kind]),
);
const maxDiscordCustomIdLength = 100;
const maxAutocompleteChoices = 25;

const toNonEmptyString = (value) => {
    if (typeof value !== 'string') return undefined;

    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
};

const sanitizeMemberRoles = (memberRoles) => {
    if (!Array.isArray(memberRoles)) return [];

    return [...new Set(memberRoles.map((roleId) => toNonEmptyString(roleId)).filter(Boolean))];
};

const isSafeRelativePath = (value) => {
    const normalized = toNonEmptyString(value);
    if (!normalized) return false;
    if (/^[a-zA-Z]:[\\/]/.test(normalized)) return false;
    if (normalized.startsWith('/') || normalized.startsWith('\\')) return false;

    return !normalized.split(/[\\/]+/).some((segment) => segment === '..');
};

const assertAddonId = (addonId) => {
    const normalized = toNonEmptyString(addonId);
    if (!normalized || !addonIdRegex.test(normalized)) {
        throw new Error('addonId must be 3-64 chars, lowercase alphanumeric + hyphens.');
    }

    return normalized;
};

const assertInteractionKind = (kind) => {
    const normalized = toNonEmptyString(kind);
    if (!normalized || !(normalized in addonInteractionKindCodes)) {
        throw new Error(`Unsupported addon interaction kind: ${String(kind)}`);
    }

    return normalized;
};

const assertInteractionAction = (action) => {
    const normalized = toNonEmptyString(action);
    if (!normalized) {
        throw new Error('Addon interaction action is required.');
    }

    return normalized;
};

const assertBridge = (bridge) => {
    if (!bridge || typeof bridge !== 'object') {
        throw new Error('Discord bridge must be an object with request() and send().');
    }
    if (typeof bridge.request !== 'function') {
        throw new Error('Discord bridge must expose request(type, payload, timeoutMs).');
    }

    return bridge;
};

const normalizeMethod = (method = 'POST') => {
    const normalized = toNonEmptyString(method)?.toUpperCase();
    if (!normalized || !httpMethods.has(normalized)) {
        throw new Error(`Unsupported addon route method: ${String(method)}`);
    }

    return normalized;
};

const normalizeHeaders = (headers) => {
    if (!headers || typeof headers !== 'object') return undefined;

    const sanitized = Object.fromEntries(
        Object.entries(headers).filter((entry) => typeof entry[0] === 'string' && typeof entry[1] === 'string'),
    );

    return Object.keys(sanitized).length ? sanitized : undefined;
};

const encodeInteractionState = (state) => {
    if (state === undefined) return undefined;

    const serialized = typeof state === 'string' ? state : JSON.stringify(state);
    return Buffer.from(serialized, 'utf8').toString('base64url');
};

const decodeInteractionState = (rawState) => {
    const normalized = toNonEmptyString(rawState);
    if (!normalized) return undefined;

    try {
        const decoded = Buffer.from(normalized, 'base64url').toString('utf8');
        try {
            return JSON.parse(decoded);
        } catch {
            return decoded;
        }
    } catch {
        return undefined;
    }
};

export const createAddonInteractionId = ({ addonId, kind, action, state } = {}) => {
    const normalizedAddonId = assertAddonId(addonId);
    const normalizedKind = assertInteractionKind(kind);
    const normalizedAction = assertInteractionAction(action);
    const code = addonInteractionKindCodes[normalizedKind];
    const encodedState = encodeInteractionState(state);

    const customId = ['fxa', normalizedAddonId, code, normalizedAction, encodedState]
        .filter((segment) => typeof segment === 'string' && segment.length)
        .join(':');
    if (customId.length > maxDiscordCustomIdLength) {
        throw new Error(`Addon interaction customId exceeds Discord's ${maxDiscordCustomIdLength}-character limit.`);
    }

    return customId;
};

export const parseAddonInteractionId = (customId, expectedAddonId) => {
    if (typeof customId !== 'string' || !customId.startsWith('fxa:')) return null;

    const parts = customId.split(':');
    if (parts.length < 4) return null;

    const addonId = toNonEmptyString(parts[1]);
    const kind = addonInteractionCodeToKind.get(parts[2]);
    const action = toNonEmptyString(parts[3]);
    if (!addonId || !kind || !action) return null;
    if (expectedAddonId && addonId !== assertAddonId(expectedAddonId)) return null;

    const rawState = parts.length > 4 ? parts.slice(4).join(':') : undefined;
    return {
        addonId,
        kind,
        action,
        rawState,
        state: decodeInteractionState(rawState),
    };
};

const assertBuilderWithCustomId = (builder) => {
    if (!builder || typeof builder.setCustomId !== 'function') {
        throw new Error('Builder must expose setCustomId(value).');
    }

    return builder;
};

const maybeCallBuilderMethod = (builder, methodName, value) => {
    if (value === undefined || typeof builder[methodName] !== 'function') return builder;

    builder[methodName](value);
    return builder;
};

export const applyAddonInteractionCustomId = (builder, { addonId, kind, action, state } = {}) => {
    const normalizedBuilder = assertBuilderWithCustomId(builder);
    normalizedBuilder.setCustomId(createAddonInteractionId({ addonId, kind, action, state }));
    return normalizedBuilder;
};

export const configureAddonButton = (builder, { addonId, action, state, label, style, emoji, disabled } = {}) => {
    const configuredBuilder = applyAddonInteractionCustomId(builder, {
        addonId,
        kind: 'button',
        action,
        state,
    });

    maybeCallBuilderMethod(configuredBuilder, 'setLabel', toNonEmptyString(label));
    maybeCallBuilderMethod(configuredBuilder, 'setStyle', style);
    maybeCallBuilderMethod(configuredBuilder, 'setEmoji', emoji);
    maybeCallBuilderMethod(configuredBuilder, 'setDisabled', disabled === true);
    return configuredBuilder;
};

export const configureAddonModal = (builder, { addonId, action, state, title, components } = {}) => {
    const configuredBuilder = applyAddonInteractionCustomId(builder, {
        addonId,
        kind: 'modal',
        action,
        state,
    });

    maybeCallBuilderMethod(configuredBuilder, 'setTitle', toNonEmptyString(title));
    if (Array.isArray(components) && components.length > 0 && typeof configuredBuilder.addComponents === 'function') {
        configuredBuilder.addComponents(...components);
    }

    return configuredBuilder;
};

const normalizeAutocompleteChoice = (choice) => {
    if (typeof choice === 'string') {
        const normalized = toNonEmptyString(choice);
        return normalized ? { name: normalized, value: normalized } : null;
    }

    if (typeof choice === 'number' && Number.isFinite(choice)) {
        return {
            name: String(choice),
            value: choice,
        };
    }

    if (!choice || typeof choice !== 'object' || Array.isArray(choice)) return null;

    const name = toNonEmptyString(choice.name);
    const value = typeof choice.value === 'string' || typeof choice.value === 'number' ? choice.value : undefined;
    if (!name || value === undefined) return null;

    return { name, value };
};

export const respondWithAutocompleteChoices = async (interaction, choices = []) => {
    if (!interaction || typeof interaction.respond !== 'function') {
        throw new Error('Autocomplete interaction must expose respond(choices).');
    }

    const normalizedChoices = Array.isArray(choices)
        ? choices.map((choice) => normalizeAutocompleteChoice(choice)).filter(Boolean).slice(0, maxAutocompleteChoices)
        : [];

    return await interaction.respond(normalizedChoices);
};

export const createAddonDiscordInteractionHelpers = ({ addonId }) => {
    const normalizedAddonId = assertAddonId(addonId);

    return Object.freeze({
        createId: (kind, action, state) => createAddonInteractionId({ addonId: normalizedAddonId, kind, action, state }),
        parse: (customId) => parseAddonInteractionId(customId, normalizedAddonId),
        apply: (builder, kind, action, state) =>
            applyAddonInteractionCustomId(builder, { addonId: normalizedAddonId, kind, action, state }),
        button: (builder, action, options = {}) =>
            configureAddonButton(builder, { ...options, addonId: normalizedAddonId, action }),
        modal: (builder, action, options = {}) =>
            configureAddonModal(builder, { ...options, addonId: normalizedAddonId, action }),
    });
};

export const getDiscordInteractionRoleIds = (interaction) => {
    const roleCache = interaction?.member?.roles?.cache;
    if (!roleCache) return [];

    if (typeof roleCache.keys === 'function') {
        const guildId = toNonEmptyString(interaction?.guildId);
        return sanitizeMemberRoles([...roleCache.keys()].filter((roleId) => roleId !== guildId));
    }

    if (typeof roleCache.values === 'function') {
        return sanitizeMemberRoles([...roleCache.values()].map((role) => role?.id));
    }

    return sanitizeMemberRoles(roleCache);
};

export const getDiscordRequesterPayload = (interaction, overrides = {}) => {
    const requesterId = toNonEmptyString(overrides.requesterId) ?? toNonEmptyString(interaction?.user?.id);
    const requesterName =
        toNonEmptyString(overrides.requesterName) ??
        toNonEmptyString(interaction?.user?.tag) ??
        toNonEmptyString(interaction?.user?.username) ??
        toNonEmptyString(interaction?.member?.displayName);
    const memberRoles = Array.isArray(overrides.memberRoles)
        ? sanitizeMemberRoles(overrides.memberRoles)
        : getDiscordInteractionRoleIds(interaction);

    return {
        ...(requesterId ? { requesterId } : {}),
        ...(requesterName ? { requesterName } : {}),
        memberRoles,
    };
};

const buildManifestIssue = (path, message) => ({ path, message });

export const validateAddonDiscordManifest = (manifest) => {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        return {
            success: false,
            issues: [buildManifestIssue('manifest', 'manifest must be an object')],
        };
    }

    const issues = [];
    const result = {};

    if ('id' in manifest) {
        const addonId = toNonEmptyString(manifest.id);
        if (!addonId || !addonIdRegex.test(addonId)) {
            issues.push(buildManifestIssue('id', 'id must be 3-64 chars, lowercase alphanumeric + hyphens'));
        } else {
            result.id = addonId;
        }
    }

    if (!('discordBot' in manifest) || manifest.discordBot == null) {
        return issues.length > 0
            ? { success: false, issues }
            : { success: true, data: result };
    }

    const discordBot = manifest.discordBot;
    if (!discordBot || typeof discordBot !== 'object' || Array.isArray(discordBot)) {
        issues.push(buildManifestIssue('discordBot', 'discordBot must be an object'));
        return { success: false, issues };
    }

    const validatedDiscordBot = {};
    for (const field of ['commands', 'events']) {
        if (!(field in discordBot)) continue;

        const rawPath = discordBot[field];
        const normalizedPath = toNonEmptyString(rawPath);
        if (!normalizedPath) {
            issues.push(buildManifestIssue(`discordBot.${field}`, `${field} must be a non-empty string`));
            continue;
        }
        if (!isSafeRelativePath(normalizedPath)) {
            issues.push(
                buildManifestIssue(
                    `discordBot.${field}`,
                    `${field} must be an addon-relative path that does not escape the addon directory`,
                ),
            );
            continue;
        }

        validatedDiscordBot[field] = normalizedPath;
    }

    if (!validatedDiscordBot.commands && !validatedDiscordBot.events) {
        issues.push(buildManifestIssue('discordBot', 'discordBot must declare at least one of commands or events'));
    } else {
        result.discordBot = validatedDiscordBot;
    }

    return issues.length > 0
        ? { success: false, issues }
        : { success: true, data: result };
};

export const parseAddonDiscordManifest = (manifest) => {
    const result = validateAddonDiscordManifest(manifest);
    if (result.success) {
        return result.data;
    }

    const message = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
    throw new Error(message);
};

const requireSend = (bridge) => {
    if (typeof bridge.send !== 'function') {
        throw new Error('Discord bridge must expose send(message) for this operation.');
    }
};

const buildAddonRoutePayload = (addonId, request = {}) => {
    const routePath = toNonEmptyString(request.path);
    if (!routePath || !routePath.startsWith('/')) {
        throw new Error('Addon route path must start with "/".');
    }

    const requesterPayload =
        request.interaction || request.requesterId || request.requesterName || Array.isArray(request.memberRoles)
            ? getDiscordRequesterPayload(request.interaction, {
                  requesterId: request.requesterId,
                  requesterName: request.requesterName,
                  memberRoles: request.memberRoles,
              })
            : { memberRoles: [] };

    const headers = normalizeHeaders(request.headers);

    return {
        addonId,
        method: normalizeMethod(request.method ?? 'POST'),
        path: routePath,
        ...(request.body !== undefined ? { body: request.body } : {}),
        ...(headers ? { headers } : {}),
        ...(requesterPayload.requesterId ? { requesterId: requesterPayload.requesterId } : {}),
        ...(requesterPayload.requesterName ? { requesterName: requesterPayload.requesterName } : {}),
        memberRoles: requesterPayload.memberRoles,
    };
};

export const createMockDiscordBridge = ({ handlers = {}, onRequest, onSend } = {}) => {
    const initialHandlers = new Map(Object.entries(handlers));
    let handlerMap = new Map(initialHandlers);
    const requestLog = [];
    const sentMessages = [];

    const mockBridge = {
        async request(type, payload = {}, timeoutMs) {
            const normalizedType = toNonEmptyString(type);
            if (!normalizedType) {
                throw new Error('Mock bridge request type is required.');
            }

            const meta = {
                type: normalizedType,
                timeoutMs,
                requests: requestLog.slice(),
                sentMessages: sentMessages.slice(),
            };
            requestLog.push({ type: normalizedType, payload, timeoutMs });

            if (typeof onRequest === 'function') {
                return await onRequest(normalizedType, payload, meta);
            }

            if (!handlerMap.has(normalizedType)) {
                throw new Error(`No mock handler registered for bridge request "${normalizedType}".`);
            }

            const handler = handlerMap.get(normalizedType);
            return typeof handler === 'function' ? await handler(payload, meta) : handler;
        },
        send(message) {
            sentMessages.push(message);
            if (typeof onSend === 'function') {
                onSend(message, {
                    requests: requestLog.slice(),
                    sentMessages: sentMessages.slice(),
                });
            }
        },
        setHandler(type, handler) {
            const normalizedType = toNonEmptyString(type);
            if (!normalizedType) {
                throw new Error('Mock bridge handler type is required.');
            }

            handlerMap.set(normalizedType, handler);
            return mockBridge;
        },
        getRequests() {
            return requestLog.slice();
        },
        getSentMessages() {
            return sentMessages.slice();
        },
        reset() {
            requestLog.length = 0;
            sentMessages.length = 0;
            handlerMap = new Map(initialHandlers);
        },
    };

    return mockBridge;
};

export const createAddonDiscordSdk = ({ addonId, bridge }) => {
    const normalizedAddonId = assertAddonId(addonId);
    const normalizedBridge = assertBridge(bridge);
    const interactions = createAddonDiscordInteractionHelpers({ addonId: normalizedAddonId });

    const request = (type, payload = {}, timeoutMs) => {
        return normalizedBridge.request(type, payload, timeoutMs);
    };

    const send = (typeOrMessage, payload = {}) => {
        requireSend(normalizedBridge);

        if (typeof typeOrMessage === 'string') {
            normalizedBridge.send({ type: typeOrMessage, ...payload });
            return;
        }

        normalizedBridge.send(typeOrMessage);
    };

    return Object.freeze({
        addonId: normalizedAddonId,
        bridge: normalizedBridge,
        request,
        send,
        interactions,
        getRequesterPayload: (interaction, overrides) => getDiscordRequesterPayload(interaction, overrides),
        addonRoute: (route, timeoutMs) => request('addonRoute', buildAddonRoutePayload(normalizedAddonId, route), timeoutMs),
        getConfigSnapshot: (timeoutMs) => request('configSnapshot', {}, timeoutMs),
        resolveMemberRoles: (uid, timeoutMs) => {
            const normalizedUid = toNonEmptyString(uid);
            if (!normalizedUid) throw new Error('uid is required.');
            return request('resolveMemberRoles', { uid: normalizedUid }, timeoutMs);
        },
        resolveMemberProfile: (uid, timeoutMs) => {
            const normalizedUid = toNonEmptyString(uid);
            if (!normalizedUid) throw new Error('uid is required.');
            return request('resolveMemberProfile', { uid: normalizedUid }, timeoutMs);
        },
        respondWithChoices: (interaction, choices) => respondWithAutocompleteChoices(interaction, choices),
        refreshMemberCache: (timeoutMs) => request('refreshMemberCache', {}, timeoutMs),
        reloadCommands: () => send('reloadCommands'),
    });
};