import { useBackendApi } from '@/hooks/fetch';
import type { PlayerDropsApiResp, PlayerDropsApiSuccessResp } from '@shared/otherTypes';
import useSWR from 'swr';
import DrilldownCard, { DrilldownCardLoading } from './DrilldownCard';
import TimelineCard from './TimelineCard';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';
import { CalendarRangeIcon, TrendingDownIcon, XIcon } from 'lucide-react';

export type DrilldownRangeSelectionType = {
    startDate: Date;
    endDate: Date;
} | null;
export type DisplayLodType = 'hour' | 'day';

/**
 * Get the query params for the player drops api
 * Modifies the end date to include the whole day/hour depending on the display LOD
 */
const getQueryParams = (rangeState: DrilldownRangeSelectionType, displayLod: DisplayLodType) => {
    if (!rangeState) {
        const detailedDaysAgo = displayLod === 'day' ? 14 : 7;
        return {
            queryKey: 'detailedDaysAgo=' + detailedDaysAgo,
            queryParams: { detailedDaysAgo },
        };
    }

    const newEndDate = new Date(rangeState.endDate);
    if (displayLod === 'day') {
        newEndDate.setHours(23, 59, 59, 999);
    } else {
        newEndDate.setMinutes(59, 59, 999);
    }
    const detailedWindow = `${rangeState.startDate.toISOString()},${newEndDate.toISOString()}`;
    return {
        queryKey: 'detailedWindow=' + detailedWindow,
        queryParams: { detailedWindow },
    };
};

const drilldownIntervals = [
    { label: '24h', days: 1 },
    { label: '3d', days: 3 },
    { label: '7d', days: 7 },
    { label: '14d', days: 14 },
] as const;

const dateFmt = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
});

/**
 * The player drops page — timeline + per-range drilldown.
 * Dashboard shows only a real-time drop pie; this page is the full historical analysis.
 */
export default function PlayerDropsPage() {
    const [displayLod, setDisplayLod] = useState<DisplayLodType>('hour');
    const [drilldownRange, setDrilldownRange] = useState<DrilldownRangeSelectionType>(null);
    const { queryKey, queryParams } = getQueryParams(drilldownRange, displayLod);

    const playerDropsApi = useBackendApi<PlayerDropsApiResp>({
        method: 'GET',
        path: `/playerDropsData`,
    });
    const swrDataApiResp = useSWR(
        `/playerDropsData?${queryKey}`,
        async () => {
            const data = await playerDropsApi({ queryParams });
            if (!data) throw new Error('empty_response');
            if ('fail_reason' in data) {
                throw new Error(data.fail_reason);
            }
            return data as PlayerDropsApiSuccessResp;
        },
        {
            revalidateOnFocus: false,
        },
    );
    const displayLodSetter = (lod: DisplayLodType) => {
        setDisplayLod(lod);
        setDrilldownRange(null);
    };

    const setIntervalRange = (days: number) => {
        const now = new Date();
        const start = new Date(now);
        start.setDate(start.getDate() - days);
        setDrilldownRange({ startDate: start, endDate: now });
    };

    //Check which interval button matches current range (if any)
    const activeInterval = (() => {
        if (!drilldownRange) return null;
        const rangeDurationMs = drilldownRange.endDate.getTime() - drilldownRange.startDate.getTime();
        const rangeDays = rangeDurationMs / (1000 * 60 * 60 * 24);
        for (const interval of drilldownIntervals) {
            if (Math.abs(rangeDays - interval.days) < 0.1) return interval.days;
        }
        return null;
    })();

    const defaultWindowLabel = displayLod === 'day' ? 'Last 14 days' : 'Last 7 days';

    return (
        <div className="flex w-full min-w-0 flex-col gap-5">
            <PageHeader
                icon={<TrendingDownIcon />}
                title="Player Drops"
                description="Historical drops timeline & drilldown · what, when, and why players left"
            >
                <span className="text-muted-foreground/70 border-border/50 bg-card/60 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs">
                    <CalendarRangeIcon className="size-3" />
                    <span className="font-medium">
                        {drilldownRange
                            ? `${dateFmt.format(drilldownRange.startDate)} → ${dateFmt.format(drilldownRange.endDate)}`
                            : defaultWindowLabel}
                    </span>
                </span>
                <span className="bg-secondary/40 border-border/50 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs">
                    <span className="text-muted-foreground/70">Lens</span>
                    <span className="font-mono font-semibold uppercase">{displayLod}</span>
                </span>
            </PageHeader>

            <TimelineCard
                isError={!!swrDataApiResp.error}
                dataTs={swrDataApiResp.data?.ts}
                summaryData={swrDataApiResp.data?.summary}
                rangeSelected={drilldownRange}
                rangeSetter={setDrilldownRange}
                displayLod={displayLod}
                setDisplayLod={displayLodSetter}
            />

            {/* Drilldown toolbar */}
            <div className="bg-card/60 border-border/50 flex flex-col gap-2 rounded-xl border px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center">
                <div className="flex items-center gap-2 pr-2">
                    <div className="bg-secondary/40 border-border/50 text-accent/80 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border">
                        <CalendarRangeIcon className="size-3.5" />
                    </div>
                    <div className="text-xs">
                        <div className="leading-tight font-semibold">Drilldown Range</div>
                        <div className="text-muted-foreground/70 leading-tight">Pick a window to inspect</div>
                    </div>
                </div>
                <div className="bg-secondary/30 border-border/40 flex w-full items-center gap-1 rounded-lg border p-1 sm:ml-auto sm:w-auto">
                    {drilldownIntervals.map(({ label, days }) => (
                        <Button
                            key={days}
                            size="xs"
                            variant={activeInterval === days ? 'default' : 'ghost'}
                            className={cn(
                                'h-7 flex-1 px-3 font-mono text-xs sm:flex-initial',
                                activeInterval === days && 'pointer-events-none',
                            )}
                            onClick={() => setIntervalRange(days)}
                        >
                            {label}
                        </Button>
                    ))}
                </div>
                {drilldownRange && (
                    <Button
                        size="xs"
                        variant="ghost"
                        className="text-muted-foreground hover:text-foreground h-7 w-full justify-center gap-1 px-2 text-xs sm:w-auto"
                        onClick={() => setDrilldownRange(null)}
                    >
                        <XIcon className="size-3" />
                        Reset
                    </Button>
                )}
            </div>

            {swrDataApiResp.data ? (
                <div className="relative min-h-128">
                    {swrDataApiResp.isValidating && (
                        <div className="bg-background/50 absolute inset-0 z-10 flex items-center justify-center rounded-xl">
                            <DrilldownCardLoading isError={false} />
                        </div>
                    )}
                    <DrilldownCard
                        windowStart={swrDataApiResp.data.detailed.windowStart}
                        windowEnd={swrDataApiResp.data.detailed.windowEnd}
                        windowData={swrDataApiResp.data.detailed.windowData}
                        rangeSelected={drilldownRange}
                        displayLod={displayLod}
                    />
                </div>
            ) : (
                <div className="min-h-128">
                    <DrilldownCardLoading isError={!!swrDataApiResp.error} />
                </div>
            )}
        </div>
    );
}
