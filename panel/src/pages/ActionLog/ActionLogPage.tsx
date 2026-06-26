import { useEffect, useRef, useCallback, useState } from 'react';
import { Loader2Icon, ArrowDownIcon, FilterXIcon, RadioTowerIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import useActionLog from '@/pages/ActionLog/useActionLog';
import ActionLogToolbar from '@/pages/ActionLog/ActionLogToolbar';
import AdminStatsDialog from '@/pages/AdminManager/AdminStatsDialog';
import type { ConfigChangelogEntry } from '@shared/otherTypes';
import { useBackendApi } from '@/hooks/fetch';
import { useLocale } from '@/hooks/locale';
import { ActionLogHeaderBand } from './ActionLogHeaderBand';
import ActionLogEntry from './ActionLogEntry';

/**
 * Action Log V2 — redesign goals over V1:
 * - V2 header band (icon tile + connection/event stat pills + changelog
 *   popover) replacing PageHeader, matching the Server Log V2 band.
 * - Light/dark adaptive category colorway in entries (V1 used dark-only
 *   `*-400` shades).
 * - Richer empty/connecting states with icons, mirroring Server Log V2.
 * - Labeled scroll-to-bottom FAB.
 */
export default function ActionLogPage() {
    const { t } = useLocale();
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

    const [statsAdmin, setStatsAdmin] = useState<string | null>(null);

    const handleAdminClick = useCallback((name: string) => {
        setStatsAdmin(name);
    }, []);

    const handleClearFilters = useCallback(() => {
        log.setAllFilters(true);
        log.setSearchText('');
        log.setAdminFilter(null);
    }, [log.setAllFilters, log.setSearchText, log.setAdminFilter]);

    const scrollToBottom = () => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        userAtBottom.current = true;
    };

    return (
        <div className="h-contentvh mx-auto flex w-full max-w-(--tx-page-max-width) flex-col px-2 md:px-0">
            <ActionLogHeaderBand
                title={t('panel.routes.action_log')}
                isLive={log.isLive}
                isConnected={log.isConnected}
                totalEvents={log.allEventsCount}
                eventCounts={log.eventCounts}
                activeSession={log.activeSession}
                changelogData={configChangelog}
            />

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
                                <Loader2Icon className="size-4 animate-spin" />
                                Loading older events…
                            </div>
                        )}

                        {/* Loading session indicator */}
                        {log.isLoadingSession && (
                            <div className="text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm">
                                <Loader2Icon className="size-4 animate-spin" />
                                Loading session…
                            </div>
                        )}

                        {/* No older data indicator */}
                        {!log.hasOlderData && (
                            <div className="text-muted-foreground/70 py-2 text-center text-xs tracking-wider uppercase">
                                Beginning of log
                            </div>
                        )}

                        {/* Log entries */}
                        {log.events.length > 0 ? (
                            <div className="divide-border/50 divide-y">
                                {log.events.map((event) => (
                                    <ActionLogEntry
                                        key={
                                            event.actionId ??
                                            `${event.ts}-${event.category}-${event.author}-${event.action}`
                                        }
                                        event={event}
                                        onAdminClick={handleAdminClick}
                                    />
                                ))}
                            </div>
                        ) : log.allEventsCount > 0 ? (
                            <div className="text-muted-foreground flex flex-col items-center justify-center gap-3 py-16">
                                <div className="bg-muted flex size-12 items-center justify-center rounded-xl">
                                    <FilterXIcon className="size-6" />
                                </div>
                                <p className="text-sm font-medium">No events match your filters</p>
                                <Button variant="outline" size="sm" onClick={handleClearFilters}>
                                    Clear all filters
                                </Button>
                            </div>
                        ) : (
                            <div className="text-muted-foreground flex flex-col items-center justify-center gap-3 py-16">
                                <div className="bg-muted flex size-12 items-center justify-center rounded-xl">
                                    <RadioTowerIcon className="size-6" />
                                </div>
                                <p className="text-sm font-medium">
                                    {log.isConnected ? 'Waiting for events…' : 'Connecting…'}
                                </p>
                                <p className="text-muted-foreground/70 max-w-xs text-center text-xs">
                                    {log.isConnected
                                        ? 'New admin activity will appear here as it happens.'
                                        : 'Establishing a live connection to the action log stream.'}
                                </p>
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
                                className="size-8 rounded-full shadow-lg"
                                aria-label="Scroll to latest events"
                                onClick={scrollToBottom}
                            >
                                <ArrowDownIcon className="size-4" />
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
