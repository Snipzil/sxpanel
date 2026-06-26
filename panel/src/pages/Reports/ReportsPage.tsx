import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { useBackendApi } from '@/hooks/fetch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageToolbar } from '@/components/responsive/PageToolbar';
import { useLocale } from '@/hooks/locale';
import { AlertTriangleIcon, ArchiveIcon, InboxIcon, Loader2Icon, SearchIcon } from 'lucide-react';
import type { ApiGetTicketListResp, TicketStatus } from '@shared/ticketApiTypes';
import TicketDetailModal from '@/pages/Reports/TicketDetailModal';
import { ReportsHeaderBand } from './ReportsHeaderBand';
import { TicketRow } from './TicketRow';

type ReportsViewState = {
    searchQuery: string;
    categoryFilter: string;
    statusFilter: string;
    priorityFilter: string;
    showArchived: boolean;
    selectedTicketId: string | null;
};

/**
 * Reports V2 — redesign goals over V1:
 * - V2 header band with status stat pills (open / in review / resolved /
 *   archived) replacing the loose badges inside PageHeader.
 * - Token-based priority chips instead of raw text-green-400/red-500.
 * - Structured loading/error/empty states (icon tiles, retry button).
 * - Ticket rows wrap gracefully on narrow viewports.
 */
export default function ReportsPage() {
    const { t } = useLocale();
    const [viewState, setViewState] = useState<ReportsViewState>({
        searchQuery: '',
        categoryFilter: 'all',
        statusFilter: 'all',
        priorityFilter: 'all',
        showArchived: false,
        selectedTicketId: null,
    });
    const { searchQuery, categoryFilter, statusFilter, priorityFilter, showArchived, selectedTicketId } = viewState;

    const setViewField = <K extends keyof ReportsViewState>(key: K, value: ReportsViewState[K]) => {
        setViewState((prev) => ({ ...prev, [key]: value }));
    };

    useEffect(() => {
        const pageUrl = new URL(window.location.toString());
        const ticketId = pageUrl.searchParams.get('ticket');
        if (!ticketId?.length) return;

        setViewField('selectedTicketId', ticketId);

        // Consume deep-link param after opening so refresh/back doesn't keep reopening.
        pageUrl.searchParams.delete('ticket');
        window.history.replaceState({}, '', pageUrl);
    }, []);

    const listApi = useBackendApi<ApiGetTicketListResp>({
        method: 'GET',
        path: '/reports/list',
        throwGenericErrors: true,
    });

    const ticketsSwr = useSWR(
        '/reports/list',
        async () => {
            const data = await listApi({});
            if (!data) throw new Error('Failed to load tickets: no data received');
            if ('error' in data) throw new Error(`Failed to load tickets: ${data.error}`);
            return data.tickets;
        },
        { dedupingInterval: 5_000 },
    );

    const tickets = ticketsSwr.data ?? [];

    // Gather unique categories from loaded tickets for the filter dropdown
    const knownCategories = Array.from(new Set(tickets.map((t) => t.category)));

    const baseFilteredTickets = tickets.filter((t) => {
        if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
        if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (
                t.id.toLowerCase().includes(q) ||
                t.reporterName.toLowerCase().includes(q) ||
                t.descriptionPreview.toLowerCase().includes(q) ||
                t.targetNames.some((n) => n.toLowerCase().includes(q)) ||
                (t.claimedBy?.toLowerCase().includes(q) ?? false)
            );
        }
        return true;
    });

    const archivedTickets = baseFilteredTickets.filter((ticket) => ticket.status === 'closed');
    const showArchivedSection = showArchived;
    const activeTickets = showArchivedSection
        ? []
        : baseFilteredTickets.filter((ticket) => {
              if (ticket.status === 'closed') return false;
              if (statusFilter === 'all') return true;
              return ticket.status === statusFilter;
          });
    const hasVisibleTickets = showArchivedSection ? archivedTickets.length > 0 : activeTickets.length > 0;

    const formatDate = (ts: number) => {
        const d = new Date(ts * 1000);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const headerStats = ticketsSwr.data
        ? {
              open: tickets.filter((t) => t.status === 'open').length,
              inReview: tickets.filter((t) => t.status === 'inReview').length,
              resolved: tickets.filter((t) => t.status === 'resolved').length,
              archived: tickets.filter((t) => t.status === 'closed').length,
          }
        : undefined;

    const statusLabel = (status: TicketStatus) => {
        const keys: Record<TicketStatus, string> = {
            open: 'panel.reports.status.open',
            inReview: 'panel.reports.status.in_review',
            resolved: 'panel.reports.status.resolved',
            closed: 'panel.reports.status.closed',
        };
        return t(keys[status]);
    };

    return (
        <div className="h-contentvh flex w-full min-w-96 flex-col">
            <ReportsHeaderBand
                title={t('panel.routes.reports')}
                stats={headerStats}
                isRefreshing={ticketsSwr.isLoading || ticketsSwr.isValidating}
                onRefresh={() => ticketsSwr.mutate()}
                refreshLabel={t('panel.reports.page.refresh')}
                analyticsLabel={t('panel.reports.page.analytics_button')}
            />

            <div className="bg-card border-border/60 flex w-full flex-1 flex-col overflow-hidden rounded-xl border shadow-sm">
                {/* Filters */}
                <PageToolbar className="border-border/40 shrink-0 border-b p-3">
                    <div className="relative min-w-0 flex-1 basis-full sm:basis-[12rem]">
                        <SearchIcon className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
                        <Input
                            placeholder={t('panel.reports.page.search_placeholder')}
                            value={searchQuery}
                            onChange={(e) => setViewField('searchQuery', e.target.value)}
                            className="pl-8"
                            aria-label={t('panel.reports.page.search_placeholder')}
                        />
                    </div>
                    <Select value={statusFilter} onValueChange={(value) => setViewField('statusFilter', value)}>
                        <SelectTrigger
                            className="w-full min-w-[8.75rem] basis-[8.75rem] sm:w-auto"
                            aria-label={t('panel.reports.page.status_placeholder')}
                        >
                            <SelectValue placeholder={t('panel.reports.page.status_placeholder')} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('panel.reports.page.all_status')}</SelectItem>
                            <SelectItem value="open">{t('panel.reports.status.open')}</SelectItem>
                            <SelectItem value="inReview">{t('panel.reports.status.in_review')}</SelectItem>
                            <SelectItem value="resolved">{t('panel.reports.status.resolved')}</SelectItem>
                        </SelectContent>
                    </Select>
                    {knownCategories.length > 0 && (
                        <Select value={categoryFilter} onValueChange={(value) => setViewField('categoryFilter', value)}>
                            <SelectTrigger
                                className="w-full min-w-[10rem] basis-[10rem] sm:w-auto"
                                aria-label={t('panel.reports.page.category_placeholder')}
                            >
                                <SelectValue placeholder={t('panel.reports.page.category_placeholder')} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{t('panel.reports.page.all_categories')}</SelectItem>
                                {knownCategories.map((cat) => (
                                    <SelectItem key={cat} value={cat}>
                                        {cat}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                    <Select value={priorityFilter} onValueChange={(value) => setViewField('priorityFilter', value)}>
                        <SelectTrigger
                            className="w-full min-w-[8.75rem] basis-[8.75rem] sm:w-auto"
                            aria-label={t('panel.reports.page.priority_placeholder')}
                        >
                            <SelectValue placeholder={t('panel.reports.page.priority_placeholder')} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('panel.reports.page.all_priorities')}</SelectItem>
                            <SelectItem value="low">{t('panel.reports.priority.low')}</SelectItem>
                            <SelectItem value="medium">{t('panel.reports.priority.medium')}</SelectItem>
                            <SelectItem value="high">{t('panel.reports.priority.high')}</SelectItem>
                            <SelectItem value="critical">{t('panel.reports.priority.critical')}</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button
                        type="button"
                        variant={showArchivedSection ? 'outline-solid' : 'outline'}
                        onClick={() => setViewState((prev) => ({ ...prev, showArchived: !prev.showArchived }))}
                        className="shrink-0"
                        aria-pressed={showArchivedSection}
                    >
                        <ArchiveIcon className="mr-2 size-4" />
                        {t('panel.reports.page.archived')}
                        <Badge variant={showArchivedSection ? 'secondary' : 'outline-solid'} className="ml-2">
                            {archivedTickets.length}
                        </Badge>
                    </Button>
                </PageToolbar>

                {/* Ticket list */}
                <div className="flex-1 overflow-auto">
                    {ticketsSwr.isLoading ? (
                        <div className="text-muted-foreground flex flex-col items-center justify-center gap-3 py-16">
                            <Loader2Icon className="size-6 animate-spin" />
                            <p className="text-sm">Loading tickets…</p>
                        </div>
                    ) : ticketsSwr.error ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-16" role="alert">
                            <div className="bg-destructive/10 flex size-12 items-center justify-center rounded-xl">
                                <AlertTriangleIcon className="text-destructive-inline size-6" />
                            </div>
                            <p className="text-destructive-inline text-sm font-medium">
                                {t('panel.reports.page.route_unavailable')}
                            </p>
                            <Button variant="outline" size="sm" onClick={() => ticketsSwr.mutate()}>
                                Try again
                            </Button>
                        </div>
                    ) : !hasVisibleTickets ? (
                        <div className="text-muted-foreground flex flex-col items-center justify-center gap-3 py-16">
                            <div className="bg-muted flex size-12 items-center justify-center rounded-xl">
                                <InboxIcon className="size-6" />
                            </div>
                            <p className="text-sm font-medium">
                                {tickets.length === 0
                                    ? t('panel.reports.page.no_tickets')
                                    : t('panel.reports.page.no_matches')}
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3 p-3">
                            {activeTickets.length > 0 && (
                                <div className="flex flex-col gap-2">
                                    {activeTickets.map((ticket) => (
                                        <TicketRow
                                            key={ticket.id}
                                            ticket={ticket}
                                            formatDate={formatDate}
                                            statusLabel={statusLabel(ticket.status)}
                                            onClick={() => setViewField('selectedTicketId', ticket.id)}
                                        />
                                    ))}
                                </div>
                            )}

                            {showArchivedSection && archivedTickets.length > 0 && (
                                <div className="border-border/40 border-t pt-3">
                                    <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium">
                                        <ArchiveIcon className="size-4" />
                                        {t('panel.reports.page.archived_section')}
                                        <Badge variant="outline-solid" className="ml-1">
                                            {archivedTickets.length}
                                        </Badge>
                                    </div>

                                    <div className="mt-2 flex flex-col gap-2">
                                        {archivedTickets.map((ticket) => (
                                            <TicketRow
                                                key={ticket.id}
                                                ticket={ticket}
                                                formatDate={formatDate}
                                                statusLabel={statusLabel(ticket.status)}
                                                onClick={() => setViewField('selectedTicketId', ticket.id)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Detail modal */}
            {selectedTicketId && (
                <TicketDetailModal
                    ticketId={selectedTicketId}
                    open
                    onOpenChange={(open) => {
                        if (!open) {
                            setViewField('selectedTicketId', null);
                            ticketsSwr.mutate();
                        }
                    }}
                />
            )}
        </div>
    );
}
