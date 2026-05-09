import { Terminal } from '@xterm/xterm';
import { WebglAddon } from '@xterm/addon-webgl';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAtom } from 'jotai';
import { useEventListener } from 'usehooks-ts';
import { useContentRefresh } from '@/hooks/pages';
import { debounce, throttle } from 'throttle-debounce';

import { ChevronsDownIcon, Loader2Icon } from 'lucide-react';
import LiveConsoleFooter from './LiveConsoleFooter';
import LiveConsoleHeader from './LiveConsoleHeader';
import LiveConsoleSearchBar from './LiveConsoleSearchBar';
import LiveConsoleSaveSheet from './LiveConsoleSaveSheet';

import ScrollDownAddon from './ScrollDownAddon';
import terminalOptions, { buildTheme } from './xtermOptions';
import './xtermOverrides.css';
import '@xterm/xterm/css/xterm.css';
import { getSocket, joinSocketRoom, leaveSocketRoom } from '@/lib/utils';
import { openExternalLink } from '@/lib/navigation';
import { handleHotkeyEvent } from '@/lib/hotkeyEventListener';
import { txToast } from '@/components/TxToaster';
import {
    ANSI,
    copyTermLine,
    extractTermLineTimestamp,
    formatTermTimestamp,
    getNumFontVariantsLoaded,
    sanitizeTermLine,
} from './liveConsoleUtils';
import {
    getTermLineEventData,
    getTermLineInitialData,
    getTermLineRtlData,
    registerTermLineMarker,
} from './liveConsoleMarkers';
import { emsg } from '@shared/emsg';
import { liveConsoleOptionsAtom } from './liveConsoleHooks';
import type { LiveConsoleInitialData } from '@shared/consoleBlock';

//Options
export type LiveConsoleOptions = {
    timestampDisabled: boolean;
    timestampForceHour12: boolean | undefined;
    copyTimestamp: boolean;
    copyTag: boolean;
};

//Consts
const keyDebounceTime = 150; //ms

//Main component
export default function LiveConsolePage() {
    const [isSaveSheetOpen, setIsSaveSheetOpen] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [showSearchBar, setShowSearchBar] = useState(false);
    const [hasReceivedData, setHasReceivedData] = useState(false);
    const [hasOlderBlocks, setHasOlderBlocks] = useState(false);
    const [isLoadingOlder, setIsLoadingOlder] = useState(false);
    const termInputRef = useRef<HTMLInputElement>(null);
    const [consoleOptions, setConsoleOptions] = useAtom(liveConsoleOptionsAtom);
    const consoleOptionsRef = useRef(consoleOptions);
    useEffect(() => {
        consoleOptionsRef.current = consoleOptions;
    }, [consoleOptions]);
    const defaultTermPrefix = useMemo(
        () => formatTermTimestamp(Date.now(), consoleOptions).replace(/\w/g, '-'),
        [consoleOptions],
    );
    const termPrefixRef = useRef({
        ts: 0, //so we can clear the console
        lastEol: true,
        prefix: '',
    });
    // Keep prefix in sync with options changes
    useEffect(() => {
        termPrefixRef.current.prefix = defaultTermPrefix;
    }, [defaultTermPrefix]);
    const oldestLoadedSeqRef = useRef<number>(0);
    const serverOldestSeqRef = useRef<number>(0);
    const spawnLineNumbersRef = useRef<number[]>([]);
    const hasReceivedDataRef = useRef(false);
    const refreshPage = useContentRefresh();

    /**
     * xterm stuff
     */
    const jumpBottomBtnRef = useRef<HTMLButtonElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const xtermMountCycleRef = useRef(0);
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

        fitAddon.fit();
    };
    useEventListener('resize', debounce(100, refitTerminal));

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        let frameId = 0;
        const scheduleRefit = () => {
            cancelAnimationFrame(frameId);
            frameId = requestAnimationFrame(() => {
                refitTerminal();
            });
        };

        const resizeObserver = new ResizeObserver(() => {
            scheduleRefit();
        });
        resizeObserver.observe(container);
        if (container.parentElement) {
            resizeObserver.observe(container.parentElement);
        }

        const viewport = window.visualViewport;
        viewport?.addEventListener('resize', scheduleRefit);
        viewport?.addEventListener('scroll', scheduleRefit);

        return () => {
            cancelAnimationFrame(frameId);
            resizeObserver.disconnect();
            viewport?.removeEventListener('resize', scheduleRefit);
            viewport?.removeEventListener('scroll', scheduleRefit);
        };
    }, [term, fitAddon]);

    useEffect(() => {
        xtermMountCycleRef.current += 1;

        if (containerRef.current && jumpBottomBtnRef.current && !term.element) {
            console.log('live console xterm init');
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
                if (e.code === 'F5' && !e.ctrlKey) {
                    return false;
                } else if (e.code === 'Escape') {
                    return false;
                } else if (e.code === 'KeyF' && (e.ctrlKey || e.metaKey)) {
                    return false;
                } else if (e.code === 'F3') {
                    return false;
                } else if (e.code === 'KeyC' && (e.ctrlKey || e.metaKey)) {
                    const selection = term.getSelection();
                    if (!selection) return false;
                    copyTermLine(selection, term.element as any, consoleOptionsRef.current, termInputRef.current)
                        .then((res) => {
                            //undefined if no error
                            if (res === false) {
                                txToast.error('Failed to copy to clipboard :(');
                            }
                        })
                        .catch((error) => {
                            txToast.error({
                                title: 'Failed to copy to clipboard:',
                                msg: error.message,
                            });
                        });
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
        }

        return () => {
            if (import.meta.env.DEV && xtermMountCycleRef.current === 1) {
                return;
            }

            term.dispose();
            xtermMountCycleRef.current = 0;
        };
    }, [term]);

    // Re-apply xterm theme when light/dark mode changes
    useEffect(() => {
        const observer = new MutationObserver(() => {
            // Double rAF to ensure CSS variables have been fully recalculated
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const isDark = document.documentElement.classList.contains('dark');
                    term.options.theme = buildTheme();
                    term.options.fontWeight = isDark ? '300' : '400';
                });
            });
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, [term]);

    useEventListener('keydown', (e: KeyboardEvent) => {
        if (e.code === 'F5' && !e.ctrlKey) {
            if (isConnected) {
                refreshPage();
                e.preventDefault();
            }
        } else if (e.code === 'Escape') {
            searchAddon.clearDecorations();
            setShowSearchBar(false);
        } else if (e.code === 'KeyF' && (e.ctrlKey || e.metaKey)) {
            if (showSearchBar) {
                sendSearchKeyEvent('focus');
            } else {
                setShowSearchBar(true);
            }
            e.preventDefault();
        } else if (e.code === 'F3') {
            sendSearchKeyEvent(e.shiftKey ? 'previous' : 'next');
            e.preventDefault();
        }
    });

    //NOTE: quickfix for https://github.com/xtermjs/xterm.js/issues/4994
    const writeToTerminal = (data: string, trackSpawnLines = true) => {
        const lines = data.split(/\r?\n/);
        //check if last line isn't empty
        // NOTE: i'm not trimming because having multiple \n at the end is valid
        let wasEolStripped = false;
        if (lines.length && !lines[lines.length - 1]) {
            lines.pop();
            wasEolStripped = true;
        }

        //extracts timestamp & print each line
        let isNewTs = false;
        for (let i = 0; i < lines.length; i++) {
            isNewTs = false;
            let line = lines[i];
            //tries to extract timestamp
            try {
                const { ts, content } = extractTermLineTimestamp(line);
                if (ts) {
                    isNewTs = true;
                    line = content;
                    termPrefixRef.current.ts = ts;
                    termPrefixRef.current.prefix = formatTermTimestamp(ts, consoleOptionsRef.current);
                }
            } catch (error) {
                termPrefixRef.current.prefix = defaultTermPrefix;
                console.warn('Failed to parse timestamp from:', line, emsg(error));
            }

            //Track spawn lines for navigation
            if (trackSpawnLines && /FXServer Starting/.test(sanitizeTermLine(line))) {
                const lineNum = term.buffer.active.baseY + term.buffer.active.cursorY + 1;
                spawnLineNumbersRef.current.push(lineNum);
            }

            //Markers
            let writeCallback: (() => void) | undefined;
            try {
                const res = getTermLineEventData(line) ?? getTermLineInitialData(line) ?? getTermLineRtlData(line); //https://github.com/xtermjs/xterm.js/issues/701
                if (res && res.markerData) {
                    writeCallback = () => registerTermLineMarker(term, res.markerData);
                }
                if (res && res.newLine) {
                    line = res.newLine;
                }
            } catch (error) {
                console.error('Failed to process marker:', emsg(error));
            }

            //Check if it's last line, and if the EOL was stripped
            const prefixColor = isNewTs ? ANSI.WHITE : ANSI.GRAY;
            const prefix = termPrefixRef.current.lastEol ? prefixColor + termPrefixRef.current.prefix : '';
            if (i < lines.length - 1) {
                term.writeln(prefix + line, writeCallback);
                termPrefixRef.current.lastEol = true;
            } else {
                if (wasEolStripped) {
                    term.writeln(prefix + line, writeCallback);
                    termPrefixRef.current.lastEol = true;
                } else {
                    term.write(prefix + line, writeCallback);
                    termPrefixRef.current.lastEol = false;
                }
            }
        }
    };

    //DEBUG
    // useEffect(() => {
    //     let cnt = 0;
    //     const interval = setInterval(function LoLoLoLoLoLoL() {
    //         cnt++;
    //         const mod = cnt % 60;
    //         term.writeln(
    //             cnt.toString().padStart(6, '0') + ' ' +
    //             '\u001b[1m\u001b[31m=\u001b[0m'.repeat(mod) +
    //             '\u001b[1m\u001b[33m.\u001b[0m'.repeat(60 - mod)
    //         );
    //     }, 100);
    //     return () => clearInterval(interval);
    // }, []);

    /**
     * SocketIO stuff
     */
    const socketStateChangeCounter = useRef(0);
    const pageSocket = useRef<ReturnType<typeof getSocket> | null>(null);

    //Runing on mount only
    useEffect(() => {
        const socket = getSocket();
        pageSocket.current = socket;
        setIsConnected(socket.connected);

        const connectHandler = () => {
            console.log('LiveConsole Socket.IO Connected.');
            setIsConnected(true);
        };
        const disconnectHandler = (message: string) => {
            console.log('LiveConsole Socket.IO Disconnected:', message);
            //Grace period of 500ms to allow for quick reconnects
            //Tracking the state change ID for the timeout not to overwrite a reconnection
            const newId = socketStateChangeCounter.current + 1;
            socketStateChangeCounter.current = newId;
            setTimeout(() => {
                if (socketStateChangeCounter.current === newId) {
                    setIsConnected(false);
                }
            }, 500);
        };
        const errorHandler = (reason?: string) => {
            console.log('LiveConsole Socket.IO', reason ?? 'unknown');
        };
        const dataHandler = (data: any) => {
            if (typeof data === 'string') {
                //Streaming data
                if (!hasReceivedDataRef.current) {
                    hasReceivedDataRef.current = true;
                    setHasReceivedData(true);
                }
                writeToTerminal(data);
            } else if (data && typeof data === 'object' && 'blocks' in data) {
                //Initial structured data
                const initData = data as LiveConsoleInitialData;
                serverOldestSeqRef.current = initData.oldestSeq;
                if (initData.blocks.length > 0) {
                    hasReceivedDataRef.current = true;
                    setHasReceivedData(true);
                    oldestLoadedSeqRef.current = initData.blocks[0].seq;
                    setHasOlderBlocks(initData.blocks[0].seq > initData.oldestSeq);
                    for (const block of initData.blocks) {
                        writeToTerminal(block.data);
                    }
                } else {
                    setHasOlderBlocks(false);
                    term.writeln(`\n${ANSI.YELLOW}Waiting for server output...${ANSI.RESET}`);
                }
            }
        };

        socket.on('connect', connectHandler);
        socket.on('disconnect', disconnectHandler);
        socket.on('error', errorHandler);
        socket.on('consoleData', dataHandler);
        joinSocketRoom('liveconsole');

        return () => {
            socket.off('connect', connectHandler);
            socket.off('disconnect', disconnectHandler);
            socket.off('error', errorHandler);
            socket.off('consoleData', dataHandler);
            leaveSocketRoom('liveconsole');
        };
    }, []);

    //Font loading effect
    //NOTE: on first render, the font might not be loaded yet, in this case we listen for the loadingdone event
    //  and force xterm to re-measure character cells with the now-loaded font
    //  Ref: https://github.com/xtermjs/xterm.js/issues/5164
    useEffect(() => {
        if (getNumFontVariantsLoaded('--font-mono', 'INITIAL EFFECT')) return;
        const handleFontLoadingDone = () => {
            getNumFontVariantsLoaded('--font-mono', 'ON FONT LOADING DONE');
            //Force xterm to recalculate character cell dimensions with the loaded font
            term.options.fontSize = term.options.fontSize;
            refitTerminal();
        };
        document.fonts.addEventListener('loadingdone', handleFontLoadingDone);
        return () => {
            document.fonts.removeEventListener('loadingdone', handleFontLoadingDone);
        };
    }, []);

    /**
     * Action Handlers
     */
    const consoleWrite = (cmd: string) => {
        if (!isConnected || !pageSocket.current) return;
        if (cmd === 'cls' || cmd === 'clear') {
            clearConsole();
        } else {
            pageSocket.current.emit('consoleCommand', cmd);
        }
    };
    const clearConsole = () => {
        term.clear();
        searchAddon.clearDecorations();
        setShowSearchBar(false);
        spawnLineNumbersRef.current = [];
        term.write(`${ANSI.YELLOW}[console cleared]${ANSI.RESET}\n`);
        //Persist the clear so reconnects don't restore old data
        if (pageSocket.current) {
            pageSocket.current.emit('consoleClear' as any);
        }
    };
    const toggleSearchBar = () => {
        setShowSearchBar(!showSearchBar);
    };
    const toggleSaveSheet = () => {
        setIsSaveSheetOpen(!isSaveSheetOpen);
    };
    const loadOlderBlocks = () => {
        if (!pageSocket.current || isLoadingOlder || !hasOlderBlocks) return;
        setIsLoadingOlder(true);
        pageSocket.current.emit('consoleLoadOlder' as any, oldestLoadedSeqRef.current, (resp: any) => {
            setIsLoadingOlder(false);
            if (!resp || !resp.blocks || !resp.blocks.length) {
                setHasOlderBlocks(false);
                return;
            }
            //Save scroll position
            const prevBaseY = term.buffer.active.baseY;
            const prevViewportY = term.buffer.active.viewportY;

            //Write older blocks at the top by prepending content
            //xterm doesn't support prepending, so we reset and re-render
            const olderData = resp.blocks.map((b: any) => b.data).join('');
            const currentBuffer = getAllTerminalContent();

            //Reset terminal state
            termPrefixRef.current.lastEol = true;
            termPrefixRef.current.ts = 0;
            spawnLineNumbersRef.current = [];
            term.reset();
            term.write('\x1b[?25l'); //hide cursor

            //Write older + current data
            writeToTerminal(olderData + currentBuffer, true);

            //Update tracking
            oldestLoadedSeqRef.current = resp.blocks[0].seq;
            serverOldestSeqRef.current = resp.oldestSeq;
            setHasOlderBlocks(resp.blocks[0].seq > resp.oldestSeq);

            //Restore scroll position (offset by new lines added)
            const addedLines = term.buffer.active.baseY - prevBaseY;
            term.scrollToLine(prevViewportY + addedLines);
        });
    };
    const getAllTerminalContent = () => {
        const buf = term.buffer.active;
        const lines: string[] = [];
        for (let i = 0; i <= buf.baseY + buf.cursorY; i++) {
            const line = buf.getLine(i);
            if (line) {
                lines.push(line.translateToString(true));
            }
        }
        return lines.join('\n') + '\n';
    };
    const jumpToLastServerStart = () => {
        const spawns = spawnLineNumbersRef.current;
        if (!spawns.length) return;
        const targetLine = spawns[spawns.length - 1];
        term.scrollToLine(Math.max(0, targetLine - 2));
    };
    const jumpToPreviousServerStart = () => {
        const spawns = spawnLineNumbersRef.current;
        if (spawns.length < 2) return;
        const targetLine = spawns[spawns.length - 2];
        term.scrollToLine(Math.max(0, targetLine - 2));
    };
    const inputSuggestions = (cmd: string) => {
        if (termInputRef.current) {
            termInputRef.current.value = cmd;
            termInputRef.current.focus();
        }
        setIsSaveSheetOpen(false);
    };

    return (
        <div className="dark text-primary h-contentvh bg-card border-border/60 flex w-full flex-col overflow-clip border shadow-sm md:rounded-xl">
            <LiveConsoleHeader
                isConnected={isConnected}
                hasSpawnLines={spawnLineNumbersRef.current.length > 0}
                onJumpToLastStart={jumpToLastServerStart}
                onJumpToPrevStart={jumpToPreviousServerStart}
            />

            <div className="relative flex grow flex-col overflow-hidden">
                {/* Connecting overlay */}
                {!isConnected ? (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60">
                        <div className="text-muted-foreground flex flex-col items-center justify-center gap-6 select-none">
                            <Loader2Icon className="h-16 w-16 animate-spin" />
                            <h2 className="animate-pulse text-3xl font-light tracking-wider">
                                &nbsp;&nbsp;&nbsp;Connecting...
                            </h2>
                        </div>
                    </div>
                ) : null}

                <LiveConsoleSaveSheet
                    isOpen={isSaveSheetOpen}
                    closeSheet={() => setIsSaveSheetOpen(false)}
                    toTermInput={(cmd) => inputSuggestions(cmd)}
                />

                {/* Load older blocks button */}
                {hasOlderBlocks && isConnected && (
                    <button
                        className="bg-secondary text-secondary-foreground hover:bg-secondary/80 absolute top-0 left-1/2 z-10 -translate-x-1/2 rounded-b px-3 py-1 text-xs font-medium opacity-80 transition-opacity hover:opacity-100"
                        onClick={loadOlderBlocks}
                        disabled={isLoadingOlder}
                    >
                        {isLoadingOlder ? 'Loading...' : 'Load older output'}
                    </button>
                )}

                {/* Terminal container */}
                <div ref={containerRef} className="absolute top-1 right-0 bottom-0 left-2" />

                {/* Search bar */}
                <LiveConsoleSearchBar show={showSearchBar} setShow={setShowSearchBar} searchAddon={searchAddon} />

                {/* Scroll to bottom */}
                <button
                    ref={jumpBottomBtnRef}
                    className="absolute right-2 bottom-0 z-10 hidden opacity-75"
                    onClick={() => {
                        term.scrollToBottom();
                    }}
                >
                    <ChevronsDownIcon className="h-20 w-20 animate-pulse hover:scale-110 hover:animate-none" />
                </button>
            </div>

            <LiveConsoleFooter
                termInputRef={termInputRef}
                isConnected={isConnected}
                consoleWrite={consoleWrite}
                consoleClear={clearConsole}
                toggleSaveSheet={toggleSaveSheet}
                toggleSearchBar={toggleSearchBar}
                consoleOptions={consoleOptions}
                onOptionsChange={setConsoleOptions}
            />
        </div>
    );
}
