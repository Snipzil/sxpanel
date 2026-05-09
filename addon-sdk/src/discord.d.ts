import type { CacheType, ChatInputCommandInteraction } from 'discord.js';

export interface AddonDiscordBridge {
    request<T = unknown>(type: string, payload?: Record<string, unknown>, timeoutMs?: number): Promise<T>;
    send?(message: Record<string, unknown>): void;
}

export interface DiscordRequesterPayload {
    requesterId?: string;
    requesterName?: string;
    memberRoles: string[];
}

export type AddonDiscordInteractionKind =
    | 'button'
    | 'modal'
    | 'stringSelectMenu'
    | 'userSelectMenu'
    | 'roleSelectMenu'
    | 'mentionableSelectMenu'
    | 'channelSelectMenu';

export interface AddonDiscordInteractionDescriptor {
    addonId: string;
    kind: AddonDiscordInteractionKind;
    action: string;
    rawState?: string;
    state?: unknown;
}

export type AddonAutocompleteChoice =
    | string
    | number
    | {
          name: string;
          value: string | number;
      };

export interface AddonInteractionBuilder {
    setCustomId(customId: string): unknown;
}

export interface AddonButtonBuilder extends AddonInteractionBuilder {
    setLabel?(label: string): unknown;
    setStyle?(style: unknown): unknown;
    setEmoji?(emoji: unknown): unknown;
    setDisabled?(disabled: boolean): unknown;
}

export interface AddonModalBuilder extends AddonInteractionBuilder {
    setTitle?(title: string): unknown;
    addComponents?(...components: unknown[]): unknown;
}

export interface AddonDiscordInteractionHelpers {
    createId(kind: AddonDiscordInteractionKind, action: string, state?: unknown): string;
    parse(customId: string): AddonDiscordInteractionDescriptor | null;
    apply<TBuilder extends AddonInteractionBuilder>(
        builder: TBuilder,
        kind: AddonDiscordInteractionKind,
        action: string,
        state?: unknown,
    ): TBuilder;
    button<TBuilder extends AddonButtonBuilder>(
        builder: TBuilder,
        action: string,
        options?: {
            state?: unknown;
            label?: string;
            style?: unknown;
            emoji?: unknown;
            disabled?: boolean;
        },
    ): TBuilder;
    modal<TBuilder extends AddonModalBuilder>(
        builder: TBuilder,
        action: string,
        options?: {
            state?: unknown;
            title?: string;
            components?: unknown[];
        },
    ): TBuilder;
}

export interface AddonDiscordManifestSection {
    commands?: string;
    events?: string;
}

export interface AddonDiscordManifestLike {
    id?: string;
    discordBot?: AddonDiscordManifestSection | null;
}

export interface AddonDiscordManifestIssue {
    path: string;
    message: string;
}

export type AddonDiscordManifestValidationResult =
    | {
          success: true;
          data: {
              id?: string;
              discordBot?: AddonDiscordManifestSection;
          };
      }
    | {
          success: false;
          issues: AddonDiscordManifestIssue[];
      };

export interface AddonRouteResponse<TBody = unknown> {
    status: number;
    headers?: Record<string, string>;
    body?: TBody;
}

export interface AddonRouteRequest {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | Lowercase<'get' | 'post' | 'put' | 'patch' | 'delete'>;
    path: string;
    body?: unknown;
    headers?: Record<string, string>;
    interaction?: ChatInputCommandInteraction<CacheType> | Record<string, unknown>;
    requesterId?: string;
    requesterName?: string;
    memberRoles?: string[];
}

export interface MockDiscordBridgeRequest {
    type: string;
    payload: unknown;
    timeoutMs?: number;
}

export interface MockDiscordBridgeContext {
    type: string;
    timeoutMs?: number;
    requests: MockDiscordBridgeRequest[];
    sentMessages: Record<string, unknown>[];
}

export interface MockDiscordBridge extends AddonDiscordBridge {
    send(message: Record<string, unknown>): void;
    setHandler(type: string, handler: unknown): MockDiscordBridge;
    getRequests(): MockDiscordBridgeRequest[];
    getSentMessages(): Record<string, unknown>[];
    reset(): void;
}

export interface AddonDiscordSdk {
    addonId: string;
    bridge: AddonDiscordBridge;
    request<T = unknown>(type: string, payload?: Record<string, unknown>, timeoutMs?: number): Promise<T>;
    send(type: string, payload?: Record<string, unknown>): void;
    send(message: Record<string, unknown>): void;
    interactions: AddonDiscordInteractionHelpers;
    getRequesterPayload(
        interaction?: ChatInputCommandInteraction<CacheType> | Record<string, unknown>,
        overrides?: Partial<DiscordRequesterPayload>,
    ): DiscordRequesterPayload;
    addonRoute<TBody = unknown>(request: AddonRouteRequest, timeoutMs?: number): Promise<AddonRouteResponse<TBody>>;
    getConfigSnapshot<TSnapshot = unknown>(timeoutMs?: number): Promise<TSnapshot>;
    resolveMemberRoles(
        uid: string,
        timeoutMs?: number,
    ): Promise<{
        isMember: boolean;
        memberRoles: string[];
    }>;
    resolveMemberProfile(
        uid: string,
        timeoutMs?: number,
    ): Promise<{
        tag: string;
        avatar: string;
    }>;
    respondWithChoices(
        interaction: { respond(choices: Array<{ name: string; value: string | number }>): Promise<unknown> },
        choices?: AddonAutocompleteChoice[],
    ): Promise<unknown>;
    refreshMemberCache(timeoutMs?: number): Promise<boolean>;
    reloadCommands(): void;
}

export function createAddonInteractionId(options: {
    addonId: string;
    kind: AddonDiscordInteractionKind;
    action: string;
    state?: unknown;
}): string;

export function parseAddonInteractionId(
    customId: string,
    expectedAddonId?: string,
): AddonDiscordInteractionDescriptor | null;

export function applyAddonInteractionCustomId<TBuilder extends AddonInteractionBuilder>(
    builder: TBuilder,
    options: {
        addonId: string;
        kind: AddonDiscordInteractionKind;
        action: string;
        state?: unknown;
    },
): TBuilder;

export function configureAddonButton<TBuilder extends AddonButtonBuilder>(
    builder: TBuilder,
    options: {
        addonId: string;
        action: string;
        state?: unknown;
        label?: string;
        style?: unknown;
        emoji?: unknown;
        disabled?: boolean;
    },
): TBuilder;

export function configureAddonModal<TBuilder extends AddonModalBuilder>(
    builder: TBuilder,
    options: {
        addonId: string;
        action: string;
        state?: unknown;
        title?: string;
        components?: unknown[];
    },
): TBuilder;

export function respondWithAutocompleteChoices(
    interaction: { respond(choices: Array<{ name: string; value: string | number }>): Promise<unknown> },
    choices?: AddonAutocompleteChoice[],
): Promise<unknown>;

export function createAddonDiscordInteractionHelpers(options: {
    addonId: string;
}): AddonDiscordInteractionHelpers;

export function getDiscordInteractionRoleIds(
    interaction?: ChatInputCommandInteraction<CacheType> | Record<string, unknown>,
): string[];

export function getDiscordRequesterPayload(
    interaction?: ChatInputCommandInteraction<CacheType> | Record<string, unknown>,
    overrides?: Partial<DiscordRequesterPayload>,
): DiscordRequesterPayload;

export function validateAddonDiscordManifest(
    manifest: AddonDiscordManifestLike | Record<string, unknown>,
): AddonDiscordManifestValidationResult;

export function parseAddonDiscordManifest(
    manifest: AddonDiscordManifestLike | Record<string, unknown>,
): {
    id?: string;
    discordBot?: AddonDiscordManifestSection;
};

export function createMockDiscordBridge(options?: {
    handlers?: Record<string, unknown>;
    onRequest?: (
        type: string,
        payload: unknown,
        context: MockDiscordBridgeContext,
    ) => unknown | Promise<unknown>;
    onSend?: (message: Record<string, unknown>, context: Omit<MockDiscordBridgeContext, 'type' | 'timeoutMs'>) => void;
}): MockDiscordBridge;

export function createAddonDiscordSdk(options: {
    addonId: string;
    bridge: AddonDiscordBridge;
}): AddonDiscordSdk;