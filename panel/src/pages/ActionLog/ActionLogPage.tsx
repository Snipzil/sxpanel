import { useEffect, useRef, useCallback, useState } from 'react';
import { ScrollTextIcon, Loader2Icon, ArrowDownIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PageHeader, PageHeaderChangelog } from '@/components/page-header';
import useActionLog from './useActionLog';
import ActionLogToolbar from './ActionLogToolbar';
import ActionLogEntry from './ActionLogEntry';
import AdminStatsDialog from '@/pages/AdminManager/AdminStatsDialog';
import type { ConfigChangelogEntry } from '@shared/otherTypes';
import { useBackendApi } from '@/hooks/fetch';

export default function ActionLogPage() {
    const log = useActionLog();
    const scrollRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const sentinelRef = useRef<HTMLDivElement>(null);
    const [showScrollBtn, setShowScrollBtn] = useState(false);
    const userAtBottom = useRef(true);

    // ── Config changelog for header ──
    const [configChangelog, setConfigChangelog] = useState<ConfigChangelogEntry[]>([]);
    const configChangelogApi = useBackendApi<{ configChangelog: ConfigChangelogEntry[] }>({
        method: 'GET',
        path: '/logs/system/configChangelog',
        throwGenericErrors: true,
    });
    useEffect(() => {
        configChangelogApi({})
            .then((resp) => {
                if (resp?.configChangelog) setConfigChangelog(resp.configChangelog);
            })
            .catch(() => {
                /* ignore */
            });
    }, []);

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

    const handleAdminClick = useCallback((name: string) => {
        setStatsAdmin(name);
    }, []);

    const [statsAdmin, setStatsAdmin] = useState<string | null>(null);

    const scrollToBottom = () => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        userAtBottom.current = true;
    };

    return (
        <div className="h-contentvh mx-auto flex w-full max-w-(--breakpoint-xl) flex-col gap-4 px-2 md:px-0">
            <PageHeader
                title="Action Log"
                description="Review administrative activity and configuration changes."
                icon={<ScrollTextIcon />}
            >
                <PageHeaderChangelog changelogData={configChangelog} />
            </PageHeader>

            <TooltipProvider delayDuration={300}>
                <div className="bg-card border-border/60 relative flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border shadow-sm">
                    <ActionLogToolbar
                        isLive={log.isLive}
                        isConnected={log.isConnected}
                        filters={log.filters}
                        eventCounts={log.eventCounts}
                        searchText={log.searchText}
                        adminFilter={log.adminFilter}
                        sessions={log.sessions}
                        activeSession={log.activeSession}
                        toggleLive={log.toggleLive}
                        goLive={log.goLive}
                        loadSession={log.loadSession}
                        toggleFilter={log.toggleFilter}
                        setAllFilters={log.setAllFilters}
                        setSearchText={log.setSearchText}
                        setAdminFilter={log.setAdminFilter}
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
                        {log.events.length > 0 ? (
                            <div className="divide-border/50 divide-y">
                                {log.events.map((event, idx) => (
                                    <ActionLogEntry
                                        key={`${event.ts}-${event.category}-${idx}`}
                                        event={event}
                                        onAdminClick={handleAdminClick}
                                    />
                                ))}
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
                                        log.setAdminFilter(null);
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

            <AdminStatsDialog
                open={!!statsAdmin}
                onOpenChange={(open) => {
                    if (!open) setStatsAdmin(null);
                }}
                adminName={statsAdmin ?? ''}
            />
        </div>
    );
}
