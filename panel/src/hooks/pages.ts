import { atom, useSetAtom } from 'jotai';
import { atomEffect } from 'jotai-effect';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import faviconDefault from '/favicon_default.svg?url';
import { globalStatusAtom } from './status';
import { playerCountAtom } from './playerlist';

/**
 * Atom for a page-level header that should render above the main content + sidebar row.
 * Pages can call `usePageHeader(node)` to set it (and clear it on unmount).
 *
 * If `node` contains inline JSX (a fresh ReactNode every render), pass an explicit
 * `deps` array so the header is only re-published when those deps change. Without
 * `deps`, the latest `node` is published on every render.
 */
export const pageHeaderAtom = atom<ReactNode | null>(null);

export const usePageHeader = (node: ReactNode, deps?: ReadonlyArray<unknown>) => {
    const setPageHeader = useSetAtom(pageHeaderAtom);
    const nodeRef = useRef(node);
    nodeRef.current = node;
    useEffect(
        () => {
            setPageHeader(nodeRef.current);
            return () => setPageHeader(null);
        },
        deps ?? [node, setPageHeader],
    );
};

/**
 * This atom is used to change the key of the main page error boundry, which also resets the router
 * as a side effect. This is used to reset the page that errored as well as resetting the current
 * page when the user clicks on the active menu link.
 */
export const contentRefreshKeyAtom = atom(0);

//Hook to refresh content
export const useContentRefresh = () => {
    const setContentRefreshKey = useSetAtom(contentRefreshKeyAtom);
    return () => setContentRefreshKey(Math.random());
};

/**
 * This atom describes if the main page is in error state or not.
 * When the page is in error, clicking on any menu link will reset the error boundry and router,
 * therefore also resetting the page that errored.
 */
export const pageErrorStatusAtom = atom(false);

/**
 * Page title management
 */
const DEFAULT_TITLE = 'fxPanel';
const faviconEl = document.getElementById('favicon') as HTMLLinkElement;
const runtimeIconRegex = /^icon-([a-f0-9]{16})\.(png|jpe?g|gif|webp|svg|ico)$/i;
const pageTitleAtom = atom(DEFAULT_TITLE);

/** Favicon from `load_server_icon` in server.cfg (inlined or runtime path), else fxPanel default. */
const resolveFaviconHref = (): string => {
    const server = window.txConsts?.server;
    if (server?.iconDataUrl) {
        return server.iconDataUrl;
    }
    if (server?.icon && runtimeIconRegex.test(server.icon)) {
        return `/.runtime/${server.icon}`;
    }
    return faviconDefault;
};

const applyFavicon = () => {
    faviconEl.href = resolveFaviconHref();
};

export const useSetPageTitle = () => {
    const setPageTitle = useSetAtom(pageTitleAtom);
    return useCallback(
        (title?: string) => {
            if (title) {
                setPageTitle(title);
            } else {
                // probably logout, pageTitleWatcher is not watching!
                setPageTitle(DEFAULT_TITLE);
                document.title = DEFAULT_TITLE;
                applyFavicon();
            }
        },
        [setPageTitle],
    );
};

export const pageTitleWatcher: ReturnType<typeof atomEffect> = atomEffect((get, set) => {
    if (!window.txConsts.isWebInterface) return;
    const pageTitle = get(pageTitleAtom);
    const globalStatus = get(globalStatusAtom);
    // Read to subscribe — re-runs the watcher when the player count changes
    const playerCount = get(playerCountAtom);

    applyFavicon();
    if (!globalStatus) {
        document.title = DEFAULT_TITLE;
    } else {
        document.title = `[${playerCount}] ${pageTitle}`;
    }
});
