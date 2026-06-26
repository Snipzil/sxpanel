import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Loader2Icon } from 'lucide-react';
import { useBackendApi } from '@/hooks/fetch';
import { useLocale } from '@/hooks/locale';
import { playerDropExpectedCategories } from '@/lib/playerDropCategories';
import type { PlayerDropsApiResp, PlayerDropsApiSuccessResp, PlayerDropsSummaryHour } from '@shared/otherTypes';
import DrilldownCard, { DrilldownCardLoading } from '@/pages/PlayerDropsPage/DrilldownCard';
import type { DisplayLodType, DrilldownRangeSelectionType } from '@/pages/PlayerDropsPage/playerDropsTypes';
import { PlayerDropsHeaderBand, type PlayerDropsHeaderStats } from './PlayerDropsHeaderBand';
import TimelineCard from './TimelineCard';

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

const expectedDropCategorySet = new Set(playerDropExpectedCategories);

/** Aggregate summary hours into header-band stats. */
const summarizeDrops = (summary: PlayerDropsSummaryHour[]): PlayerDropsHeaderStats => {
    let totalDrops = 0;
    let unexpectedDrops = 0;
    let changes = 0;
    for (const hour of summary) {
        changes += hour.changes;
        for (const [category, count] of hour.dropTypes) {
            totalDrops += count;
            if (!expectedDropCategorySet.has(category)) {
                unexpectedDrops += count;
            }
        }
    }
    return { totalDrops, unexpectedDrops, changes };
};

/**
 * Player Drops V2 — redesign goals over V1:
 * - One V2 header band consolidating the three control surfaces (PageHeader
 *   pills, in-card lens select, standalone drilldown toolbar) with summary
 *   stat pills (drops / unexpected / changes) computed from the timeline.
 * - Taller timeline charts (the expected chart was squeezed into 128px).
 * - Explicit drag-to-select hint for the canvas range picking.
 * - "Updating…" label on the revalidation overlay.
 */
export default function PlayerDropsPage() {
    const { t } = useLocale();
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
    const windowLabel = drilldownRange
        ? `${dateFmt.format(drilldownRange.startDate)} → ${dateFmt.format(drilldownRange.endDate)}`
        : defaultWindowLabel;

    const headerStats = useMemo(
        () => (swrDataApiResp.data ? summarizeDrops(swrDataApiResp.data.summary) : undefined),
        [swrDataApiResp.data],
    );

    return (
        <div className="flex w-full min-w-96 flex-col gap-4">
            <PlayerDropsHeaderBand
                title={t('panel.routes.player_drops')}
                windowLabel={windowLabel}
                stats={headerStats}
                displayLod={displayLod}
                setDisplayLod={displayLodSetter}
                drilldownIntervals={drilldownIntervals}
                activeInterval={activeInterval}
                setIntervalRange={setIntervalRange}
                hasRange={!!drilldownRange}
                resetRange={() => setDrilldownRange(null)}
            />

            <TimelineCard
                isError={!!swrDataApiResp.error}
                dataTs={swrDataApiResp.data?.ts}
                summaryData={swrDataApiResp.data?.summary}
                rangeSelected={drilldownRange}
                rangeSetter={setDrilldownRange}
                displayLod={displayLod}
            />

            {swrDataApiResp.data ? (
                <div className="relative min-h-128">
                    {swrDataApiResp.isValidating && (
                        <div className="bg-background/60 absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl backdrop-blur-[1px]">
                            <Loader2Icon className="text-muted-foreground size-6 animate-spin" />
                            <span className="text-muted-foreground text-sm font-medium">Updating…</span>
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
