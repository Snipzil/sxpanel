import { useEffect, useState, useCallback, useRef } from 'react';
import React from 'react';
import { useAuthedFetcher } from '@/hooks/fetch';
import { useCsrfToken, useAdminPerms } from '@/hooks/auth';
import type { AddonPanelDescriptor } from '@shared/addonTypes';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { getSocket, joinSocketRoom, leaveSocketRoom } from '@/lib/utils';

/**
 * Loaded addon entry module — exports from the addon's panel/index.js
 */
export interface AddonPanelModule {
    /** Maps component names to React components */
    pages?: Record<string, React.ComponentType<any>>;
    widgets?: Record<string, React.ComponentType<any>>;
    settings?: React.ComponentType<any>;
}

/**
 * A fully resolved addon with its manifest + loaded module
 */
export interface LoadedAddon {
    descriptor: AddonPanelDescriptor;
    module: AddonPanelModule;
    error?: string;
}

/**
 * Resolved addon page route for the router
 */
export interface AddonPageRoute {
    addonId: string;
    path: string;
    title: string;
    sidebar?: boolean;
    permission?: string;
    Component: React.ComponentType<any>;
}

/**
 * Resolved addon widget for slot injection
 */
export interface AddonWidgetEntry {
    addonId: string;
    slot: string;
    title: string;
    defaultSize?: string;
    permission?: string;
    Component: React.ComponentType<any>;
}

function asComponentMap(input: unknown): Record<string, React.ComponentType<any>> {
    if (!input || typeof input !== 'object') return {};
    return input as Record<string, React.ComponentType<any>>;
}

function resolveNamedComponent(
    map: Record<string, React.ComponentType<any>>,
    name: string,
): React.ComponentType<any> | undefined {
    const direct = map[name];
    if (direct) return direct;

    // Legacy addons can end up with different export casing.
    const lowerName = name.toLowerCase();
    const matchedKey = Object.keys(map).find((k) => k.toLowerCase() === lowerName);
    return matchedKey ? map[matchedKey] : undefined;
}

function normalizeAddonModuleExports(raw: any): AddonPanelModule {
    const rawDefault = raw?.default;

    const pages = asComponentMap(
        raw?.pages ??
            rawDefault?.pages ??
            // Legacy shape: module exports page components directly
            (rawDefault && typeof rawDefault === 'object' ? rawDefault : undefined),
    );

    const widgets = asComponentMap(raw?.widgets ?? rawDefault?.widgets);

    const settings = raw?.settings ?? rawDefault?.settings;

    return {
        pages,
        widgets,
        settings,
    };
}

const SIDEBAR_COMPAT_FROM_VERSION = '0.2.2-Beta';

type ParsedVersion = {
    major: number;
    minor: number;
    patch: number;
    pre: string;
};

function parseVersion(version: string): ParsedVersion {
    const [rawCore, rawPre = ''] = String(version || '').split('-', 2);
    const [maj = '0', min = '0', pat = '0'] = rawCore.split('.');
    return {
        major: Number.parseInt(maj, 10) || 0,
        minor: Number.parseInt(min, 10) || 0,
        patch: Number.parseInt(pat, 10) || 0,
        pre: rawPre.toLowerCase(),
    };
}

function preReleaseRank(pre: string): number {
    if (!pre) return 3; // stable release
    if (pre.startsWith('rc')) return 2;
    if (pre.startsWith('beta')) return 1;
    if (pre.startsWith('alpha')) return 0;
    return 1;
}

function gteVersion(version: string, target: string): boolean {
    const a = parseVersion(version);
    const b = parseVersion(target);
    if (a.major !== b.major) return a.major > b.major;
    if (a.minor !== b.minor) return a.minor > b.minor;
    if (a.patch !== b.patch) return a.patch > b.patch;
    return preReleaseRank(a.pre) >= preReleaseRank(b.pre);
}

function normalizeAddonSidebarFlag(
    _descriptor: AddonPanelDescriptor,
    page: AddonPanelDescriptor['pages'][number],
): boolean {
    if (page.sidebar) return true;

    const sidebarGroup = String(page.sidebarGroup || '').trim();
    if (sidebarGroup.length > 0) return true;

    // Compatibility layer:
    // If the running panel is 0.2.2-Beta+, migrate legacy addon navbar behavior
    // by showing addon pages in the dedicated Addons section by default.
    // This keeps older addons working without manifest updates.
    const supportsCompat = gteVersion(window.txConsts.txaVersion, SIDEBAR_COMPAT_FROM_VERSION);
    if (!supportsCompat) return false;

    return true;
}

function getAddonFallbackPage(addonId: string, pageTitle: string, error?: string): React.ComponentType<any> {
    const msg = error || 'Unknown addon panel load error.';
    return function AddonFallbackPage() {
        return React.createElement(
            'div',
            { className: 'flex w-full flex-col gap-4' },
            React.createElement(
                'div',
                { className: 'rounded-xl border border-destructive/30 bg-destructive/5 p-4' },
                React.createElement(
                    'h2',
                    { className: 'text-destructive text-lg font-semibold' },
                    'Addon page failed to load',
                ),
                React.createElement(
                    'p',
                    { className: 'text-muted-foreground mt-1 text-sm' },
                    'Addon: ',
                    React.createElement('span', { className: 'font-mono' }, addonId),
                ),
                React.createElement(
                    'p',
                    { className: 'text-muted-foreground text-sm' },
                    'Page: ',
                    React.createElement('span', { className: 'font-medium' }, pageTitle),
                ),
                React.createElement('p', { className: 'text-muted-foreground mt-3 text-sm whitespace-pre-wrap' }, msg),
            ),
        );
    };
}

function sanitizeAddonEntryUrl(entryUrl: string): string {
    const trimmed = String(entryUrl || '').trim();
    return trimmed.split('?')[0].split('#')[0] || trimmed;
}

async function fetchAddonModuleSource(entryUrl: string): Promise<{ contentType: string; text: string }> {
    const response = await fetch(entryUrl, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
            Accept: 'application/javascript, text/javascript, */*;q=0.8',
        },
    });

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const text = await response.text();

    if (!response.ok) {
        throw new Error(`HTTP ${response.status} while loading addon module from ${entryUrl}`);
    }

    // Auth middleware failures can return HTML logout pages with 200.
    if (contentType.includes('text/html') || /^\s*</.test(text)) {
        throw new Error(
            `Addon module request returned HTML instead of JavaScript from ${entryUrl}. ` +
                'This usually means the request failed auth/session validation.',
        );
    }

    return { contentType, text };
}

function executeAddonSourceFallback(source: string, sourceUrl: string): AddonPanelModule {
    // Compatibility fallback for environments where dynamic module import fails
    // even though the addon JS is reachable. We support the common addon export
    // shape (`export const pages/widgets/settings = ...`) plus simple
    // `export function` and `export class` declarations for those same names.
    //
    // KNOWN LIMITATIONS — this is a regex-based source rewrite, NOT a real ES
    // module loader. The following export forms are NOT supported and will
    // either throw at eval-time or be silently ignored:
    //   - `export default ...`
    //   - `export { a, b as c }` / `export { a } from './x'` (named re-exports)
    //   - `export * from './x'`
    //   - `export async function ...` (the `async` keyword is not stripped)
    //   - Any export wrapped across multiple lines / unusual whitespace
    //
    // Addons that need any of the above must rely on the primary `import()`
    // path. The runner below still returns whatever pages/widgets/settings
    // bindings happen to exist after the rewrite.
    const transformed = source
        .replace(/\bexport\s+const\s+([A-Za-z_$][\w$]*)\s*=/g, 'const $1 =')
        .replace(/\bexport\s+function\s+([A-Za-z_$][\w$]*)/g, 'function $1')
        .replace(/\bexport\s+class\s+([A-Za-z_$][\w$]*)/g, 'class $1');

    const runner = new Function(
        'window',
        `${transformed}\n//# sourceURL=${sourceUrl}\nreturn {\n` +
            `  pages: (typeof pages !== 'undefined' ? pages : undefined),\n` +
            `  widgets: (typeof widgets !== 'undefined' ? widgets : undefined),\n` +
            `  settings: (typeof settings !== 'undefined' ? settings : undefined),\n` +
            `};`,
    ) as (win: Window) => AddonPanelModule;

    console.warn(
        `[addons] executeAddonSourceFallback: regex-based source rewrite used for "${sourceUrl}". ` +
            'This addon is not using the native dynamic import path. ' +
            'Report this to the addon developer if unexpected exports are missing.',
    );
    return runner(window);
}

async function importAddonEntry(entryUrl: string): Promise<any> {
    const sanitized = sanitizeAddonEntryUrl(entryUrl) || entryUrl;

    // Prefer fetch + eval over dynamic import().  In dev mode the panel JS is
    // served by Vite on a different port than the backend.  Dynamic import()
    // resolves relative URLs against the Vite module origin, which doesn't
    // have the session cookie context — the backend returns an HTML logout page
    // and the browser rejects it as a non-JS MIME type.  fetch() always resolves
    // against the *document* origin (the backend), sends credentials correctly,
    // and avoids MIME-type enforcement.
    try {
        const { text } = await fetchAddonModuleSource(sanitized);
        return executeAddonSourceFallback(text, sanitized);
    } catch (e) {
        console.error(`[addons] fetch+eval failed for "${sanitized}", falling back to native import:`, e);
    }

    // Fallback: native dynamic import for real ES modules (e.g. future addons
    // that use their own import graph and cannot be eval'd as a plain script).
    return import(/* @vite-ignore */ sanitized);
}

// Singleton state so we don't re-fetch on every mount
let cachedAddons: LoadedAddon[] | null = null;
let loadPromise: Promise<LoadedAddon[]> | null = null;
const loadedAddonStyleUrls = new Set<string>();
// Module-level token updated by the hook so the txAddonApi getter always returns the live value
let currentCsrfToken: string | null = null;

function ensureAddonPanelStyleLoaded(addonId: string, stylesUrl: string | null | undefined): void {
    const href = String(stylesUrl || '').trim();
    if (!href || loadedAddonStyleUrls.has(href)) return;

    let alreadyLinked = false;
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
        alreadyLinked = !!document.querySelector(`link[rel="stylesheet"][href="${CSS.escape(href)}"]`);
    } else {
        const links = document.querySelectorAll('link[rel="stylesheet"]');
        for (const el of Array.from(links)) {
            if (el.getAttribute('href') === href || (el as HTMLLinkElement).href === href) {
                alreadyLinked = true;
                break;
            }
        }
    }
    if (alreadyLinked) {
        loadedAddonStyleUrls.add(href);
        return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.addonId = addonId;
    document.head.appendChild(link);
    loadedAddonStyleUrls.add(href);
}

/**
 * Hook to get loaded panel addons.
 * Fetches the manifest and dynamically imports addon entry scripts.
 * Returns { addons, pages, widgets, loading, error }.
 */
export function useAddonLoader() {
    const fetcher = useAuthedFetcher();
    const csrfToken = useCsrfToken();
    const [addons, setAddons] = useState<LoadedAddon[]>(cachedAddons ?? []);
    const [loading, setLoading] = useState(!cachedAddons);
    const [error, setError] = useState<string | null>(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    // Keep the module-level token in sync so the txAddonApi getter is never stale
    useEffect(() => {
        currentCsrfToken = csrfToken ?? null;
    }, [csrfToken]);

    useEffect(() => {
        if (cachedAddons) {
            setAddons(cachedAddons);
            setLoading(false);
            return;
        }

        if (loadPromise) {
            loadPromise.then((result) => {
                if (mountedRef.current) {
                    setAddons(result);
                    setLoading(false);
                }
            });
            return;
        }

        loadPromise = (async () => {
            try {
                const resp = await fetcher<{ addons: AddonPanelDescriptor[] }>('/addons/panel-manifest');
                if (!resp.addons || !Array.isArray(resp.addons) || resp.addons.length === 0) {
                    cachedAddons = [];
                    return [];
                }

                const loaded: LoadedAddon[] = [];

                // Expose React and API helpers as globals so addon scripts can use them
                (window as any).React = React;
                (window as any).txAddonApi = {
                    ...(window as any).txAddonApi,
                    get csrfToken() {
                        return currentCsrfToken;
                    },
                    getHeaders: () => ({
                        'Content-Type': 'application/json',
                        'X-TxAdmin-CsrfToken': currentCsrfToken ?? '',
                    }),
                    ui: {
                        DropdownMenuItem,
                        DropdownMenuSeparator,
                    },
                    socket: {
                        get: getSocket,
                        joinRoom: joinSocketRoom,
                        leaveRoom: leaveSocketRoom,
                    },
                };

                for (const descriptor of resp.addons) {
                    try {
                        ensureAddonPanelStyleLoaded(descriptor.id, descriptor.stylesUrl);

                        const entryUrl = descriptor.entryUrl;
                        if (!entryUrl) {
                            throw new Error(`Addon ${descriptor.id} missing panel entryUrl in manifest payload.`);
                        }

                        // Dynamically import the addon entry script.
                        // If transformed URLs fail (e.g. ?import path issues), retry with
                        // a sanitized URL through native dynamic import.
                        const mod = await importAddonEntry(entryUrl);
                        const normalized = normalizeAddonModuleExports(mod);

                        loaded.push({
                            descriptor,
                            module: {
                                pages: normalized.pages ?? {},
                                widgets: normalized.widgets ?? {},
                                settings: descriptor.settingsComponent
                                    ? (resolveNamedComponent(normalized.widgets ?? {}, descriptor.settingsComponent) ??
                                      resolveNamedComponent(normalized.pages ?? {}, descriptor.settingsComponent) ??
                                      normalized.settings ??
                                      mod?.[descriptor.settingsComponent])
                                    : undefined,
                            },
                        });
                    } catch (err) {
                        console.error(`[AddonLoader] Failed to load addon ${descriptor.id}:`, err);
                        loaded.push({
                            descriptor,
                            module: { pages: {}, widgets: {} },
                            error: (err as Error).message,
                        });
                    }
                }

                cachedAddons = loaded;
                return loaded;
            } catch (err) {
                console.error('[AddonLoader] Failed to fetch addon manifest:', err);
                if (mountedRef.current) {
                    setError((err as Error).message);
                }
                cachedAddons = [];
                return [];
            }
        })();

        loadPromise.then((result) => {
            if (mountedRef.current) {
                setAddons(result);
                setLoading(false);
            }
        });
    }, [fetcher]);

    // Resolve pages from all loaded addons
    const pages: AddonPageRoute[] = [];
    for (const addon of addons) {
        if (!addon.descriptor.pages) continue;
        for (const page of addon.descriptor.pages) {
            const Component =
                resolveNamedComponent(addon.module.pages ?? {}, page.component) ??
                getAddonFallbackPage(addon.descriptor.id, page.title, addon.error);
            pages.push({
                addonId: addon.descriptor.id,
                path: `/addon/${addon.descriptor.id}${page.path}`,
                title: page.title,
                sidebar: normalizeAddonSidebarFlag(addon.descriptor, page),
                permission: page.permission,
                Component,
            });
        }
    }

    // Resolve widgets from all loaded addons
    const widgets: AddonWidgetEntry[] = [];
    for (const addon of addons) {
        if (!addon.descriptor.widgets) continue;
        for (const widget of addon.descriptor.widgets) {
            const Component = resolveNamedComponent(addon.module.widgets ?? {}, widget.component);
            if (!Component) continue;
            widgets.push({
                addonId: addon.descriptor.id,
                slot: widget.slot,
                title: widget.title,
                defaultSize: widget.defaultSize,
                permission: widget.permission,
                Component,
            });
        }
    }

    return { addons, pages, widgets, loading, error };
}

/**
 * Get widgets for a specific slot (filtered by permission).
 */
export function useAddonWidgets(slot: string): AddonWidgetEntry[] {
    const { widgets } = useAddonLoader();
    const { hasPerm } = useAdminPerms();
    return widgets.filter((w) => w.slot === slot && (!w.permission || hasPerm(w.permission)));
}

/**
 * Get widgets matching a slot prefix (filtered by permission).
 */
export function useAddonWidgetsByPrefix(prefix: string): AddonWidgetEntry[] {
    const { widgets } = useAddonLoader();
    const { hasPerm } = useAdminPerms();
    return widgets.filter((w) => w.slot.startsWith(prefix) && (!w.permission || hasPerm(w.permission)));
}

/**
 * Get the settings component for a specific addon, if it has one.
 */
export function useAddonSettings(addonId: string): React.ComponentType<any> | undefined {
    const { addons } = useAddonLoader();
    const addon = addons.find((a) => a.descriptor.id === addonId);
    return addon?.module.settings;
}

/**
 * Reset the addon cache (e.g. after addon approval/revocation).
 */
export function resetAddonCache() {
    cachedAddons = null;
    loadPromise = null;
}
