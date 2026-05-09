import { useBackendApi } from '@/hooks/fetch';
import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    AlertTriangleIcon,
    BarChart3Icon,
    CheckCircle2Icon,
    ClockIcon,
    InboxIcon,
    Loader2Icon,
    MessageSquareIcon,
    SearchIcon,
    TagIcon,
    TrendingUpIcon,
    TrophyIcon,
    XCircleIcon,
} from 'lucide-react';
import type { ApiGetAnalyticsResp } from '@shared/ticketApiTypes';
import { useSetPageTitle } from '@/hooks/pages';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/page-header';
import { useEffect } from 'react';

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
        <Card>
            <CardContent className="flex items-center gap-4 p-4">
                <div className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                    <Icon className={`h-5 w-5 ${iconClass ?? 'text-muted-foreground'}`} />
                </div>
                <div>
                    <p className="text-muted-foreground text-xs">{label}</p>
                    <p className="text-xl font-bold">{value}</p>
                </div>
            </CardContent>
        </Card>
    );
}

export default function AnalyticsPage() {
    const setPageTitle = useSetPageTitle();
    useEffect(() => {
        setPageTitle('Report Analytics');
    }, [setPageTitle]);

    const api = useBackendApi<ApiGetAnalyticsResp>({ method: 'GET', path: '/reports/analytics' });
    const { data, isLoading, error } = useSWR('/reports/analytics', () => api({}), {
        revalidateOnFocus: false,
        dedupingInterval: 60_000,
    });

    if (isLoading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2Icon className="text-muted-foreground h-6 w-6 animate-spin" />
            </div>
        );
    }
    if (error || !data || 'error' in data) {
        return (
            <div className="flex h-64 items-center justify-center">
                <p className="text-muted-foreground text-sm">
                    {data && 'error' in data ? data.error : 'Failed to load analytics.'}
                </p>
            </div>
        );
    }

    const { overview, byCategory, byPriority, timelineDays, leaderboard, staffMetrics, rollups } = data;

    const resolutionRate =
        overview.total > 0 ? Math.round(((overview.resolved + overview.closed) / overview.total) * 100) : 0;

    const statusRows = [
        { label: 'Open', count: overview.open, colorClass: 'bg-destructive' },
        { label: 'In Review', count: overview.inReview, colorClass: 'bg-warning' },
        { label: 'Resolved', count: overview.resolved, colorClass: 'bg-success' },
        { label: 'Closed', count: overview.closed, colorClass: 'bg-muted-foreground' },
    ];

    return (
        <div className="h-contentvh flex w-full flex-col">
            <PageHeader
                icon={<BarChart3Icon className="size-5" />}
                title="Report Analytics"
                parentName="Reports"
                parentLink="/reports"
            >
                <span className="text-muted-foreground text-sm">30d detail with 7d and 30d rollups</span>
            </PageHeader>

            <div className="min-h-0 flex-1 space-y-6 overflow-auto pb-4">
                <div className="space-y-3">
                    <div>
                        <h2 className="text-lg font-semibold">Ticket Queue</h2>
                        <p className="text-muted-foreground text-sm">Claim speed, staff response time, resolution health, and current queue mix.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                        <StatCard icon={InboxIcon} label="Total Tickets" value={overview.total} />
                        <StatCard icon={ClockIcon} label="Open" value={overview.open} iconClass="text-destructive" />
                        <StatCard icon={SearchIcon} label="In Review" value={overview.inReview} iconClass="text-warning" />
                        <StatCard icon={CheckCircle2Icon} label="Resolved" value={overview.resolved} iconClass="text-success" />
                        <StatCard icon={XCircleIcon} label="Closed" value={overview.closed} iconClass="text-muted-foreground" />
                        <StatCard icon={TrendingUpIcon} label="Resolution Rate" value={`${resolutionRate}%`} iconClass="text-success" />
                    </div>

                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Queue Rollup · 7 Days</CardTitle>
                            </CardHeader>
                            <CardContent className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <p className="text-muted-foreground text-xs">Tickets Created</p>
                                    <p className="text-xl font-semibold">{rollups['7d'].ticketsCreated}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground text-xs">Tickets Resolved</p>
                                    <p className="text-xl font-semibold">{rollups['7d'].ticketsResolved}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground text-xs">Resolution Rate</p>
                                    <p className="text-xl font-semibold">{rollups['7d'].resolutionRate}%</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground text-xs">Reopen Rate</p>
                                    <p className="text-xl font-semibold">{rollups['7d'].reopenRate}%</p>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Queue Rollup · 30 Days</CardTitle>
                            </CardHeader>
                            <CardContent className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <p className="text-muted-foreground text-xs">Tickets Created</p>
                                    <p className="text-xl font-semibold">{rollups['30d'].ticketsCreated}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground text-xs">Tickets Resolved</p>
                                    <p className="text-xl font-semibold">{rollups['30d'].ticketsResolved}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground text-xs">Resolution Rate</p>
                                    <p className="text-xl font-semibold">{rollups['30d'].resolutionRate}%</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground text-xs">Reopen Rate</p>
                                    <p className="text-xl font-semibold">{rollups['30d'].reopenRate}%</p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                        <StatCard icon={ClockIcon} label="Avg Time To Claim" value={msToHuman(staffMetrics.avgTimeToClaimMs)} />
                        <StatCard icon={MessageSquareIcon} label="Avg First Response" value={msToHuman(staffMetrics.avgFirstStaffResponseMs)} iconClass="text-accent" />
                        <StatCard icon={TrendingUpIcon} label="Avg Resolution" value={msToHuman(staffMetrics.avgResolutionMs)} iconClass="text-success" />
                        <StatCard icon={AlertTriangleIcon} label="Reopen Rate" value={`${staffMetrics.reopenRate}%`} iconClass="text-warning" />
                    </div>

                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Daily Activity (Last 14 Days)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="overflow-hidden rounded-lg border">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-secondary/30">
                                                <th className="px-3 py-2 text-left font-medium">Date</th>
                                                <th className="px-3 py-2 text-right font-medium">Created</th>
                                                <th className="px-3 py-2 text-right font-medium">Resolved</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {timelineDays.slice(-14).map((day, i) => (
                                                <tr key={day.date} className={i % 2 === 0 ? '' : 'bg-secondary/10'}>
                                                    <td className="text-muted-foreground px-3 py-1.5">{day.date}</td>
                                                    <td className="px-3 py-1.5 text-right">{day.created}</td>
                                                    <td className="text-success px-3 py-1.5 text-right">{day.resolved}</td>
                                                </tr>
                                            ))}
                                            {timelineDays.length === 0 && (
                                                <tr>
                                                    <td colSpan={3} className="text-muted-foreground px-3 py-4 text-center">
                                                        No data
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>

                        <div className="space-y-6">
                            {byCategory.length > 0 && (
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="flex items-center gap-2 text-base">
                                            <TagIcon className="h-4 w-4" /> By Category
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-2">
                                            {byCategory.map((row) => {
                                                const pct =
                                                    staffMetrics.ticketsCreated > 0
                                                        ? Math.round((row.count / staffMetrics.ticketsCreated) * 100)
                                                        : 0;
                                                return (
                                                    <div key={row.category}>
                                                        <div className="mb-1 flex justify-between text-sm">
                                                            <span>{row.category}</span>
                                                            <span className="text-muted-foreground">
                                                                {row.count} ({pct}%)
                                                            </span>
                                                        </div>
                                                        <div className="bg-secondary/30 h-1.5 rounded-full">
                                                            <div className="bg-accent h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                            {byPriority.length > 0 && (
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-base">By Priority</CardTitle>
                                    </CardHeader>
                                    <CardContent className="flex flex-wrap gap-2">
                                        {byPriority.map((row) => (
                                            <div
                                                key={row.priority}
                                                className="bg-secondary/20 border-border/40 flex flex-1 flex-col items-center rounded-lg border p-3"
                                            >
                                                <span className="text-muted-foreground text-xs capitalize">{row.priority}</span>
                                                <span className="text-lg font-bold">{row.count}</span>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                            )}
                        </div>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <TrendingUpIcon className="h-4 w-4" /> Staff Metrics
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div className="bg-secondary/20 rounded-lg border p-3">
                                        <p className="text-muted-foreground text-xs">Tickets Claimed</p>
                                        <p className="text-xl font-semibold">{staffMetrics.claimedTickets}</p>
                                    </div>
                                    <div className="bg-secondary/20 rounded-lg border p-3">
                                        <p className="text-muted-foreground text-xs">Tickets Responded</p>
                                        <p className="text-xl font-semibold">{staffMetrics.respondedTickets}</p>
                                    </div>
                                    <div className="bg-secondary/20 rounded-lg border p-3">
                                        <p className="text-muted-foreground text-xs">Resolved Tickets</p>
                                        <p className="text-xl font-semibold">{staffMetrics.resolvedTickets}</p>
                                    </div>
                                    <div className="bg-secondary/20 rounded-lg border p-3">
                                        <p className="text-muted-foreground text-xs">Reopened Tickets</p>
                                        <p className="text-xl font-semibold">{staffMetrics.reopenedTickets}</p>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {statusRows.map((row) => {
                                        const pct = overview.total > 0 ? Math.round((row.count / overview.total) * 100) : 0;
                                        return (
                                            <div key={row.label}>
                                                <div className="mb-1 flex items-center justify-between text-sm">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className={`inline-block h-2 w-2 rounded-full ${row.colorClass}`} />
                                                        <span>{row.label}</span>
                                                    </div>
                                                    <span className="text-muted-foreground">
                                                        {row.count} ({pct}%)
                                                    </span>
                                                </div>
                                                <div className="bg-secondary/30 h-2 rounded-full">
                                                    <div className={`${row.colorClass} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {leaderboard.length > 0 && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <TrophyIcon className="h-4 w-4" /> Staff Leaderboard (Last 30 Days)
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="overflow-hidden rounded-lg border">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-secondary/30">
                                                <th className="px-3 py-2 text-left font-medium">#</th>
                                                <th className="px-3 py-2 text-left font-medium">Admin</th>
                                                <th className="px-3 py-2 text-right font-medium">Resolved</th>
                                                <th className="px-3 py-2 text-right font-medium">Avg Resolution</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {leaderboard.map((row, i) => (
                                                <tr key={`${row.adminName}-${i}`} className={i % 2 === 0 ? '' : 'bg-secondary/10'}>
                                                    <td className="text-muted-foreground px-3 py-2">
                                                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                                                    </td>
                                                    <td className="px-3 py-2 font-medium">{row.adminName}</td>
                                                    <td className="px-3 py-2 text-right">
                                                        <Badge variant="secondary">{row.resolved}</Badge>
                                                    </td>
                                                    <td className="text-muted-foreground px-3 py-2 text-right">{msToHuman(row.avgResolutionMs)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
