import { txHostConfig } from '@core/globalData';
import got from '@lib/got';
import type { CtxWithSession } from '@modules/WebServer/ctxTypes';

const PANEL_PUBLIC_URL_CACHE_KEY = 'stats:panelPublicUrl';
const PANEL_CFX_URL_CACHE_KEY = 'stats:panelUrlCfx';
const PANEL_CFX_URL_MISS_KEY = 'stats:panelUrlCfxMiss';

const PANEL_URL_HINT = /txadmin|fivem-server\.net|fxpanel/i;
const IPV4_HOST = /^\d{1,3}(?:\.\d{1,3}){3}$/;

export const normalizePanelUrl = (raw: string) => {
    const trimmed = raw.trim();
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return withProtocol.endsWith('/') ? withProtocol : `${withProtocol}/`;
};

const formatPanelHost = (host: string) => (host.includes(':') ? `[${host}]` : host);

const buildPanelUrlFromHost = (host: string) => normalizePanelUrl(`${formatPanelHost(host)}:${txHostConfig.txaPort}`);

const isPublicHostname = (hostname: string) => {
    if (!hostname.length) return false;
    if (/^localhost$/i.test(hostname)) return false;
    if (hostname.startsWith('127.')) return false;
    if (IPV4_HOST.test(hostname)) return false;
    return hostname.includes('.');
};

/**
 * Learns the public panel URL from a real browser/API request (reverse proxy hostname).
 */
export const cachePanelPublicUrlFromCtx = (ctx: CtxWithSession) => {
    if (!ctx.txVars?.isWebInterface) return;
    if (ctx.txVars.hostType !== 'other') return;

    const origin = typeof ctx.origin === 'string' ? ctx.origin.trim() : '';
    if (!origin.length) return;

    try {
        const parsed = new URL(origin);
        if (!isPublicHostname(parsed.hostname)) return;
        txCore.cacheStore.set(PANEL_PUBLIC_URL_CACHE_KEY, normalizePanelUrl(parsed.origin));
    } catch {
        /* ignore malformed origins */
    }
};

const scanVarsForPanelUrl = (vars: Record<string, unknown>): string | undefined => {
    for (const value of Object.values(vars)) {
        if (typeof value !== 'string' || !value.length) continue;
        if (!PANEL_URL_HINT.test(value)) continue;

        const match = value.match(/https?:\/\/[^\s"'<>]+/i);
        if (match?.[0]) {
            return normalizePanelUrl(match[0]);
        }
    }
    return undefined;
};

const scanEndpointsForPanelUrl = (endpoints: unknown): string | undefined => {
    if (!Array.isArray(endpoints)) return undefined;

    for (const entry of endpoints) {
        if (typeof entry !== 'string' || !entry.length) continue;
        const host = entry.split(':')[0]?.trim().toLowerCase();
        if (!host || IPV4_HOST.test(host)) continue;
        if (host.startsWith('txadmin-') && host.endsWith('.fivem-server.net')) {
            return normalizePanelUrl(`https://${host}`);
        }
    }

    return undefined;
};

/**
 * Resolves a public panel URL from the Cfx.re server listing when available.
 */
export const resolvePanelUrlFromCfxListing = async (cfxId: string): Promise<string | undefined> => {
    const normalizedId = cfxId.trim().toLowerCase();
    if (!normalizedId.length) return undefined;

    try {
        const body = await got(`https://servers-frontend.fivem.net/api/servers/single/${normalizedId}`, {
            timeout: { request: 8_000 },
            retry: { limit: 1 },
        }).json<Record<string, unknown>>();

        const data = (body.Data ?? body) as Record<string, unknown>;
        if (!data || typeof data !== 'object') return undefined;

        const fromVars = scanVarsForPanelUrl(
            data.vars && typeof data.vars === 'object' ? (data.vars as Record<string, unknown>) : {},
        );
        if (fromVars) return fromVars;

        return scanEndpointsForPanelUrl(data.connectEndPoints);
    } catch {
        return undefined;
    }
};

const resolveIpFallbackPanelUrl = (): string | undefined => {
    if (txHostConfig.netInterface && txHostConfig.netInterface !== '0.0.0.0') {
        return buildPanelUrlFromHost(txHostConfig.netInterface);
    }

    const cachedIpv4 = txCore.cacheStore.get('stats:publicIpv4');
    if (typeof cachedIpv4 === 'string' && cachedIpv4.length) {
        return buildPanelUrlFromHost(cachedIpv4);
    }

    const cachedIpv6 = txCore.cacheStore.get('stats:publicIpv6');
    if (typeof cachedIpv6 === 'string' && cachedIpv6.length) {
        return buildPanelUrlFromHost(cachedIpv6);
    }

    return undefined;
};

/**
 * Resolves the best-known public fxPanel URL for telemetry and dashboards.
 *
 * Priority:
 * 1. TXHOST_TXA_URL (set by host / GSP — e.g. txadmin-*.fivem-server.net)
 * 2. Hostname learned from an actual panel HTTP request (reverse proxy)
 * 3. Cfx.re server listing (vars / ZAP-style txadmin-*.fivem-server.net endpoints)
 * 4. Public IP fallback (legacy)
 */
export const resolveTelemetryPanelUrl = async (): Promise<string | undefined> => {
    if (txHostConfig.txaUrl) {
        return normalizePanelUrl(txHostConfig.txaUrl);
    }

    const learnedUrl = txCore.cacheStore.get(PANEL_PUBLIC_URL_CACHE_KEY);
    if (typeof learnedUrl === 'string' && learnedUrl.length) {
        return normalizePanelUrl(learnedUrl);
    }

    const cachedCfxUrl = txCore.cacheStore.get(PANEL_CFX_URL_CACHE_KEY);
    if (typeof cachedCfxUrl === 'string' && cachedCfxUrl.length) {
        return normalizePanelUrl(cachedCfxUrl);
    }

    const cfxMiss = txCore.cacheStore.get(PANEL_CFX_URL_MISS_KEY);
    const cfxId = txCore.cacheStore.get('fxsRuntime:cfxId');
    if (typeof cfxId === 'string' && cfxId.length && cfxMiss !== cfxId) {
        const fromListing = await resolvePanelUrlFromCfxListing(cfxId);
        if (fromListing) {
            txCore.cacheStore.set(PANEL_CFX_URL_CACHE_KEY, fromListing);
            return fromListing;
        }
        txCore.cacheStore.set(PANEL_CFX_URL_MISS_KEY, cfxId);
    }

    return resolveIpFallbackPanelUrl();
};
