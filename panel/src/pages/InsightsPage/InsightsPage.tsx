import { useBackendApi } from '@/hooks/fetch';
import useSWR from 'swr';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import {
    ActivityIcon,
    BarChart3Icon,
    ClockIcon,
    GavelIcon,
    Loader2Icon,
    ServerIcon,
    SignalIcon,
    TrendingUpIcon,
    UserPlusIcon,
    UsersIcon,
    WifiOffIcon,
    CrownIcon,
    LineChartIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type {
    InsightsPlayerCountResp,
    InsightsNewPlayersResp,
    InsightsTopPlayersResp,
    InsightsPlaytimeDistResp,
    InsightsRetentionResp,
    InsightsUptimeResp,
    InsightsDisconnectReasonsResp,
    InsightsPeakHoursResp,
    InsightsActionsTimelineResp,
    InsightsPlayerGrowthResp,
    InsightsSessionLengthResp,
    InsightsDailyPlayersResp,
} from '@shared/insightsApiTypes';
import { useOpenPlayerModal } from '@/hooks/playerModal';
import { cn } from '@/lib/utils';
import PlayerCountChart from './PlayerCountChart';
import NewPlayersChart from './NewPlayersChart';
import PlaytimeDistChart from './PlaytimeDistChart';
import UptimeTimeline from './UptimeTimeline';
import DisconnectReasonsChart from './DisconnectReasonsChart';
import PeakHoursHeatmap from './PeakHoursHeatmap';
import ActionsTimelineChart from './ActionsTimelineChart';
import PlayerGrowthChart from './PlayerGrowthChart';
import SessionLengthChart from './SessionLengthChart';
import DailyPlayersChart from './DailyPlayersChart';
import { getMockInsightsData } from './devMockInsights';
import { isDevMockStatusOptInEnabled } from '@/lib/devFlags';

// Lazy module-level cache so the (expensive) full mock dataset is generated
// only once per page load instead of every time a card's SWR loader fires.
let _cachedDevMockInsights: ReturnType<typeof getMockInsightsData> | null = null;
const getDevMockInsights = () => {
    if (!_cachedDevMockInsights) {
        _cachedDevMockInsights = getMockInsightsData();
    }
    return _cachedDevMockInsights;
};

if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        _cachedDevMockInsights = null;
    });
}

type DevMockInsights = ReturnType<typeof getMockInsightsData>;
type WithError = { error: string };

/**
 * Shared loader for Insights cards: wraps useBackendApi + useSWR + the dev-mock
 * fallback, and normalizes the result into { isLoading, hasError, errorMsg,
 * successData } so each card body can render the three branches uniformly.
 */
function useInsightData<T extends object>(path: string, devMockSelector: (mock: DevMockInsights) => T | WithError) {
    const api = useBackendApi<T | WithError>({ method: 'GET', path });
    const { data, error, isLoading } = useSWR<T | WithError>(
        path,
        async (): Promise<T | WithError> => {
            const isDevMockMode = import.meta.env.DEV && isDevMockStatusOptInEnabled();
            if (isDevMockMode) return devMockSelector(getDevMockInsights());
            const result = await api({});
            if (result === undefined) return { error: 'Request failed' } as WithError;
            return result;
        },
        { revalidateOnFocus: false, dedupingInterval: 60_000 },
    );
    const dataHasError = !!data && 'error' in data;
    const hasError = !!error || dataHasError;
    const errorMsg = hasError ? (dataHasError ? (data as WithError).error : 'Failed to load') : '';
    const successData: T | null = data && !dataHasError ? (data as T) : null;
    return { isLoading, hasError, errorMsg, successData };
}

// ──────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ──────────────────────────────────────────────────────────────────────────────

function CardLoading() {
    return (
        <div className="flex items-center justify-center py-12">
            <Loader2Icon className="text-muted-foreground h-6 w-6 animate-spin" />
        </div>
    );
}

function CardError({ message }: { message: string }) {
    return <div className="text-muted-foreground flex items-center justify-center py-12 text-sm">{message}</div>;
}

const formatPlayTime = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
};

type InsightsCardProps = {
    icon: ReactNode;
    title: string;
    subtitle?: string;
    action?: ReactNode;
    className?: string;
    children: ReactNode;
};

function InsightsCard({ icon, title, subtitle, action, className, children }: InsightsCardProps) {
    return (
        <Card className={cn('overflow-hidden', className)}>
            <div className="border-border/40 flex flex-col gap-2 border-b px-3 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-4">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="bg-secondary/40 border-border/50 text-accent/80 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border [&>svg]:size-4">
                        {icon}
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-sm leading-tight font-semibold tracking-tight">{title}</h3>
                        {subtitle ? (
                            <p className="text-muted-foreground/70 mt-0.5 truncate text-xs">{subtitle}</p>
                        ) : null}
                    </div>
                </div>
                {action ? (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-12 text-xs sm:ml-auto sm:shrink-0 sm:pl-0">
                        {action}
                    </div>
                ) : null}
            </div>
            <CardContent className="p-3 sm:p-4">{children}</CardContent>
        </Card>
    );
}

function SectionHeading({ icon, title, description }: { icon: ReactNode; title: string; description?: string }) {
    return (
        <div className="flex items-center gap-2.5 pt-2">
            <div className="bg-primary/60 h-7 w-0.5 shrink-0 rounded-full" />
            <div className="text-muted-foreground/80 [&>svg]:size-4">{icon}</div>
            <div>
                <h2 className="text-foreground/90 text-sm font-semibold tracking-wider uppercase">{title}</h2>
                {description ? <p className="text-muted-foreground/60 text-xs">{description}</p> : null}
            </div>
        </div>
    );
}

function HeadlinePill({ label, value }: { label: string; value: ReactNode }) {
    return (
        <span className="text-muted-foreground/70 text-sm font-normal">
            {label}: <span className="text-foreground font-semibold">{value}</span>
        </span>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// Chart cards
// ──────────────────────────────────────────────────────────────────────────────

function PlayerCountCard() {
    const { isLoading, hasError, errorMsg, successData } = useInsightData<Exclude<InsightsPlayerCountResp, WithError>>(
        '/insights/playerCount',
        (mock) => mock.playerCount,
    );
    return (
        <InsightsCard
            className="col-span-full"
            icon={<ActivityIcon />}
            title="Player Count & Memory"
            subtitle="Long-term population and host memory trend"
            action={successData ? <HeadlinePill label="Peak" value={`${successData.peakCount} players`} /> : null}
        >
            {isLoading ? (
                <CardLoading />
            ) : hasError ? (
                <CardError message={errorMsg} />
            ) : (
                <PlayerCountChart series={successData!.series} />
            )}
        </InsightsCard>
    );
}

function NewPlayersCard() {
    const { isLoading, hasError, errorMsg, successData } = useInsightData<Exclude<InsightsNewPlayersResp, WithError>>(
        '/insights/newPlayers',
        (mock) => mock.newPlayers,
    );
    return (
        <InsightsCard
            icon={<UserPlusIcon />}
            title="New Players Per Day"
            subtitle="First-seen players over time"
            action={
                successData ? <HeadlinePill label="Total" value={successData.totalPlayers.toLocaleString()} /> : null
            }
        >
            {isLoading ? (
                <CardLoading />
            ) : hasError ? (
                <CardError message={errorMsg} />
            ) : (
                <NewPlayersChart daily={successData!.daily} />
            )}
        </InsightsCard>
    );
}

function PlaytimeDistCard() {
    const { isLoading, hasError, errorMsg, successData } = useInsightData<Exclude<InsightsPlaytimeDistResp, WithError>>(
        '/insights/playtimeDist',
        (mock) => mock.playtimeDist,
    );
    return (
        <InsightsCard
            icon={<BarChart3Icon />}
            title="Playtime Distribution"
            subtitle="How much total time players accumulate"
            action={
                successData ? (
                    <>
                        <HeadlinePill label="Median" value={formatPlayTime(successData.medianMinutes)} />
                        <span className="text-muted-foreground/40">·</span>
                        <HeadlinePill label="Avg" value={formatPlayTime(successData.averageMinutes)} />
                    </>
                ) : null
            }
        >
            {isLoading ? (
                <CardLoading />
            ) : hasError ? (
                <CardError message={errorMsg} />
            ) : (
                <PlaytimeDistChart buckets={successData!.buckets} />
            )}
        </InsightsCard>
    );
}

function TopPlayersCard() {
    const { isLoading, hasError, errorMsg, successData } = useInsightData<Exclude<InsightsTopPlayersResp, WithError>>(
        '/insights/topPlayers',
        (mock) => mock.topPlayers,
    );
    const openPlayerModal = useOpenPlayerModal();
    return (
        <InsightsCard icon={<CrownIcon />} title="Top Players by Playtime" subtitle="All-time leaderboard">
            {isLoading ? (
                <CardLoading />
            ) : hasError ? (
                <CardError message={errorMsg} />
            ) : (
                <div className="max-h-84 space-y-0.5 overflow-y-auto pr-1">
                    {successData!.players.map((player, i) => (
                        <div
                            key={player.license}
                            className="hover:bg-secondary/30 flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors"
                        >
                            <span
                                className={cn(
                                    'w-6 shrink-0 text-right font-mono text-xs',
                                    i === 0
                                        ? 'text-warning font-bold'
                                        : i === 1
                                          ? 'text-muted-foreground font-semibold'
                                          : i === 2
                                            ? 'text-accent font-semibold'
                                            : 'text-muted-foreground/50',
                                )}
                            >
                                {i + 1}
                            </span>
                            <button
                                type="button"
                                onClick={() => openPlayerModal({ license: player.license })}
                                className="min-w-0 cursor-pointer truncate text-left hover:underline"
                            >
                                {player.displayName}
                            </button>
                            <span className="text-muted-foreground/70 ml-auto shrink-0 font-mono text-xs">
                                {formatPlayTime(player.playTime)}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </InsightsCard>
    );
}

function RetentionStat({ label, value }: { label: string; value: number }) {
    const color = value >= 50 ? 'text-success' : value >= 25 ? 'text-warning' : 'text-destructive';
    return (
        <div className="bg-secondary/20 border-border/40 rounded-lg border p-3 text-center">
            <div className={cn('text-2xl font-bold', color)}>{value}%</div>
            <div className="text-muted-foreground/70 mt-0.5 text-xs">{label}</div>
        </div>
    );
}

function RetentionCard() {
    const { isLoading, hasError, errorMsg, successData } = useInsightData<Exclude<InsightsRetentionResp, WithError>>(
        '/insights/retention',
        (mock) => mock.retention,
    );
    return (
        <InsightsCard
            icon={<TrendingUpIcon />}
            title="Player Retention"
            subtitle="Do players come back?"
            action={
                successData ? (
                    <HeadlinePill label="Sample" value={`${successData.sampleSize.toLocaleString()} players`} />
                ) : null
            }
        >
            {isLoading ? (
                <CardLoading />
            ) : hasError ? (
                <CardError message={errorMsg} />
            ) : (
                <div className="space-y-4">
                    <div>
                        <h4 className="text-muted-foreground mb-2 text-xs font-medium tracking-wider uppercase">
                            Return Rate (joined 30+ days ago)
                        </h4>
                        <div className="grid grid-cols-3 gap-2">
                            <RetentionStat label="After 1 day" value={successData!.returnRate1d} />
                            <RetentionStat label="After 7 days" value={successData!.returnRate7d} />
                            <RetentionStat label="After 30 days" value={successData!.returnRate30d} />
                        </div>
                    </div>
                    <div>
                        <h4 className="text-muted-foreground mb-2 text-xs font-medium tracking-wider uppercase">
                            Current Activity (all players)
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                            <RetentionStat label="Active last 7d" value={successData!.activeLast7d} />
                            <RetentionStat label="Active last 30d" value={successData!.activeLast30d} />
                        </div>
                    </div>
                </div>
            )}
        </InsightsCard>
    );
}

function UptimeCard() {
    const { isLoading, hasError, errorMsg, successData } = useInsightData<Exclude<InsightsUptimeResp, WithError>>(
        '/insights/uptimeTimeline',
        (mock) => mock.uptimeTimeline,
    );
    return (
        <InsightsCard
            className="col-span-full"
            icon={<ServerIcon />}
            title="Server Uptime Timeline"
            subtitle="Historical up / down segments"
        >
            {isLoading ? (
                <CardLoading />
            ) : hasError ? (
                <CardError message={errorMsg} />
            ) : (
                <UptimeTimeline segments={successData!.segments} />
            )}
        </InsightsCard>
    );
}

function DisconnectReasonsCard() {
    const { isLoading, hasError, errorMsg, successData } = useInsightData<
        Exclude<InsightsDisconnectReasonsResp, WithError>
    >('/insights/disconnectReasons', (mock) => mock.disconnectReasons);
    return (
        <InsightsCard
            icon={<WifiOffIcon />}
            title="Disconnect Reasons"
            subtitle="Last 14 days · logged disconnects"
            action={successData ? <HeadlinePill label="Total" value={successData.totalDrops.toLocaleString()} /> : null}
        >
            {isLoading ? (
                <CardLoading />
            ) : hasError ? (
                <CardError message={errorMsg} />
            ) : (
                <DisconnectReasonsChart categories={successData!.categories} />
            )}
        </InsightsCard>
    );
}

function PeakHoursCard() {
    const { isLoading, hasError, errorMsg, successData } = useInsightData<Exclude<InsightsPeakHoursResp, WithError>>(
        '/insights/peakHours',
        (mock) => mock.peakHours,
    );
    return (
        <InsightsCard icon={<SignalIcon />} title="Peak Hours" subtitle="Average players by weekday & hour">
            {isLoading ? (
                <CardLoading />
            ) : hasError ? (
                <CardError message={errorMsg} />
            ) : (
                <PeakHoursHeatmap cells={successData!.cells} maxAvg={successData!.maxAvg} />
            )}
        </InsightsCard>
    );
}

function ActionsTimelineCard() {
    const { isLoading, hasError, errorMsg, successData } = useInsightData<
        Exclude<InsightsActionsTimelineResp, WithError>
    >('/insights/actionsTimeline', (mock) => mock.actionsTimeline);
    return (
        <InsightsCard
            className="col-span-full"
            icon={<GavelIcon />}
            title="Moderation Activity"
            subtitle="Warns, kicks, bans and more over time"
        >
            {isLoading ? (
                <CardLoading />
            ) : hasError ? (
                <CardError message={errorMsg} />
            ) : (
                <ActionsTimelineChart daily={successData!.daily} />
            )}
        </InsightsCard>
    );
}

function PlayerGrowthCard() {
    const { isLoading, hasError, errorMsg, successData } = useInsightData<Exclude<InsightsPlayerGrowthResp, WithError>>(
        '/insights/playerGrowth',
        (mock) => mock.playerGrowth,
    );
    return (
        <InsightsCard
            icon={<LineChartIcon />}
            title="Player Growth"
            subtitle="Cumulative unique players over time"
            action={
                successData ? <HeadlinePill label="Total" value={successData.totalPlayers.toLocaleString()} /> : null
            }
        >
            {isLoading ? (
                <CardLoading />
            ) : hasError ? (
                <CardError message={errorMsg} />
            ) : (
                <PlayerGrowthChart data={successData!.data} />
            )}
        </InsightsCard>
    );
}

function SessionLengthCard() {
    const { isLoading, hasError, errorMsg, successData } = useInsightData<
        Exclude<InsightsSessionLengthResp, WithError>
    >('/insights/sessionLength', (mock) => mock.sessionLength);
    return (
        <InsightsCard
            icon={<ClockIcon />}
            title="Session Length"
            subtitle={
                successData
                    ? `${successData.totalSessions.toLocaleString()} sessions · ${successData.hoursAnalyzed}h analyzed`
                    : 'How long sessions typically last'
            }
            action={
                successData ? (
                    <>
                        <HeadlinePill label="Avg" value={formatPlayTime(successData.avgMinutes)} />
                        <span className="text-muted-foreground/40">·</span>
                        <HeadlinePill label="Median" value={formatPlayTime(successData.medianMinutes)} />
                    </>
                ) : null
            }
        >
            {isLoading ? (
                <CardLoading />
            ) : hasError ? (
                <CardError message={errorMsg} />
            ) : (
                <SessionLengthChart buckets={successData!.buckets} />
            )}
        </InsightsCard>
    );
}

function DailyPlayersCard() {
    const { isLoading, hasError, errorMsg, successData } = useInsightData<Exclude<InsightsDailyPlayersResp, WithError>>(
        '/insights/dailyPlayers',
        (mock) => mock.dailyPlayers,
    );
    return (
        <InsightsCard
            icon={<UsersIcon />}
            title="New vs Returning Players"
            subtitle="Daily breakdown of who showed up"
            action={successData ? <HeadlinePill label="Window" value={`${successData.daysAnalyzed}d`} /> : null}
        >
            {isLoading ? (
                <CardLoading />
            ) : hasError ? (
                <CardError message={errorMsg} />
            ) : (
                <DailyPlayersChart daily={successData!.daily} />
            )}
        </InsightsCard>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────────

export default function InsightsPage() {
    return (
        <div className="flex w-full min-w-0 flex-col gap-5">
            <PageHeader
                icon={<ActivityIcon />}
                title="Insights"
                description="Long-term server trends, player analytics and moderation history"
            />

            {/* Population section */}
            <SectionHeading
                icon={<UsersIcon />}
                title="Population"
                description="How your player base evolves over time"
            />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <PlayerCountCard />
                <DailyPlayersCard />
                <NewPlayersCard />
                <PlayerGrowthCard />
                <PeakHoursCard />
                <RetentionCard />
            </div>

            {/* Sessions & engagement */}
            <SectionHeading
                icon={<ClockIcon />}
                title="Sessions & Engagement"
                description="What players do once they're connected"
            />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <SessionLengthCard />
                <PlaytimeDistCard />
                <TopPlayersCard />
                <DisconnectReasonsCard />
            </div>

            {/* Operations */}
            <SectionHeading
                icon={<ServerIcon />}
                title="Operations"
                description="Server uptime and moderation activity"
            />
            <div className="grid grid-cols-1 gap-4">
                <UptimeCard />
                <ActionsTimelineCard />
            </div>
        </div>
    );
}
