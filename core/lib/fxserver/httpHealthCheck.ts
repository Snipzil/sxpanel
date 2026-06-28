import got from '@lib/got';
import os from 'node:os';
import { txDevEnv, txHostConfig } from '@core/globalData';
import { ReportedPlayer } from '@lib/player/playerClasses';
import { SYM_SYSTEM_AUTHOR } from '@lib/symbols';
import { fetchDynamicJson } from '@modules/FxMonitor/utils';
import { getPromAuthOpts } from '@modules/Metrics/svRuntime/perfUtils';
import { FxMonitorHealth } from '@shared/enums';
import { type HttpPlayerJsonEntry, parsePlayersJson } from '@lib/fxserver/httpPlayerlist';
import {
    buildResourceSyncPayload,
    getReportedDetailSeed,
    type ReportedPlayerSnapshotInput,
    type SyntheticPlayerResourcePayload,
} from '@lib/fxserver/reportedPlayerSnapshot';

const HTTP_CLIENTS_CACHE_KEY = 'fxsRuntime:httpReportedClients';
const REMOTE_PLAYERS_JSON_TIMEOUT = 8000;

/** In-memory only — CacheStore accepts primitives, not player objects. */
let cachedHttpPlayers: HttpPlayerJsonEntry[] = [];

const isLoopbackEndpoint = (endpoint: string) => {
    if (endpoint.startsWith('localhost:')) return true;
    if (endpoint.startsWith('[::1]:')) return true;
    const host = endpoint.startsWith('[') ? endpoint.slice(1).split(']')[0] : endpoint.split(':')[0];
    return host === '127.0.0.1' || host === '::1';
};

const getLocalNetworkIpv4Addresses = () => {
    const addresses = new Set<string>();
    for (const ifaceAddrs of Object.values(os.networkInterfaces())) {
        if (!ifaceAddrs) continue;
        for (const addr of ifaceAddrs) {
            if (addr.internal) continue;
            const family = typeof addr.family === 'string' ? addr.family : String(addr.family);
            if (family !== 'IPv4') continue;
            addresses.add(addr.address);
        }
    }
    return [...addresses];
};

/**
 * When true, sxPanel must not treat FXServer HTTP endpoints as a liveness signal.
 * Playerlist sync uses CFXBOT-style push (POST /dev/addPlayers) instead of HTTP polling.
 */
export const isHttpHealthCheckDisabled = () => {
    const value = txConfig.restarter.disableHealthCheck;
    return value === true || value === 'true';
};

/** CFXBOT push mode: Background_Service POSTs /dev/addPlayers instead of polling game HTTP. */
export const isHttpPlayerlistPushMode = () => isHttpHealthCheckDisabled();

/**
 * When true, sxPanel merges /players.json rows into panel + in-game playerlists (poll mode only).
 * Automatically enabled when HTTP reports more players than FD3.
 */
export const isHttpPlayerlistBypassEnabled = () => {
    if (isHttpPlayerlistPushMode()) return false;

    const fd3Count = txCore.fxPlayerlist?.onlineCount ?? 0;
    const httpCount = getCachedHttpPlayers().length;
    const reportedCount = getCachedHttpPlayerCount();
    return httpCount > fd3Count || reportedCount > fd3Count;
};

/**
 * Maps monitor-reported health to the value exposed to panel, Discord, scheduler context, etc.
 */
export const getEffectiveFxMonitorHealth = (
    reported: FxMonitorHealth,
    isHeartBeatHealthy: boolean,
    isChildAlive: boolean,
): FxMonitorHealth => {
    if (!isHttpHealthCheckDisabled()) return reported;
    if (!isChildAlive) return FxMonitorHealth.OFFLINE;
    if (isHeartBeatHealthy) return FxMonitorHealth.ONLINE;
    return reported;
};

export const getCachedHttpPlayerCount = () => {
    const cached = txCore.cacheStore.get(HTTP_CLIENTS_CACHE_KEY);
    return typeof cached === 'number' && Number.isFinite(cached) && cached >= 0 ? cached : 0;
};

export const getCachedHttpPlayers = (): HttpPlayerJsonEntry[] => cachedHttpPlayers;

export const clearHttpRuntimePlayerCache = () => {
    cachedHttpPlayers = [];
    txCore.cacheStore.delete(HTTP_CLIENTS_CACHE_KEY);
};

/**
 * Best-effort connected player count for UI (panel header, Discord, host status).
 * Prefer FD3 playerlist; when bypass is active, also consider /dynamic.json and /players.json.
 */
export const getDisplayPlayerCount = () => {
    const fd3Count = txCore.fxPlayerlist?.onlineCount ?? 0;
    if (isHttpPlayerlistPushMode() || !isHttpPlayerlistBypassEnabled()) return fd3Count;
    return Math.max(fd3Count, getCachedHttpPlayerCount(), getCachedHttpPlayers().length);
};

const extractEndpointPort = (endpoint: string) => {
    if (endpoint.startsWith('[')) {
        const port = endpoint.split(']:')[1];
        return port ?? String(txHostConfig.fxsPort ?? 30120);
    }
    const port = endpoint.split(':').pop();
    return port ?? String(txHostConfig.fxsPort ?? 30120);
};

const normalizeHostEndpoint = (host: string, port: string) => {
    const trimmed = host
        .trim()
        .replace(/^https?:\/\//i, '')
        .replace(/\/$/, '');
    if (!trimmed.length) return undefined;
    if (trimmed.includes(':')) return trimmed;
    return `${trimmed}:${port}`;
};

/**
 * Bot tools often expose fake players on the public bind, while sxPanel polls 127.0.0.1.
 * Poll every candidate and union the richest /players.json result.
 */
export const resolveHttpPollEndpoints = (localEndpoint: string) => {
    const endpoints = new Set<string>([localEndpoint]);
    const port = extractEndpointPort(localEndpoint);

    const configuredHost = txConfig.restarter.httpPlayerlistHost;
    if (typeof configuredHost === 'string' && configuredHost.trim().length) {
        const normalized = normalizeHostEndpoint(configuredHost, port);
        if (normalized) endpoints.add(normalized);
    }

    if (txDevEnv.EXT_STATS_HOST) {
        const normalized = normalizeHostEndpoint(txDevEnv.EXT_STATS_HOST, port);
        if (normalized) endpoints.add(normalized);
    }

    const publicIpv4 = txCore.cacheStore.get('stats:publicIpv4');
    if (typeof publicIpv4 === 'string' && publicIpv4.length) {
        endpoints.add(`${publicIpv4}:${port}`);
    }

    const netInterface = txHostConfig.netInterface;
    if (
        typeof netInterface === 'string' &&
        netInterface.length &&
        netInterface !== '0.0.0.0' &&
        !netInterface.startsWith('127.')
    ) {
        endpoints.add(`${netInterface}:${port}`);
    }

    // Bot tools often inject fake players on the public bind only; localhost returns [].
    for (const address of getLocalNetworkIpv4Addresses()) {
        endpoints.add(`${address}:${port}`);
    }

    return [...endpoints];
};

const fetchPlayersJsonFromEndpoint = async (netEndpoint: string, timeout: number) => {
    try {
        const resp = await got.get(`http://${netEndpoint}/players.json`, {
            ...getPromAuthOpts(),
            timeout: { request: timeout },
            retry: { limit: 0 },
            throwHttpErrors: false,
        });
        if (resp.statusCode !== 200) return [] as HttpPlayerJsonEntry[];
        const body = typeof resp.body === 'string' ? JSON.parse(resp.body) : resp.body;
        return parsePlayersJson(body);
    } catch {
        return [] as HttpPlayerJsonEntry[];
    }
};

const unionHttpPlayers = (lists: HttpPlayerJsonEntry[][]) => {
    const byId = new Map<number, HttpPlayerJsonEntry>();
    for (const list of lists) {
        for (const player of list) {
            const existing = byId.get(player.id);
            if (!existing || player.name.length > existing.name.length) {
                byId.set(player.id, player);
            }
        }
    }
    return [...byId.values()];
};

const resolveCfxId = () => {
    const cached = txCore.cacheStore.get('fxsRuntime:cfxId');
    if (typeof cached === 'string' && cached.trim().length) {
        return cached.trim().toLowerCase();
    }
    return undefined;
};

const fetchPlayersFromCfxListing = async (): Promise<HttpPlayerJsonEntry[]> => {
    const cfxId = resolveCfxId();
    if (!cfxId) return [];

    try {
        const body = await got(`https://servers-frontend.fivem.net/api/servers/single/${cfxId}`, {
            timeout: { request: 4000 },
            retry: { limit: 0 },
            headers: {
                'User-Agent': 'sxPanel/1.0',
            },
        }).json<Record<string, unknown>>();

        const data = (body.Data ?? body.data ?? body) as Record<string, unknown>;
        if (!data || typeof data !== 'object') return [];

        const players = data.players ?? data.Players;
        if (!Array.isArray(players)) return [];
        return parsePlayersJson(players);
    } catch {
        return [];
    }
};

const applyDynamicJsonMetadata = (data: { clients: number; sv_maxclients?: number }) => {
    txCore.cacheStore.set(HTTP_CLIENTS_CACHE_KEY, data.clients);
    if (data.sv_maxclients) {
        const maxClients = data.sv_maxclients;
        txCore.cacheStore.set('fxsRuntime:maxClients', maxClients);
        if (txHostConfig.forceMaxClients && maxClients > txHostConfig.forceMaxClients) {
            txCore.fxRunner.sendCommand('sv_maxclients', [txHostConfig.forceMaxClients], SYM_SYSTEM_AUTHOR);
        }
    }
};

const applyPlayersJsonMetadata = (players: HttpPlayerJsonEntry[]) => {
    if (!players.length) return;
    cachedHttpPlayers = players;
    txCore.cacheStore.set(HTTP_CLIENTS_CACHE_KEY, players.length);
};

/**
 * Poll /players.json from local + public candidate endpoints and cache the union.
 */
export const fetchAndCachePlayersJson = async (localEndpoint: string, timeout = 1500) => {
    if (isHttpPlayerlistPushMode()) return getCachedHttpPlayers();

    const endpoints = resolveHttpPollEndpoints(localEndpoint);
    const [lists, cfxPlayers] = await Promise.all([
        Promise.all(
            endpoints.map((endpoint) =>
                fetchPlayersJsonFromEndpoint(
                    endpoint,
                    isLoopbackEndpoint(endpoint) ? timeout : Math.max(timeout, REMOTE_PLAYERS_JSON_TIMEOUT),
                ),
            ),
        ),
        fetchPlayersFromCfxListing(),
    ]);
    const fresh = unionHttpPlayers([...lists, cfxPlayers]);
    const merged = fresh.length ? fresh : getCachedHttpPlayers();
    applyPlayersJsonMetadata(merged);
    return getCachedHttpPlayers();
};

export type SyntheticPlayerPayload = SyntheticPlayerResourcePayload;

/**
 * Pushes HTTP-reported players with optional detail fields to the monitor resource.
 */
export const syncSyntheticPlayersToResource = (players: SyntheticPlayerResourcePayload[]) => {
    if (!txCore.fxRunner?.child?.isAlive) return;

    txCore.fxRunner.sendCommand(
        'txaSendEvent',
        ['txsv:updateSyntheticPlayers', JSON.stringify(players)],
        SYM_SYSTEM_AUTHOR,
    );
};

/** Builds resolved detail payloads and syncs to the in-game resource. */
export const syncReportedPlayersToResource = (
    players: ({ id: number; name: string } & ReportedPlayerSnapshotInput)[],
) => {
    if (!players.length) {
        syncSyntheticPlayersToResource([]);
        return;
    }
    syncSyntheticPlayersToResource(buildResourceSyncPayload(players, getReportedDetailSeed()));
};

/** Poll-mode: sync cached HTTP players to the in-game resource. */
export const syncHttpPlayersToResource = () => {
    if (isHttpPlayerlistPushMode()) return;

    const payload = isHttpPlayerlistBypassEnabled()
        ? buildResourceSyncPayload(getCachedHttpPlayers(), getReportedDetailSeed())
        : [];

    syncSyntheticPlayersToResource(payload);
};

/**
 * Resolves a poll-mode HTTP-reported player for panel/modal APIs when no live slot exists.
 */
export const resolveReportedPlayerByNetId = (netid: number): ReportedPlayer | false => {
    if (isHttpPlayerlistPushMode() || !isHttpPlayerlistBypassEnabled()) return false;
    if (txCore.fxPlayerlist?.getPlayerById(netid)) return false;

    const cached = getCachedHttpPlayers().find((player) => player.id === netid);
    if (!cached) return false;

    return new ReportedPlayer(cached.id, cached.name, cached.identifiers ?? []);
};

/**
 * Refresh panel/in-game playerlists after HTTP metadata changes.
 */
export const refreshHttpPlayerlistViews = () => {
    if (isHttpPlayerlistPushMode() || !isHttpPlayerlistBypassEnabled()) return;
    if (!getCachedHttpPlayers().length && getCachedHttpPlayerCount() <= (txCore.fxPlayerlist?.onlineCount ?? 0)) {
        return;
    }
    txCore.fxPlayerlist?.broadcastPlayerlistState();
    syncHttpPlayersToResource();
};

/**
 * Poll FXServer HTTP endpoints for slot/player metadata without affecting health monitors.
 */
export const syncHttpRuntimeMetadata = async (localEndpoint: string, timeout = 1500) => {
    if (isHttpPlayerlistPushMode()) return;

    const dynamicResult = await fetchDynamicJson(localEndpoint, timeout);
    if (dynamicResult.success) {
        applyDynamicJsonMetadata(dynamicResult.data);
    }
    await fetchAndCachePlayersJson(localEndpoint, timeout);

    const fd3Count = txCore.fxPlayerlist?.onlineCount ?? 0;
    const reportedCount = getCachedHttpPlayerCount();
    const cachedPlayers = getCachedHttpPlayers().length;
    if (reportedCount > fd3Count && cachedPlayers < reportedCount) {
        await fetchAndCachePlayersJson(localEndpoint, REMOTE_PLAYERS_JSON_TIMEOUT);
    }

    refreshHttpPlayerlistViews();
};
