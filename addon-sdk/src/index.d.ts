/**
 * fxPanel Addon SDK — TypeScript definitions
 */

export interface AddonRequest {
    method: string;
    path: string;
    headers: Record<string, string>;
    body: unknown;
    params: Record<string, string>;
    admin: {
        name: string;
        permissions: string[];
        hasPermission: (perm: string) => boolean;
    };
}

export interface AddonResponse {
    status: number;
    headers?: Record<string, string>;
    body?: unknown;
}

export type RouteHandler = (req: AddonRequest) => Promise<AddonResponse> | AddonResponse;

export interface PublicAddonRequest {
    method: string;
    path: string;
    headers: Record<string, string>;
    body: unknown;
    params: Record<string, string>;
    admin: null;
}

export type PublicRouteHandler = (req: PublicAddonRequest) => Promise<AddonResponse> | AddonResponse;

export interface AddonStorage {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<boolean>;
    delete(key: string): Promise<boolean>;
    list(prefix?: string): Promise<string[]>;
    /** Check whether a key exists in storage. */
    has(key: string): Promise<boolean>;
    /** Get a value or return the default if the key doesn't exist. */
    getOr<T = unknown>(key: string, defaultValue: T): Promise<T>;
}

export interface AddonPlayers {
    addTag(netid: number, tagId: string): Promise<true>;
    removeTag(netid: number, tagId: string): Promise<true>;
}

export interface AddonWebSocket {
    push(event: string, data: unknown): void;
    onSubscribe(handler: (sessionId: string) => void): void;
    onUnsubscribe(handler: (sessionId: string) => void): void;
}

export interface AddonLog {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}

export interface Addon {
    readonly id: string;
    /** The permissions granted to this addon by the admin. */
    readonly permissions: string[];
    storage: AddonStorage;
    players: AddonPlayers;
    registerRoute(method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH', path: string, handler: RouteHandler): void;
    registerPublicRoute(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'ALL',
        path: string,
        handler: PublicRouteHandler,
    ): void;
    ws: AddonWebSocket;
    on(event: string, handler: (data: unknown) => void | Promise<void>): void;
    /** Remove an event handler. If no handler is given, removes all handlers for the event. */
    off(event: string, handler?: (data: unknown) => void | Promise<void>): void;
    log: AddonLog;
    ready(): void;
}

export function createAddon(): Addon;
