/**
 * fxPanel Addon SDK
 *
 * Runtime SDK for fxPanel addon server processes.
 *
 * Two transport modes are supported transparently:
 *   1. CHILD-PROCESS / WORKER  — addon runs in its own Node process or worker.
 *      IPC uses process.send / process.on('message').
 *   2. IN-PROCESS              — addon runs in the same realm as fxPanel core
 *      (used on Linux/cfx-server hosts where no separate Node binary is
 *      available and worker_threads cannot be safely terminated). IPC uses a
 *      per-addon channel object handed to createAddon() via globalThis.
 *
 * The addon author writes the same code either way: `createAddon()`.
 */

/**
 * Creates and returns an addon instance that communicates with fxPanel core.
 */
export function createAddon() {
    // In-process runtime hands us a channel object via a single-shot global
    // slot consumed synchronously during the addon module's top-level execution.
    const pending = globalThis.__TX_PENDING_ADDON__;
    const channel = pending && typeof pending === 'object' ? pending.channel : null;
    if (pending) {
        // Consume immediately so concurrent loads cannot collide.
        delete globalThis.__TX_PENDING_ADDON__;
    }

    const addonId = (pending && pending.addonId) || process.env.ADDON_ID;
    if (!addonId) {
        throw new Error('@fxpanel/addon-sdk: ADDON_ID environment variable not set. Is this running inside fxPanel?');
    }

    // Abstract IPC: in-process uses the channel; otherwise process.send/on.
    const transport = channel
        ? {
            send: (m) => channel.sendToCore(m),
            onMessage: (fn) => channel.onCoreMessage(fn),
            isInProcess: true,
        }
        : {
            send: (m) => { if (process.send) process.send(m); },
            onMessage: (fn) => process.on('message', fn),
            isInProcess: false,
        };

    let permissions = [];
    let isReady = false;
    const routes = [];
    const publicRoutes = [];
    const eventHandlers = new Map();
    const pendingStorage = new Map();
    const pendingApiCalls = new Map();
    let correlationCounter = 0;

    /**
     * Generate a unique correlation ID.
     */
    function nextId() {
        return `sdk-${++correlationCounter}-${Date.now()}`;
    }

    /**
     * Send an IPC message to the core.
     */
    function send(message) {
        try { transport.send(message); } catch { /* channel closed */ }
    }

    // ============================================
    // Storage API
    // ============================================
    const storage = {
        get(key) {
            return storageRequest('get', key);
        },
        set(key, value) {
            return storageRequest('set', key, value);
        },
        delete(key) {
            return storageRequest('delete', key);
        },
        list(prefix) {
            return storageRequest('list', prefix);
        },
        async has(key) {
            const value = await storageRequest('get', key);
            return value != null;
        },
        async getOr(key, defaultValue) {
            const value = await storageRequest('get', key);
            return value ?? defaultValue;
        },
    };

    function storageRequest(op, key, value) {
        return new Promise((resolve, reject) => {
            const id = nextId();
            const timer = setTimeout(() => {
                pendingStorage.delete(id);
                reject(new Error(`Storage ${op} timed out after 5000ms`));
            }, 5000);

            pendingStorage.set(id, { resolve, reject, timer });

            send({
                type: 'storage-request',
                id,
                payload: { op, key, value },
            });
        });
    }

    // ============================================
    // Route Registration
    // ============================================
    const routeHandlers = new Map();
    const publicRouteHandlers = new Map();

    function registerRoute(method, path, handler) {
        const key = `${method.toUpperCase()}:${path}`;
        routeHandlers.set(key, { method: method.toUpperCase(), path, handler });
        routes.push({ method: method.toUpperCase(), path });
    }

    function registerPublicRoute(method, path, handler) {
        const key = `${method.toUpperCase()}:${path}`;
        publicRouteHandlers.set(key, { method: method.toUpperCase(), path, handler });
        publicRoutes.push({ method: method.toUpperCase(), path });
    }

    // ============================================
    // WebSocket API
    // ============================================
    const wsHandlers = {
        onSubscribeFn: null,
        onUnsubscribeFn: null,
    };

    const ws = {
        push(event, data) {
            send({ type: 'ws-push', payload: { event, data } });
        },
        onSubscribe(handler) {
            wsHandlers.onSubscribeFn = handler;
        },
        onUnsubscribe(handler) {
            wsHandlers.onUnsubscribeFn = handler;
        },
    };

    // ============================================
    // Event System
    // ============================================
    function on(event, handler) {
        if (!eventHandlers.has(event)) {
            eventHandlers.set(event, []);
        }
        eventHandlers.get(event).push(handler);
    }

    function off(event, handler) {
        const handlers = eventHandlers.get(event);
        if (!handlers) return;
        if (handler) {
            const idx = handlers.indexOf(handler);
            if (idx !== -1) handlers.splice(idx, 1);
            if (handlers.length === 0) eventHandlers.delete(event);
        } else {
            eventHandlers.delete(event);
        }
    }

    // ============================================
    // Logging
    // ============================================
    const log = {
        info(message) {
            send({ type: 'log', payload: { level: 'info', message: String(message) } });
        },
        warn(message) {
            send({ type: 'log', payload: { level: 'warn', message: String(message) } });
        },
        error(message) {
            send({ type: 'log', payload: { level: 'error', message: String(message) } });
        },
    };

    // ============================================
    // Players API
    // ============================================
    function apiCall(method, args) {
        return new Promise((resolve, reject) => {
            const id = nextId();
            const timer = setTimeout(() => {
                pendingApiCalls.delete(id);
                reject(new Error(`API call ${method} timed out after 5000ms`));
            }, 5000);
            pendingApiCalls.set(id, { resolve, reject, timer });
            send({ type: 'api-call', id, payload: { method, args } });
        });
    }

    const players = {
        addTag(netid, tagId) {
            return apiCall('players.addTag', [netid, tagId]);
        },
        removeTag(netid, tagId) {
            return apiCall('players.removeTag', [netid, tagId]);
        },
    };

    // ============================================
    // Signal Ready
    // ============================================
    function ready() {
        if (isReady) return;
        isReady = true;
        send({
            type: 'ready',
            payload: {
                routes,
                publicRoutes: publicRoutes.length > 0 ? publicRoutes : undefined,
            },
        });
    }

    // ============================================
    // IPC Message Handler
    // ============================================
    transport.onMessage(async (msg) => {
        if (!msg || typeof msg !== 'object' || !msg.type) return;

        switch (msg.type) {
            case 'init': {
                permissions = msg.payload.permissions || [];
                break;
            }

            case 'shutdown': {
                // In-process: nothing to do. Core will close the channel and
                // detach right after this message is dispatched, so any further
                // sends from the addon become no-ops. We never call
                // process.exit() because we share the host realm.
                if (transport.isInProcess) {
                    break;
                }
                // Child / worker: exit normally.
                process.exit(0);
                break;
            }

            case 'http-request': {
                const { method, path: reqPath, headers, body, admin } = msg.payload;

                // Find matching route handler
                let matchedHandler = null;
                let params = {};

                for (const [key, route] of routeHandlers) {
                    if (route.method !== method.toUpperCase()) continue;

                    // Simple path matching with params
                    const match = matchPath(route.path, reqPath);
                    if (match) {
                        matchedHandler = route.handler;
                        params = match.params;
                        break;
                    }
                }

                if (!matchedHandler) {
                    send({
                        type: 'http-response',
                        id: msg.id,
                        payload: { status: 404, body: { error: 'Route not found' } },
                    });
                    return;
                }

                try {
                    const req = {
                        method,
                        path: reqPath,
                        headers,
                        body: body || {},
                        params,
                        admin: {
                            name: admin.name,
                            permissions: admin.permissions,
                            isMaster: !!admin.isMaster,
                            hasPermission: (perm) =>
                                !!admin.isMaster ||
                                admin.permissions.includes('all_permissions') ||
                                admin.permissions.includes(perm),
                        },
                    };

                    const result = await matchedHandler(req);

                    send({
                        type: 'http-response',
                        id: msg.id,
                        payload: {
                            status: result.status || 200,
                            headers: result.headers || {},
                            body: result.body ?? null,
                        },
                    });
                } catch (error) {
                    send({
                        type: 'http-response',
                        id: msg.id,
                        payload: {
                            status: 500,
                            body: { error: 'Internal addon error' },
                        },
                    });
                    send({
                        type: 'error',
                        payload: {
                            message: error.message || 'Unknown error',
                            stack: error.stack,
                        },
                    });
                }
                break;
            }

            case 'public-request': {
                const { method, path: reqPath, headers, body } = msg.payload;

                let matchedHandler = null;
                let params = {};

                for (const [key, route] of publicRouteHandlers) {
                    if (route.method !== method.toUpperCase() && route.method !== 'ALL') continue;
                    const match = matchPath(route.path, reqPath);
                    if (match) {
                        matchedHandler = route.handler;
                        params = match.params;
                        break;
                    }
                }

                if (!matchedHandler) {
                    send({
                        type: 'http-response',
                        id: msg.id,
                        payload: { status: 404, body: { error: 'Route not found' } },
                    });
                    return;
                }

                try {
                    const req = {
                        method,
                        path: reqPath,
                        headers,
                        body: body || {},
                        params,
                        admin: null,
                    };

                    const result = await matchedHandler(req);

                    send({
                        type: 'http-response',
                        id: msg.id,
                        payload: {
                            status: result.status || 200,
                            headers: result.headers || {},
                            body: result.body ?? null,
                        },
                    });
                } catch (error) {
                    send({
                        type: 'http-response',
                        id: msg.id,
                        payload: {
                            status: 500,
                            body: { error: 'Internal addon error' },
                        },
                    });
                    send({
                        type: 'error',
                        payload: {
                            message: error.message || 'Unknown error',
                            stack: error.stack,
                        },
                    });
                }
                break;
            }

            case 'event': {
                const { event, data } = msg.payload;
                const handlers = eventHandlers.get(event);
                if (handlers) {
                    for (const handler of handlers) {
                        try {
                            await handler(data);
                        } catch (error) {
                            log.error(`Event handler error for "${event}": ${error.message}`);
                        }
                    }
                }
                break;
            }

            case 'storage-response': {
                const pending = pendingStorage.get(msg.id);
                if (pending) {
                    pendingStorage.delete(msg.id);
                    clearTimeout(pending.timer);
                    if (msg.payload.error) {
                        pending.reject(new Error(msg.payload.error));
                    } else {
                        pending.resolve(msg.payload.data);
                    }
                }
                break;
            }

            case 'api-call-response': {
                const pending = pendingApiCalls.get(msg.id);
                if (pending) {
                    pendingApiCalls.delete(msg.id);
                    clearTimeout(pending.timer);
                    if (msg.payload.error) {
                        pending.reject(new Error(msg.payload.error));
                    } else {
                        pending.resolve(msg.payload.data);
                    }
                }
                break;
            }

            case 'ws-subscribe': {
                if (wsHandlers.onSubscribeFn) {
                    wsHandlers.onSubscribeFn(msg.payload.sessionId);
                }
                break;
            }

            case 'ws-unsubscribe': {
                if (wsHandlers.onUnsubscribeFn) {
                    wsHandlers.onUnsubscribeFn(msg.payload.sessionId);
                }
                break;
            }
        }
    });

    // Handle uncaught errors. Skip in inprocess mode — we share the host
    // process and must not steal its global error handlers.
    if (!transport.isInProcess) {
        process.on('uncaughtException', (error) => {
            send({
                type: 'error',
                payload: {
                    message: `Uncaught exception: ${error.message}`,
                    stack: error.stack,
                },
            });
        });

        process.on('unhandledRejection', (reason) => {
            send({
                type: 'error',
                payload: {
                    message: `Unhandled rejection: ${reason}`,
                    stack: reason instanceof Error ? reason.stack : undefined,
                },
            });
        });
    }

    return {
        id: addonId,
        get permissions() {
            return [...permissions];
        },
        storage,
        players,
        registerRoute,
        registerPublicRoute,
        ws,
        on,
        off,
        log,
        ready,
    };
}

/**
 * Simple path matching with express-like params and wildcard support.
 * Matches "/notes/:playerId" against "/notes/abc123".
 * Matches "/pages/*" against "/pages/foo/bar/baz" (catch-all).
 */
function matchPath(pattern, actual) {
    const patternParts = pattern.split('/').filter(Boolean);
    const actualParts = actual.split('/').filter(Boolean);

    const params = {};
    for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i] === '*') {
            // Wildcard catch-all — matches all remaining segments
            params['*'] = actualParts.slice(i).map(decodeURIComponent).join('/');
            return { params };
        }
        if (i >= actualParts.length) return null;
        if (patternParts[i].startsWith(':')) {
            params[patternParts[i].slice(1)] = decodeURIComponent(actualParts[i]);
        } else if (patternParts[i] !== actualParts[i]) {
            return null;
        }
    }

    if (patternParts.length !== actualParts.length) return null;

    return { params };
}
