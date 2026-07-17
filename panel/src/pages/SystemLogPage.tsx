import { Terminal } from '@xterm/xterm';
import { WebglAddon } from '@xterm/addon-webgl';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { useEventListener } from 'usehooks-ts';
import { useContentRefresh } from '@/hooks/pages';
import { debounce, throttle } from 'throttle-debounce';
import {
    AlertTriangleIcon,
    ChevronsDownIcon,
    Loader2Icon,
    RotateCwIcon,
    ScrollTextIcon,
    SearchIcon,
} from 'lucide-react';

import '@/pages/LiveConsole/xtermOverrides.css';
import '@xterm/xterm/css/xterm.css';
import { openExternalLink } from '@/lib/navigation';
import { handleHotkeyEvent } from '@/lib/hotkeyEventListener';
import terminalOptions from '@/pages/LiveConsole/xtermOptions';
import ScrollDownAddon from '@/pages/LiveConsole/ScrollDownAddon';
import LiveConsoleSearchBar from '@/pages/LiveConsole/LiveConsoleSearchBar';
import { useBackendApi } from '@/hooks/fetch';
import { useLocale } from '@/hooks/locale';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SystemLogPageProps } from './systemLogTypes';
import { writePlainTerminalChunk } from '@/pages/LiveConsole/liveConsoleUtils';

//Helpers
const keyDebounceTime = 150; //ms

type SystemLogPageState = {
    isLoading: boolean;
    loadError: string;
    showSearchBar: boolean;
};

type SystemLogPageAction =
    | { type: 'logsLoaded' }
    | { type: 'logsFailed'; loadError: string }
    | { type: 'setShowSearchBar'; showSearchBar: boolean };

function reduceSystemLogPageState(state: SystemLogPageState, action: SystemLogPageAction): SystemLogPageState {
    switch (action.type) {
        case 'logsLoaded':
            return { ...state, isLoading: false, loadError: '' };
        case 'logsFailed':
            return { ...state, isLoading: false, loadError: action.loadError };
        case 'setShowSearchBar':
            return { ...state, showSearchBar: action.showSearchBar };
        default:
            return state;
    }
}

/**
 * System Log V2 — redesign goals over V1:
 * - V2 header band with a live status pill (loading / loaded / error)
 *   replacing PageHeader + a duplicated inner card header.
 * - Slim card toolbar with an explicit Search (Ctrl+F) button so the
 *   search feature is discoverable without knowing the hotkey.
 * - Token-styled loading/error overlays (no text-3xl headings), error
 *   overlay gains a Retry button.
 * - Scroll-to-bottom FAB matches the Server Log V2 pill button instead
 *   of the size-20 pulsing chevron.
 *
 * All xterm wiring (addons, hotkeys, fetch flow) is identical to V1.
 */
export default function SystemLogPage({ pageName }: SystemLogPageProps) {
    const { t } = useLocale();
    const [state, dispatch] = useReducer(reduceSystemLogPageState, {
        isLoading: true,
        loadError: '',
        showSearchBar: false,
    });
    const { isLoading, loadError, showSearchBar } = state;
    const refreshPage = useContentRefresh();
    const getLogsApi = useBackendApi<{ data: string }>({
        method: 'GET',
        path: `/logs/system/${pageName}`,
        throwGenericErrors: true,
    });

    /**
     * xterm stuff
     */
    const jumpBottomBtnRef = useRef<HTMLButtonElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const term = useMemo(() => new Terminal(terminalOptions), []);
    const fitAddon = useMemo(() => new FitAddon(), []);
    const searchAddon = useMemo(() => new SearchAddon(), []);
    const termLinkHandler = (event: MouseEvent, uri: string) => {
        openExternalLink(uri);
    };
    const webLinksAddon = useMemo(() => new WebLinksAddon(termLinkHandler), []);

    const sendSearchKeyEvent = throttle(
        keyDebounceTime,
        (action: string) => {
            window.postMessage({
                type: 'liveConsoleSearchHotkey',
                action,
            });
        },
        { noTrailing: true },
    );

    const refitTerminal = () => {
        if (!containerRef.current || !term.element || !fitAddon) {
            console.log('refitTerminal: no containerRef.current or term.element or fitAddon');
            return;
        }

        const proposed = fitAddon.proposeDimensions();
        if (proposed) {
            term.resize(proposed.cols, proposed.rows);
        } else {
            console.log('refitTerminal: no proposed dimensions');
        }
    };

    //NOTE: quickfix for https://github.com/xtermjs/xterm.js/issues/4994
    const writeToTerminal = (data: string) => {
        writePlainTerminalChunk(term, data);
    };

    const refitTerminalRef = useRef(refitTerminal);
    refitTerminalRef.current = refitTerminal;
    const debouncedRefitTerminal = useMemo(() => debounce(100, () => refitTerminalRef.current()), []);
    useEventListener('resize', debouncedRefitTerminal);

    useEffect(() => {
        if (containerRef.current && jumpBottomBtnRef.current && !term.element) {
            console.log('xterm init');
            containerRef.current.innerHTML = ''; //due to HMR, the terminal element might still be there
            term.loadAddon(fitAddon);
            term.loadAddon(searchAddon);
            term.loadAddon(webLinksAddon);
            term.loadAddon(new WebglAddon());
            term.loadAddon(new ScrollDownAddon(jumpBottomBtnRef.current));
            term.open(containerRef.current);
            term.write('\x1b[?25l'); //hide cursor
            refitTerminal();

            const scrollPageUp = throttle(
                keyDebounceTime,
                () => {
                    term.scrollLines(Math.min(1, 2 - term.rows));
                },
                { noTrailing: true },
            );
            const scrollPageDown = throttle(
                keyDebounceTime,
                () => {
                    term.scrollLines(Math.max(1, term.rows - 2));
                },
                { noTrailing: true },
            );
            const scrollTop = throttle(
                keyDebounceTime,
                () => {
                    term.scrollToTop();
                },
                { noTrailing: true },
            );
            const scrollBottom = throttle(
                keyDebounceTime,
                () => {
                    term.scrollToBottom();
                },
                { noTrailing: true },
            );

            term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
                // Some are handled by the live console element
                if (e.code === 'F5') {
                    return false;
                } else if (e.code === 'Escape') {
                    return false;
                } else if (e.code === 'KeyF' && (e.ctrlKey || e.metaKey)) {
                    return false;
                } else if (e.code === 'F3') {
                    return false;
                } else if (e.code === 'KeyC' && (e.ctrlKey || e.metaKey)) {
                    document.execCommand('copy');
                    term.clearSelection();
                    return false;
                } else if (e.code === 'PageUp') {
                    scrollPageUp();
                    return false;
                } else if (e.code === 'PageDown') {
                    scrollPageDown();
                    return false;
                } else if (e.code === 'Home') {
                    scrollTop();
                    return false;
                } else if (e.code === 'End') {
                    scrollBottom();
                    return false;
                } else if (handleHotkeyEvent(e)) {
                    return false;
                }
                return true;
            });

            //fetch logs
            getLogsApi({
                success: (resp, toastId) => {
                    dispatch({ type: 'logsLoaded' });
                    writeToTerminal(resp.data);
                    term.writeln('');
                    term.writeln(`\u001b[33m${t('panel.system_log_page.end_of_log')}\u001b`);
                },
                error: (message, toastId) => {
                    dispatch({ type: 'logsFailed', loadError: message });
                },
            });
        }
    }, [term, t, getLogsApi]);

    //Hotkeys
    useEventListener('keydown', (e: KeyboardEvent) => {
        if (e.code === 'F5') {
            if (isLoading) {
                refreshPage();
                e.preventDefault();
            }
        } else if (e.code === 'Escape') {
            searchAddon.clearDecorations();
            dispatch({ type: 'setShowSearchBar', showSearchBar: false });
        } else if (e.code === 'KeyF' && (e.ctrlKey || e.metaKey)) {
            if (showSearchBar) {
                sendSearchKeyEvent('focus');
            } else {
                dispatch({ type: 'setShowSearchBar', showSearchBar: true });
            }
            e.preventDefault();
        } else if (e.code === 'F3') {
            sendSearchKeyEvent(e.shiftKey ? 'previous' : 'next');
            e.preventDefault();
        }
    });

    const handleOpenSearch = () => {
        if (showSearchBar) {
            sendSearchKeyEvent('focus');
        } else {
            dispatch({ type: 'setShowSearchBar', showSearchBar: true });
        }
    };

    //Rendering stuff
    const pageTitle = t('panel.system_log_page.title');
    const pageSubtitle = t('panel.system_log_page.description');

    return (
        <div className="h-contentvh mx-auto flex w-full max-w-(--tx-page-max-width) flex-col px-2 md:px-0">
            {/* Header band */}
            <div className="border-border/60 bg-background mb-4 shrink-0 rounded-xl border">
                <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="bg-secondary/50 text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-xl">
                            <ScrollTextIcon className="size-5" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-foreground truncate text-lg font-semibold tracking-tight">
                                {pageTitle}
                            </h1>
                            <p className="text-muted-foreground mt-0.5 truncate text-xs">{pageSubtitle}</p>
                        </div>
                    </div>
                    <div
                        className={cn(
                            'inline-flex shrink-0 items-center gap-2 self-start rounded-full border px-3 py-1.5 sm:self-auto',
                            loadError
                                ? 'border-destructive/40 bg-destructive/10'
                                : isLoading
                                  ? 'border-border/50 bg-secondary/40'
                                  : 'border-success/40 bg-success/10',
                        )}
                    >
                        {loadError ? (
                            <AlertTriangleIcon className="text-destructive-inline size-3.5 shrink-0" />
                        ) : isLoading ? (
                            <Loader2Icon className="text-muted-foreground size-3.5 shrink-0 animate-spin" />
                        ) : (
                            <span className="bg-success size-1.5 shrink-0 rounded-full" aria-hidden="true" />
                        )}
                        <span className="text-muted-foreground/70 text-[11px] font-semibold tracking-wider uppercase">
                            {loadError ? 'Error' : isLoading ? 'Loading' : 'Loaded'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Terminal card */}
            <div className="dark text-primary bg-background border-border/60 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border">
                <div className="bg-secondary/20 border-border/60 flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5">
                    <p className="text-foreground/90 text-sm font-medium">{t('panel.system_log_page.stream_title')}</p>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground h-7 gap-1.5 px-2 text-xs"
                        onClick={handleOpenSearch}
                    >
                        <SearchIcon className="size-3.5" />
                        Search
                        <kbd className="border-border/60 bg-muted/40 hidden rounded border px-1 py-px font-mono text-[10px] sm:inline">
                            Ctrl+F
                        </kbd>
                    </Button>
                </div>

                <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                    {/* Loading overlay */}
                    {isLoading && !loadError ? (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60">
                            <div className="text-muted-foreground flex flex-col items-center justify-center gap-3 select-none">
                                <Loader2Icon className="size-8 animate-spin" />
                                <p className="text-sm font-medium">{t('panel.system_log_page.loading')}</p>
                            </div>
                        </div>
                    ) : null}
                    {loadError && (
                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/60 px-8">
                            <div className="bg-destructive/15 flex size-12 items-center justify-center rounded-xl">
                                <AlertTriangleIcon className="text-destructive-inline size-6" />
                            </div>
                            <p className="text-foreground text-sm font-medium select-none">
                                {t('panel.system_log_page.fetch_error', { title: pageTitle })}
                            </p>
                            <p className="text-destructive-inline max-w-(--breakpoint-md) text-center font-mono text-xs">
                                {loadError}
                            </p>
                            <Button variant="outline" size="sm" onClick={() => refreshPage()}>
                                <RotateCwIcon className="mr-1.5 size-4" />
                                Retry
                            </Button>
                        </div>
                    )}

                    {/* Terminal container */}
                    <div ref={containerRef} className="absolute top-1 right-0 bottom-0 left-2" />

                    {/* Search bar */}
                    {showSearchBar ? (
                        <LiveConsoleSearchBar
                            setShow={(show) => dispatch({ type: 'setShowSearchBar', showSearchBar: show })}
                            searchAddon={searchAddon}
                        />
                    ) : null}

                    {/* Scroll to bottom */}
                    <button
                        ref={jumpBottomBtnRef}
                        aria-label="Scroll to bottom of log"
                        className="bg-secondary text-secondary-foreground hover:bg-secondary/80 absolute right-4 bottom-4 z-10 hidden size-8 items-center justify-center rounded-full shadow-lg transition-colors [&:not(.hidden)]:flex"
                        onClick={() => {
                            term.scrollToBottom();
                        }}
                    >
                        <ChevronsDownIcon className="size-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
