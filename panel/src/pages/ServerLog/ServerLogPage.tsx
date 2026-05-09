import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import { ScrollTextIcon, Loader2Icon, ArrowDownIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PageHeader } from '@/components/page-header';
import useServerLog from './useServerLog';
import ServerLogToolbar from './ServerLogToolbar';
import ServerLogEntry, { GroupedJoinLeave } from './ServerLogEntry';
import type { ServerLogEvent } from './serverLogTypes';

// Group consecutive join or leave events within 10 seconds
type DisplayItem =
    | { kind: 'single'; event: ServerLogEvent }
    | { kind: 'group'; type: 'join' | 'leave'; events: ServerLogEvent[] };

const JOIN_TYPES = new Set(['playerJoining', 'playerJoinDenied']);
const LEAVE_TYPES = new Set(['playerDropped']);
const GROUP_WINDOW_MS = 10_000;

const groupEvents = (events: ServerLogEvent[]): DisplayItem[] => {
    const items: DisplayItem[] = [];
    let i = 0;

    while (i < events.length) {
        const event = events[i];
        const isJoin = JOIN_TYPES.has(event.type);
        const isLeave = LEAVE_TYPES.has(event.type);

        if (isJoin || isLeave) {
            const groupType = isJoin ? 'join' : 'leave';
            const matchTypes = isJoin ? JOIN_TYPES : LEAVE_TYPES;
            const group: ServerLogEvent[] = [event];
            let j = i + 1;
            while (j < events.length && matchTypes.has(events[j].type) && events[j].ts - event.ts < GROUP_WINDOW_MS) {
                group.push(events[j]);
                j++;
            }
            if (group.length >= 3) {
                items.push({ kind: 'group', type: groupType, events: group });
            } else {
                for (const e of group) {
                    items.push({ kind: 'single', event: e });
                }
            }
            i = j;
        } else {
            items.push({ kind: 'single', event });
            i++;
        }
    }

    return items;
};

export default function ServerLogPage() {
    const log = useServerLog();
    const scrollRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const sentinelRef = useRef<HTMLDivElement>(null);
    const [showScrollBtn, setShowScrollBtn] = useState(false);
    const userAtBottom = useRef(true);

    // ── Auto-scroll when live and new events arrive ──
    useEffect(() => {
        if (log.isLive && userAtBottom.current && bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'instant' });
        }
    }, [log.events.length, log.isLive]);

    // ── Track if user is at bottom ──
    const handleScroll = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
        const atBottom = gap < 50;
        userAtBottom.current = atBottom;
        setShowScrollBtn(!atBottom);
    }, []);

    // ── Infinite scroll: load older when sentinel becomes visible ──
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    log.loadOlder();
                }
            },
            { root: scrollRef.current, threshold: 0.1 },
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [log.loadOlder]);

    // ── Grouped display items ──
    const displayItems = useMemo(() => groupEvents(log.events), [log.events]);

    const handlePlayerClick = useCallback(
        (name: string) => {
            log.setPlayerFilter(name);
        },
        [log.setPlayerFilter],
    );

    const scrollToBottom = () => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        userAtBottom.current = true;
    };

    return (
        <div className="h-contentvh flex w-full flex-col">
            <PageHeader title="Server Log" icon={<ScrollTextIcon />} />

            <TooltipProvider delayDuration={300}>
                <div className="bg-card border-border/60 flex w-full flex-1 flex-col overflow-hidden border shadow-sm md:rounded-xl">
                    <ServerLogToolbar
                        isLive={log.isLive}
                        isConnected={log.isConnected}
                        filters={log.filters}
                        eventCounts={log.eventCounts}
                        searchText={log.searchText}
                        playerFilter={log.playerFilter}
                        soundEnabled={log.soundEnabled}
                        sessions={log.sessions}
                        activeSession={log.activeSession}
                        toggleLive={log.toggleLive}
                        goLive={log.goLive}
                        loadSession={log.loadSession}
                        toggleFilter={log.toggleFilter}
                        setAllFilters={log.setAllFilters}
                        setSearchText={log.setSearchText}
                        setPlayerFilter={log.setPlayerFilter}
                        toggleSound={log.toggleSound}
                        jumpToTime={log.jumpToTime}
                    />

                    {/* Scrollable log area */}
                    <div ref={scrollRef} className="flex-1 overflow-y-auto" onScroll={handleScroll}>
                        {/* Sentinel for loading older events */}
                        <div ref={sentinelRef} className="h-1" />

                        {/* Loading older indicator */}
                        {log.isLoadingOlder && (
                            <div className="text-muted-foreground flex items-center justify-center gap-2 py-3 text-sm">
                                <Loader2Icon className="h-4 w-4 animate-spin" />
                                Loading older events...
                            </div>
                        )}

                        {/* Loading session indicator */}
                        {log.isLoadingSession && (
                            <div className="text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm">
                                <Loader2Icon className="h-4 w-4 animate-spin" />
                                Loading session...
                            </div>
                        )}

                        {/* No older data indicator */}
                        {!log.hasOlderData && (
                            <div className="text-muted-foreground py-2 text-center text-xs">— Beginning of log —</div>
                        )}

                        {/* Log entries */}
                        {displayItems.length > 0 ? (
                            <div className="divide-border/50 divide-y">
                                {displayItems.map((item, idx) => {
                                    if (item.kind === 'group') {
                                        return (
                                            <GroupedJoinLeave
                                                key={`g-${item.events[0].ts}-${idx}`}
                                                events={item.events}
                                                type={item.type}
                                            />
                                        );
                                    }
                                    return (
                                        <ServerLogEntry
                                            key={`${item.event.ts}-${item.event.type}-${idx}`}
                                            event={item.event}
                                            onPlayerClick={handlePlayerClick}
                                        />
                                    );
                                })}
                            </div>
                        ) : log.allEventsCount > 0 ? (
                            <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 py-16">
                                <p className="text-sm">No events match your filters</p>
                                <Button
                                    variant="ghost"
                                    size="xs"
                                    onClick={() => {
                                        log.setAllFilters(true);
                                        log.setSearchText('');
                                        log.setPlayerFilter(null);
                                    }}
                                >
                                    Clear all filters
                                </Button>
                            </div>
                        ) : (
                            <div className="text-muted-foreground flex items-center justify-center py-16 text-sm">
                                {log.isConnected ? 'Waiting for events...' : 'Connecting...'}
                            </div>
                        )}

                        {/* Bottom anchor */}
                        <div ref={bottomRef} />
                    </div>

                    {/* Scroll-to-bottom button */}
                    {showScrollBtn && log.events.length > 20 && (
                        <div className="absolute right-4 bottom-4">
                            <Button
                                variant="secondary"
                                size="icon"
                                className="h-8 w-8 rounded-full shadow-lg"
                                onClick={scrollToBottom}
                            >
                                <ArrowDownIcon className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                </div>
            </TooltipProvider>
        </div>
    );
}
