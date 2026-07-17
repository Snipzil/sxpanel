import { useBackendApi } from '@/hooks/fetch';
import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    AlertTriangleIcon,
    ArrowLeftIcon,
    BarChart3Icon,
    CheckCircle2Icon,
    ClockIcon,
    InboxIcon,
    Loader2Icon,
    MessageSquareIcon,
    RotateCwIcon,
    SearchIcon,
    TagIcon,
    TrendingUpIcon,
    TrophyIcon,
    XCircleIcon,
} from 'lucide-react';
import type { ApiGetAnalyticsResp, TicketAnalyticsSummary } from '@shared/ticketApiTypes';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLocale } from '@/hooks/locale';
import { cn } from '@/lib/utils';
import { navigate } from 'wouter/use-browser-location';

function msToHuman(ms: number) {
    if (!Number.isFinite(ms)) return '—';
    if (!ms || ms <= 0) return '—';
    const minutes = Math.round(ms / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
}

function StatCard({
    icon: Icon,
    label,
    value,
    iconClass,
}: {
    icon: React.ElementType;
    label: string;
    value: string | number;
    iconClass?: string;
}) {
    return (
        <div className="border-border/60 bg-background flex items-center gap-3 rounded-xl border p-4">
            <div className="bg-secondary/50 flex size-10 shrink-0 items-center justify-center rounded-lg">
                <Icon className={cn('size-5', iconClass ?? 'text-muted-foreground')} />
            </div>
            <div className="min-w-0">
                <p className="text-muted-foreground/70 truncate text-[11px] font-semibold tracking-wider uppercase">
                    {label}
                </p>
                <p className="text-foreground text-xl font-bold tabular-nums">{value}</p>
            </div>
        </div>
    );
}

function MetricTile({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="border-border/50 bg-secondary/40 rounded-lg border p-3">
            <p className="text-muted-foreground/70 text-[11px] font-semibold tracking-wider uppercase">{label}</p>
            <p className="text-foreground mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
        </div>
    );
}

function ProgressBar({
    pct,
    label,
    barClass,
    heightClass = 'h-1.5',
}: {
    pct: number;
    label: string;
    barClass: string;
    heightClass?: string;
}) {
    return (
        <div
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={label}
            className={cn('bg-muted/40 overflow-hidden rounded-full', heightClass)}
        >
            <div className={cn('h-full rounded-full transition-all', barClass)} style={{ width: `${pct}%` }} />
        </div>
    );
}

const RANK_CHIP_CLASSES = [
    'border-warning/40 bg-warning/15 text-warning-inline',
    'border-border bg-muted/60 text-foreground',
    'border-border/60 bg-muted/30 text-muted-foreground',
] as const;

function RankChip({ rank }: { rank: number }) {
    const accent = RANK_CHIP_CLASSES[rank - 1];
    return (
        <span
            className={cn(
                'inline-flex size-6 items-center justify-center rounded-full border text-[11px] font-bold tabular-nums',
                accent ?? 'text-muted-foreground border-transparent',
            )}
        >
            {rank}
        </span>
    );
}

function StaffLeaderboard({ leaderboard }: { leaderboard: TicketAnalyticsSummary['leaderboard'] }) {
    const { t } = useLocale();
    if (leaderboard.length === 0) return null;

    return (
        <Card className="border-border/60 bg-background rounded-xl shadow-none">
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                    <TrophyIcon className="text-warning-inline size-4" />
                    {t('panel.reports.analytics.leaderboard_title')}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="border-border/60 overflow-hidden rounded-lg border">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-muted/30">
                                <th
                                    scope="col"
                                    className="text-muted-foreground px-3 py-2 text-left text-xs font-semibold tracking-wider uppercase"
                                >
                                    #
                                </th>
                                <th
                                    scope="col"
                                    className="text-muted-foreground px-3 py-2 text-left text-xs font-semibold tracking-wider uppercase"
                                >
                                    {t('panel.reports.analytics.col_admin')}
                                </th>
                                <th
                                    scope="col"
                                    className="text-muted-foreground px-3 py-2 text-right text-xs font-semibold tracking-wider uppercase"
                                >
                                    {t('panel.reports.status.resolved')}
                                </th>
                                <th
                                    scope="col"
                                    className="text-muted-foreground px-3 py-2 text-right text-xs font-semibold tracking-wider uppercase"
                                >
                                    {t('panel.reports.analytics.col_avg_resolution')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {leaderboard.map((row, i) => (
                                <tr
                                    key={`${row.adminName}-${row.resolved}-${row.avgResolutionMs}`}
                                    className={cn('border-border/40 border-t', i % 2 === 1 && 'bg-muted/10')}
                                >
                                    <td className="px-3 py-2">
                                        <RankChip rank={i + 1} />
                                    </td>
                                    <td className="text-foreground px-3 py-2 font-medium">{row.adminName}</td>
                                    <td className="px-3 py-2 text-right">
                                        <Badge variant="secondary" className="tabular-nums">
                                            {row.resolved}
                                        </Badge>
                                    </td>
                                    <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                                        {msToHuman(row.avgResolutionMs)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    );
}

function RollupCard({
    title,
    rollup,
}: {
    title: string;
    rollup: { ticketsCreated: number; ticketsResolved: number; resolutionRate: number; reopenRate: number };
}) {
    const { t } = useLocale();
    return (
        <Card className="border-border/60 bg-background rounded-xl shadow-none">
            <CardHeader className="pb-2">
                <CardTitle className="text-base">{title}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
                <MetricTile label={t('panel.reports.analytics.tickets_created')} value={rollup.ticketsCreated} />
                <MetricTile label={t('panel.reports.analytics.tickets_resolved')} value={rollup.ticketsResolved} />
                <MetricTile label={t('panel.reports.analytics.resolution_rate')} value={`${rollup.resolutionRate}%`} />
                <MetricTile label={t('panel.reports.analytics.reopen_rate')} value={`${rollup.reopenRate}%`} />
            </CardContent>
        </Card>
    );
}

/**
 * V2 redesign of the report analytics page — header band with summary
 * pills, token-based stat cards and rank chips (no emoji medals),
 * accessible progress bars, and structured loading/error states.
 */
export default function AnalyticsPage() {
    const { t } = useLocale();
    const api = useBackendApi<ApiGetAnalyticsResp>({ method: 'GET', path: '/reports/analytics' });
    const { data, isLoading, error, mutate, isValidating } = useSWR('/reports/analytics', () => api({}), {
        revalidateOnFocus: false,
        dedupingInterval: 60_000,
    });

    const hasError = Boolean(error) || (data !== undefined && (!data || 'error' in data));
    const summary = data && !('error' in data) ? data : undefined;
    const resolutionRate =
        summary && summary.overview.total > 0
            ? Math.round(((summary.overview.resolved + summary.overview.closed) / summary.overview.total) * 100)
            : 0;

    return (
        <div className="h-contentvh flex w-full flex-col">
            {/* Header band */}
            <div className="border-border/60 bg-background mb-4 shrink-0 rounded-xl border">
                <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="bg-secondary/50 text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-xl">
                            <BarChart3Icon className="size-5" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-foreground text-lg font-semibold tracking-tight">
                                {t('panel.routes.report_analytics')}
                            </h1>
                            <p className="text-muted-foreground mt-0.5 text-xs">
                                {t('panel.reports.analytics.header_subtitle')}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="border-border/50 bg-secondary/40 inline-flex items-center gap-2 rounded-full border px-3 py-1.5">
                            <InboxIcon className="text-muted-foreground size-3.5 shrink-0" />
                            <span className="text-muted-foreground/70 text-[11px] font-semibold tracking-wider uppercase">
                                {t('panel.reports.analytics.total_tickets')}
                            </span>
                            <span className="text-foreground text-sm font-semibold tabular-nums">
                                {summary ? summary.overview.total.toLocaleString() : '—'}
                            </span>
                        </div>
                        <div
                            className={cn(
                                'inline-flex items-center gap-2 rounded-full border px-3 py-1.5',
                                summary && resolutionRate >= 50
                                    ? 'border-success/40 bg-success/10'
                                    : 'border-border/50 bg-secondary/40',
                            )}
                        >
                            <TrendingUpIcon
                                className={cn(
                                    'size-3.5 shrink-0',
                                    summary && resolutionRate >= 50 ? 'text-success-inline' : 'text-muted-foreground',
                                )}
                            />
                            <span className="text-muted-foreground/70 text-[11px] font-semibold tracking-wider uppercase">
                                {t('panel.reports.analytics.resolution_rate')}
                            </span>
                            <span className="text-foreground text-sm font-semibold tabular-nums">
                                {summary ? `${resolutionRate}%` : '—'}
                            </span>
                        </div>
                        <div className="bg-border/60 mx-1 hidden h-6 w-px sm:block" aria-hidden="true" />
                        <Button variant="outline" size="sm" onClick={() => navigate('/reports')}>
                            <ArrowLeftIcon className="mr-1.5 size-4" />
                            {t('panel.reports.analytics.parent_name')}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => mutate()}
                            disabled={isValidating}
                            aria-label="Refresh analytics"
                        >
                            {isValidating ? (
                                <Loader2Icon className="size-4 animate-spin" />
                            ) : (
                                <RotateCwIcon className="size-4" />
                            )}
                        </Button>
                    </div>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto pb-4">
                {isLoading ? (
                    <div className="border-border/60 bg-background flex h-64 flex-col items-center justify-center gap-3 rounded-xl border">
                        <Loader2Icon className="text-muted-foreground size-6 animate-spin" />
                        <p className="text-muted-foreground text-sm">Loading analytics…</p>
                    </div>
                ) : hasError || !summary ? (
                    <div className="border-destructive/30 bg-destructive/5 flex h-64 flex-col items-center justify-center gap-3 rounded-xl border">
                        <AlertTriangleIcon className="text-destructive-inline size-6" />
                        <p className="text-foreground text-sm font-medium">
                            {data && 'error' in data ? data.error : t('panel.reports.analytics.load_failed')}
                        </p>
                        <Button variant="outline" size="sm" onClick={() => mutate()}>
                            <RotateCwIcon className="mr-1.5 size-4" />
                            Retry
                        </Button>
                    </div>
                ) : (
                    <AnalyticsContent summary={summary} />
                )}
            </div>
        </div>
    );
}

function SectionHeading({ title, desc }: { title: string; desc: string }) {
    return (
        <div>
            <h2 className="text-foreground text-base font-semibold tracking-tight">{title}</h2>
            <p className="text-muted-foreground text-sm">{desc}</p>
        </div>
    );
}

function AnalyticsContent({ summary }: { summary: TicketAnalyticsSummary }) {
    const { t } = useLocale();
    const { overview, byCategory, byPriority, timelineDays, leaderboard, staffMetrics, rollups } = summary;

    const statusRows = [
        {
            label: t('panel.reports.status.open'),
            count: overview.open,
            dotClass: 'bg-destructive',
            barClass: 'bg-destructive',
        },
        {
            label: t('panel.reports.status.in_review'),
            count: overview.inReview,
            dotClass: 'bg-warning',
            barClass: 'bg-warning',
        },
        {
            label: t('panel.reports.status.resolved'),
            count: overview.resolved,
            dotClass: 'bg-success',
            barClass: 'bg-success',
        },
        {
            label: t('panel.reports.status.closed'),
            count: overview.closed,
            dotClass: 'bg-muted-foreground',
            barClass: 'bg-muted-foreground',
        },
    ];

    const hasBreakdown = byCategory.length > 0 || byPriority.length > 0;

    return (
        <div className="space-y-8">
            <section aria-label={t('panel.reports.analytics.ticket_queue_title')} className="space-y-3">
                <SectionHeading
                    title={t('panel.reports.analytics.ticket_queue_title')}
                    desc={t('panel.reports.analytics.ticket_queue_desc')}
                />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard
                        icon={ClockIcon}
                        label={t('panel.reports.status.open')}
                        value={overview.open}
                        iconClass="text-destructive-inline"
                    />
                    <StatCard
                        icon={SearchIcon}
                        label={t('panel.reports.status.in_review')}
                        value={overview.inReview}
                        iconClass="text-warning-inline"
                    />
                    <StatCard
                        icon={CheckCircle2Icon}
                        label={t('panel.reports.status.resolved')}
                        value={overview.resolved}
                        iconClass="text-success-inline"
                    />
                    <StatCard
                        icon={XCircleIcon}
                        label={t('panel.reports.status.closed')}
                        value={overview.closed}
                        iconClass="text-muted-foreground"
                    />
                </div>
            </section>

            <section aria-label={t('panel.reports.analytics.recent_activity_title')} className="space-y-3">
                <SectionHeading
                    title={t('panel.reports.analytics.recent_activity_title')}
                    desc={t('panel.reports.analytics.recent_activity_desc')}
                />
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <RollupCard title={t('panel.reports.analytics.rollup_7d')} rollup={rollups['7d']} />
                    <RollupCard title={t('panel.reports.analytics.rollup_30d')} rollup={rollups['30d']} />
                </div>

                <Card className="border-border/60 bg-background rounded-xl shadow-none">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">{t('panel.reports.analytics.daily_activity')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="border-border/60 overflow-hidden rounded-lg border">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-muted/30">
                                        <th
                                            scope="col"
                                            className="text-muted-foreground px-3 py-2 text-left text-xs font-semibold tracking-wider uppercase"
                                        >
                                            {t('panel.reports.analytics.col_date')}
                                        </th>
                                        <th
                                            scope="col"
                                            className="text-muted-foreground px-3 py-2 text-right text-xs font-semibold tracking-wider uppercase"
                                        >
                                            {t('panel.reports.analytics.col_created')}
                                        </th>
                                        <th
                                            scope="col"
                                            className="text-muted-foreground px-3 py-2 text-right text-xs font-semibold tracking-wider uppercase"
                                        >
                                            {t('panel.reports.analytics.col_resolved')}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {timelineDays.slice(-14).map((day, i) => (
                                        <tr
                                            key={day.date}
                                            className={cn('border-border/40 border-t', i % 2 === 1 && 'bg-muted/10')}
                                        >
                                            <td className="text-muted-foreground px-3 py-1.5 tabular-nums">
                                                {day.date}
                                            </td>
                                            <td className="px-3 py-1.5 text-right tabular-nums">{day.created}</td>
                                            <td className="text-success-inline px-3 py-1.5 text-right tabular-nums">
                                                {day.resolved}
                                            </td>
                                        </tr>
                                    ))}
                                    {timelineDays.length === 0 && (
                                        <tr>
                                            <td colSpan={3} className="text-muted-foreground px-3 py-4 text-center">
                                                {t('panel.reports.analytics.no_data')}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </section>

            <section aria-label={t('panel.reports.analytics.staff_performance_title')} className="space-y-3">
                <SectionHeading
                    title={t('panel.reports.analytics.staff_performance_title')}
                    desc={t('panel.reports.analytics.staff_performance_desc')}
                />
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                    <StatCard
                        icon={ClockIcon}
                        label={t('panel.reports.analytics.avg_time_to_claim')}
                        value={msToHuman(staffMetrics.avgTimeToClaimMs)}
                    />
                    <StatCard
                        icon={MessageSquareIcon}
                        label={t('panel.reports.analytics.avg_first_response')}
                        value={msToHuman(staffMetrics.avgFirstStaffResponseMs)}
                        iconClass="text-info-inline"
                    />
                    <StatCard
                        icon={TrendingUpIcon}
                        label={t('panel.reports.analytics.avg_resolution')}
                        value={msToHuman(staffMetrics.avgResolutionMs)}
                        iconClass="text-success-inline"
                    />
                    <StatCard
                        icon={AlertTriangleIcon}
                        label={t('panel.reports.analytics.reopen_rate')}
                        value={`${staffMetrics.reopenRate}%`}
                        iconClass="text-warning-inline"
                    />
                </div>

                <div className={cn('grid grid-cols-1 gap-4', leaderboard.length > 0 && 'lg:grid-cols-2')}>
                    <Card className="border-border/60 bg-background rounded-xl shadow-none">
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <TrendingUpIcon className="text-muted-foreground size-4" />
                                {t('panel.reports.analytics.staff_metrics')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <MetricTile
                                    label={t('panel.reports.analytics.tickets_claimed')}
                                    value={staffMetrics.claimedTickets}
                                />
                                <MetricTile
                                    label={t('panel.reports.analytics.tickets_responded')}
                                    value={staffMetrics.respondedTickets}
                                />
                                <MetricTile
                                    label={t('panel.reports.analytics.resolved_tickets')}
                                    value={staffMetrics.resolvedTickets}
                                />
                                <MetricTile
                                    label={t('panel.reports.analytics.reopened_tickets')}
                                    value={staffMetrics.reopenedTickets}
                                />
                            </div>

                            <div className="space-y-3">
                                {statusRows.map((row) => {
                                    const pct = overview.total > 0 ? Math.round((row.count / overview.total) * 100) : 0;
                                    return (
                                        <div key={row.label}>
                                            <div className="mb-1 flex items-center justify-between text-sm">
                                                <div className="flex items-center gap-1.5">
                                                    <span
                                                        className={cn('inline-block size-2 rounded-full', row.dotClass)}
                                                        aria-hidden="true"
                                                    />
                                                    <span className="text-foreground">{row.label}</span>
                                                </div>
                                                <span className="text-muted-foreground tabular-nums">
                                                    {row.count} ({pct}%)
                                                </span>
                                            </div>
                                            <ProgressBar
                                                pct={pct}
                                                label={`${row.label}: ${pct}%`}
                                                barClass={row.barClass}
                                                heightClass="h-2"
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>

                    <StaffLeaderboard leaderboard={leaderboard} />
                </div>
            </section>

            {hasBreakdown && (
                <section aria-label={t('panel.reports.analytics.ticket_breakdown_title')} className="space-y-3">
                    <SectionHeading
                        title={t('panel.reports.analytics.ticket_breakdown_title')}
                        desc={t('panel.reports.analytics.ticket_breakdown_desc')}
                    />
                    <div
                        className={cn(
                            'grid grid-cols-1 gap-4',
                            byCategory.length > 0 && byPriority.length > 0 && 'lg:grid-cols-2',
                        )}
                    >
                        {byCategory.length > 0 && (
                            <Card className="border-border/60 bg-background rounded-xl shadow-none">
                                <CardHeader className="pb-2">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <TagIcon className="text-muted-foreground size-4" />
                                        {t('panel.reports.analytics.by_category')}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2.5">
                                        {byCategory.map((row) => {
                                            const pct =
                                                staffMetrics.ticketsCreated > 0
                                                    ? Math.round((row.count / staffMetrics.ticketsCreated) * 100)
                                                    : 0;
                                            return (
                                                <div key={row.category}>
                                                    <div className="mb-1 flex justify-between text-sm">
                                                        <span className="text-foreground truncate">{row.category}</span>
                                                        <span className="text-muted-foreground shrink-0 tabular-nums">
                                                            {row.count} ({pct}%)
                                                        </span>
                                                    </div>
                                                    <ProgressBar
                                                        pct={pct}
                                                        label={`${row.category}: ${pct}%`}
                                                        barClass="bg-primary"
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                        {byPriority.length > 0 && (
                            <Card className="border-border/60 bg-background rounded-xl shadow-none">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">
                                        {t('panel.reports.analytics.by_priority')}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="flex flex-wrap gap-2">
                                    {byPriority.map((row) => (
                                        <div
                                            key={row.priority}
                                            className="border-border/50 bg-secondary/40 flex flex-1 flex-col items-center rounded-lg border p-3"
                                        >
                                            <span className="text-muted-foreground/70 text-[11px] font-semibold tracking-wider uppercase">
                                                {row.priority}
                                            </span>
                                            <span className="text-foreground text-lg font-bold tabular-nums">
                                                {row.count}
                                            </span>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </section>
            )}
        </div>
    );
}
