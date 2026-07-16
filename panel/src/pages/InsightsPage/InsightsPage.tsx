import { useBackendApi } from '@/hooks/fetch';
import useSWR from 'swr';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { useLocale } from '@/hooks/locale';
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
    const { t } = useLocale();
    const api = useBackendApi<T | WithError>({ method: 'GET', path });
    const { data, error, isLoading } = useSWR<T | WithError>(
        path,
        async (): Promise<T | WithError> => {
            const isDevMockMode = import.meta.env.DEV && isDevMockStatusOptInEnabled();
            if (isDevMockMode) return devMockSelector(getDevMockInsights());
            const result = await api({});
            if (result === undefined) return { error: t('panel.insights.errors.request_failed') } as WithError;
            return result;
        },
        { revalidateOnFocus: false, dedupingInterval: 60_000 },
    );
    const dataHasError = !!data && 'error' in data;
    const hasError = !!error || dataHasError;
    const errorMsg = hasError
        ? dataHasError
            ? (data as WithError).error
            : t('panel.insights.errors.failed_to_load')
        : '';
    const successData: T | null = data && !dataHasError ? (data as T) : null;
    return { isLoading, hasError, errorMsg, successData };
}

// ──────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ──────────────────────────────────────────────────────────────────────────────

function CardLoading() {
    return (
        <div className="flex items-center justify-center py-12">
            <Loader2Icon className="text-muted-foreground size-6 animate-spin" />
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
                    <div className="bg-secondary/40 border-border/50 text-accent/80 flex size-9 shrink-0 items-center justify-center rounded-lg border [&>svg]:size-4">
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
    const { t } = useLocale();
    const { isLoading, hasError, errorMsg, successData } = useInsightData<Exclude<InsightsPlayerCountResp, WithError>>(
        '/insights/playerCount',
        (mock) => mock.playerCount,
    );
    return (
        <InsightsCard
            className="col-span-full"
            icon={<ActivityIcon />}
            title={t('panel.insights.cards.player_count.title')}
            subtitle={t('panel.insights.cards.player_count.subtitle')}
            action={
                successData ? (
                    <HeadlinePill
                        label={t('panel.insights.pills.peak')}
                        value={t('panel.insights.values.peak_players', { count: successData.peakCount })}
                    />
                ) : null
            }
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
    const { t } = useLocale();
    const { isLoading, hasError, errorMsg, successData } = useInsightData<Exclude<InsightsNewPlayersResp, WithError>>(
        '/insights/newPlayers',
        (mock) => mock.newPlayers,
    );
    return (
        <InsightsCard
            icon={<UserPlusIcon />}
            title={t('panel.insights.cards.new_players.title')}
            subtitle={t('panel.insights.cards.new_players.subtitle')}
            action={
                successData ? (
                    <HeadlinePill
                        label={t('panel.insights.pills.total')}
                        value={successData.totalPlayers.toLocaleString()}
                    />
                ) : null
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
    const { t } = useLocale();
    const { isLoading, hasError, errorMsg, successData } = useInsightData<Exclude<InsightsPlaytimeDistResp, WithError>>(
        '/insights/playtimeDist',
        (mock) => mock.playtimeDist,
    );
    return (
        <InsightsCard
            icon={<BarChart3Icon />}
            title={t('panel.insights.cards.playtime_dist.title')}
            subtitle={t('panel.insights.cards.playtime_dist.subtitle')}
            action={
                successData ? (
                    <>
                        <HeadlinePill
                            label={t('panel.insights.pills.median')}
                            value={formatPlayTime(successData.medianMinutes)}
                        />
                        <span className="text-muted-foreground/40">·</span>
                        <HeadlinePill
                            label={t('panel.insights.pills.avg')}
                            value={formatPlayTime(successData.averageMinutes)}
                        />
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
    const { t } = useLocale();
    const { isLoading, hasError, errorMsg, successData } = useInsightData<Exclude<InsightsTopPlayersResp, WithError>>(
        '/insights/topPlayers',
        (mock) => mock.topPlayers,
    );
    const openPlayerModal = useOpenPlayerModal();
    return (
        <InsightsCard
            icon={<CrownIcon />}
            title={t('panel.insights.cards.top_players.title')}
            subtitle={t('panel.insights.cards.top_players.subtitle')}
        >
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
    const { t } = useLocale();
    const { isLoading, hasError, errorMsg, successData } = useInsightData<Exclude<InsightsRetentionResp, WithError>>(
        '/insights/retention',
        (mock) => mock.retention,
    );
    return (
        <InsightsCard
            className="col-span-full"
            icon={<TrendingUpIcon />}
            title={t('panel.insights.cards.retention.title')}
            subtitle={t('panel.insights.cards.retention.subtitle')}
            action={
                successData ? (
                    <HeadlinePill
                        label={t('panel.insights.pills.sample')}
                        value={t('panel.insights.values.sample_players', {
                            count: successData.sampleSize.toLocaleString(),
                        })}
                    />
                ) : null
            }
        >
            {isLoading ? (
                <CardLoading />
            ) : hasError ? (
                <CardError message={errorMsg} />
            ) : (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div>
                        <h4 className="text-muted-foreground mb-2 text-xs font-medium tracking-wider uppercase">
                            {t('panel.insights.retention.return_rate_heading')}
                        </h4>
                        <div className="grid grid-cols-3 gap-2">
                            <RetentionStat
                                label={t('panel.insights.retention.after_1d')}
                                value={successData!.returnRate1d}
                            />
                            <RetentionStat
                                label={t('panel.insights.retention.after_7d')}
                                value={successData!.returnRate7d}
                            />
                            <RetentionStat
                                label={t('panel.insights.retention.after_30d')}
                                value={successData!.returnRate30d}
                            />
                        </div>
                    </div>
                    <div>
                        <h4 className="text-muted-foreground mb-2 text-xs font-medium tracking-wider uppercase">
                            {t('panel.insights.retention.current_activity_heading')}
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                            <RetentionStat
                                label={t('panel.insights.retention.active_last_7d')}
                                value={successData!.activeLast7d}
                            />
                            <RetentionStat
                                label={t('panel.insights.retention.active_last_30d')}
                                value={successData!.activeLast30d}
                            />
                        </div>
                    </div>
                </div>
            )}
        </InsightsCard>
    );
}

function UptimeCard() {
    const { t } = useLocale();
    const { isLoading, hasError, errorMsg, successData } = useInsightData<Exclude<InsightsUptimeResp, WithError>>(
        '/insights/uptimeTimeline',
        (mock) => mock.uptimeTimeline,
    );
    return (
        <InsightsCard
            className="col-span-full"
            icon={<ServerIcon />}
            title={t('panel.insights.cards.uptime.title')}
            subtitle={t('panel.insights.cards.uptime.subtitle')}
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
    const { t } = useLocale();
    const { isLoading, hasError, errorMsg, successData } = useInsightData<
        Exclude<InsightsDisconnectReasonsResp, WithError>
    >('/insights/disconnectReasons', (mock) => mock.disconnectReasons);
    return (
        <InsightsCard
            icon={<WifiOffIcon />}
            title={t('panel.insights.cards.disconnect_reasons.title')}
            subtitle={t('panel.insights.cards.disconnect_reasons.subtitle')}
            action={
                successData ? (
                    <HeadlinePill
                        label={t('panel.insights.pills.total')}
                        value={successData.totalDrops.toLocaleString()}
                    />
                ) : null
            }
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
    const { t } = useLocale();
    const { isLoading, hasError, errorMsg, successData } = useInsightData<Exclude<InsightsPeakHoursResp, WithError>>(
        '/insights/peakHours',
        (mock) => mock.peakHours,
    );
    return (
        <InsightsCard
            icon={<SignalIcon />}
            title={t('panel.insights.cards.peak_hours.title')}
            subtitle={t('panel.insights.cards.peak_hours.subtitle')}
        >
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
    const { t } = useLocale();
    const { isLoading, hasError, errorMsg, successData } = useInsightData<
        Exclude<InsightsActionsTimelineResp, WithError>
    >('/insights/actionsTimeline', (mock) => mock.actionsTimeline);
    return (
        <InsightsCard
            className="col-span-full"
            icon={<GavelIcon />}
            title={t('panel.insights.cards.moderation.title')}
            subtitle={t('panel.insights.cards.moderation.subtitle')}
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
    const { t } = useLocale();
    const { isLoading, hasError, errorMsg, successData } = useInsightData<Exclude<InsightsPlayerGrowthResp, WithError>>(
        '/insights/playerGrowth',
        (mock) => mock.playerGrowth,
    );
    return (
        <InsightsCard
            icon={<LineChartIcon />}
            title={t('panel.insights.cards.player_growth.title')}
            subtitle={t('panel.insights.cards.player_growth.subtitle')}
            action={
                successData ? (
                    <HeadlinePill
                        label={t('panel.insights.pills.total')}
                        value={successData.totalPlayers.toLocaleString()}
                    />
                ) : null
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
    const { t } = useLocale();
    const { isLoading, hasError, errorMsg, successData } = useInsightData<
        Exclude<InsightsSessionLengthResp, WithError>
    >('/insights/sessionLength', (mock) => mock.sessionLength);
    return (
        <InsightsCard
            icon={<ClockIcon />}
            title={t('panel.insights.cards.session_length.title')}
            subtitle={
                successData
                    ? t('panel.insights.values.sessions_subtitle', {
                          sessions: successData.totalSessions.toLocaleString(),
                          hours: successData.hoursAnalyzed,
                      })
                    : t('panel.insights.cards.session_length.subtitle')
            }
            action={
                successData ? (
                    <>
                        <HeadlinePill
                            label={t('panel.insights.pills.avg')}
                            value={formatPlayTime(successData.avgMinutes)}
                        />
                        <span className="text-muted-foreground/40">·</span>
                        <HeadlinePill
                            label={t('panel.insights.pills.median')}
                            value={formatPlayTime(successData.medianMinutes)}
                        />
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
    const { t } = useLocale();
    const { isLoading, hasError, errorMsg, successData } = useInsightData<Exclude<InsightsDailyPlayersResp, WithError>>(
        '/insights/dailyPlayers',
        (mock) => mock.dailyPlayers,
    );
    return (
        <InsightsCard
            icon={<UsersIcon />}
            title={t('panel.insights.cards.daily_players.title')}
            subtitle={t('panel.insights.cards.daily_players.subtitle')}
            action={
                successData ? (
                    <HeadlinePill
                        label={t('panel.insights.pills.window')}
                        value={t('panel.insights.values.window_days', { days: successData.daysAnalyzed })}
                    />
                ) : null
            }
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
    const { t } = useLocale();
    return (
        <div className="flex w-full min-w-0 flex-col gap-5">
            <PageHeader
                icon={<ActivityIcon />}
                title={t('panel.routes.insights')}
                description={t('panel.insights.page_description')}
            />

            {/* Population section (no heading: this is the first section, right under the page header) */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <RetentionCard />
                <PlayerCountCard />
                <DailyPlayersCard />
                <NewPlayersCard />
                <PlayerGrowthCard />
                <PeakHoursCard />
            </div>

            {/* Sessions & engagement */}
            <SectionHeading
                icon={<ClockIcon />}
                title={t('panel.insights.sections.sessions.title')}
                description={t('panel.insights.sections.sessions.description')}
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
                title={t('panel.insights.sections.operations.title')}
                description={t('panel.insights.sections.operations.description')}
            />
            <div className="grid grid-cols-1 gap-4">
                <UptimeCard />
                <ActionsTimelineCard />
            </div>
        </div>
    );
}
