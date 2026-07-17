/**
 * sxPanel Addon SDK — TypeScript definitions
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

export interface AddonTicketMessage {
    author: string;
    authorType: 'player' | 'admin' | 'discord' | 'system';
    content: string;
    imageUrls?: string[];
    ts: number;
}

export interface AddonTicket {
    id: string;
    status: 'open' | 'inReview' | 'resolved' | 'closed';
    category: string;
    description: string;
    reporter: { license: string; name: string; netid?: number };
    targets: { license?: string; name: string; netid?: number }[];
    messages: AddonTicketMessage[];
    claimedBy?: string;
    resolvedBy?: string;
    discordThreadId?: string;
    tsCreated: number;
    tsLastActivity: number;
    tsResolved?: number;
    [key: string]: unknown;
}

/** Read access to sxPanel tickets. Requires the `tickets.read` addon permission. */
export interface AddonTickets {
    findOne(ticketId: string): Promise<AddonTicket | null>;
    findByDiscordThread(threadId: string): Promise<AddonTicket | null>;
    /** Resolve a ticket reporter's linked Discord ID from a ticket ID or Discord link ID. */
    resolveReporterDiscord(query: {
        ticketId?: string;
        threadId?: string;
    }): Promise<{ ticketId: string | null; discordId: string | null }>;
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

export type DeferralResolveContext = {
    scenarioId: string;
    player: {
        license?: string;
        playerName?: string;
        discordId?: string;
        identifiers?: string[];
    };
    tokens: string[];
};

export type DeferralPresentInput = {
    license: string;
    /** Full id (`addon-id:scenario_key`) or short key registered via registerDeferralScenario. */
    scenarioId: string;
    customMessage?: string;
    playerName?: string;
};

export interface Addon {
    readonly id: string;
    /** The permissions granted to this addon by the admin. */
    readonly permissions: string[];
    storage: AddonStorage;
    players: AddonPlayers;
    tickets: AddonTickets;
    registerRoute(method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH', path: string, handler: RouteHandler): void;
    registerPublicRoute(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'ALL',
        path: string,
        handler: PublicRouteHandler,
    ): void;
    ws: AddonWebSocket;
    /**
     * Subscribe to core events. Known events:
     * - Player (requires `players.read` grant to be meaningful): `playerJoining`, `playerDropped`,
     *   `playerKicked`, `playerBanned`, `playerWarned`
     * - Tickets (requires `tickets.read`): `ticketCreated`, `ticketNewMessage`, `ticketStatusChanged`,
     *   `ticketClaimChanged`, `ticketDiscordLinked`
     */
    on(event: string, handler: (data: unknown) => void | Promise<void>): void;
    /** Remove an event handler. If no handler is given, removes all handlers for the event. */
    off(event: string, handler?: (data: unknown) => void | Promise<void>): void;
    log: AddonLog;
    registerDeferralScenario(opts: { id: string; label: string; description?: string; group?: string }): void;
    registerDeferralToken(opts: {
        key: string;
        label?: string;
        resolve: (ctx: DeferralResolveContext) => string | Promise<string>;
    }): void;
    deferPresent(input: DeferralPresentInput): void;
    ready(): void;
}

export function createAddon(): Addon;
