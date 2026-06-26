import DebouncedResizeContainer from '@/components/DebouncedResizeContainer';
import { Card } from '@/components/ui/card';
import { DoorOpenIcon, MousePointerIcon, ZapIcon } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import type { PlayerDropsSummaryHour } from '@shared/otherTypes';
import { PlayerDropsLoadingSpinner } from '@/pages/PlayerDropsPage/PlayerDropsGenericSubcards';
import TimelineDropsChart, { TimelineDropsChartData } from '@/pages/PlayerDropsPage/TimelineDropsChart';
import { processDropsSummary } from '@/pages/PlayerDropsPage/chartingUtils';
import type { DisplayLodType, DrilldownRangeSelectionType } from '@/pages/PlayerDropsPage/playerDropsTypes';

type TimelineCardProps = {
    isError?: boolean;
    dataTs?: number;
    summaryData?: PlayerDropsSummaryHour[];
    rangeSelected: DrilldownRangeSelectionType;
    rangeSetter: (range: DrilldownRangeSelectionType) => void;
    displayLod: DisplayLodType;
};

/**
 * V2 timeline card — taller charts (V1 cramped the expected chart into
 * 128px), the lens select moved up into the header band, and an explicit
 * hint that the charts support drag-to-select range zooming.
 */
const TimelineCard = memo(
    ({ isError, dataTs, summaryData, rangeSelected, rangeSetter, displayLod }: TimelineCardProps) => {
        const [expectedDropsChartSize, setExpectedDropsChartSize] = useState({ width: 0, height: 0 });
        const [unexpectedDropsChartSize, setUnexpectedDropsChartSize] = useState({ width: 0, height: 0 });

        //Process data only once
        const chartsData = useMemo(() => {
            if (!summaryData || !dataTs) return;
            const startDate = new Date(dataTs);
            const endDate = new Date(dataTs);
            if (displayLod === 'day') {
                // 14d window, 12h+15m padding start
                startDate.setHours(-(14 * 24) - 12, -15, 0, 0);
                endDate.setHours(12, 0, 0, 0);
            } else {
                // 7d window, 30m+15m padding start
                startDate.setHours(startDate.getHours() - 7 * 24, -45, 0, 0);
                endDate.setMinutes(30, 0, 0);
            }
            const processed = processDropsSummary(summaryData, displayLod, startDate);
            if (!processed) return;

            const commonProps = { displayLod, startDate, endDate };
            return {
                expected: {
                    ...commonProps,
                    maxDrops: processed.expectedSeriesMax,
                    categoriesSorted: processed.expectedCategoriesSorted,
                    log: processed.expectedSeries,
                } satisfies TimelineDropsChartData,
                unexpected: {
                    ...commonProps,
                    maxDrops: processed.unexpectedSeriesMax,
                    categoriesSorted: processed.unexpectedCategoriesSorted,
                    log: processed.unexpectedSeries,
                } satisfies TimelineDropsChartData,
            };
        }, [summaryData, displayLod]);

        return (
            <Card className="overflow-hidden">
                <div className="border-border/40 flex flex-col gap-2 border-b px-3 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="bg-secondary/40 border-border/50 text-accent/80 flex size-9 shrink-0 items-center justify-center rounded-lg border [&>svg]:size-4">
                            <DoorOpenIcon />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 className="text-sm leading-tight font-semibold tracking-tight">
                                Expected Player Drops
                            </h3>
                            <p className="text-muted-foreground/70 mt-0.5 truncate text-xs">
                                Voluntary disconnects & kicks
                            </p>
                        </div>
                    </div>
                    <div className="text-muted-foreground/60 flex items-center gap-1.5 pl-12 text-xs sm:ml-auto sm:pl-0">
                        <MousePointerIcon className="size-3 shrink-0" />
                        <span>Drag across a chart to drill into a window</span>
                    </div>
                </div>
                <div className="h-44 max-h-44">
                    <DebouncedResizeContainer onDebouncedResize={setExpectedDropsChartSize}>
                        {chartsData ? (
                            <TimelineDropsChart
                                chartData={chartsData.expected}
                                chartName="expected"
                                width={expectedDropsChartSize.width}
                                height={expectedDropsChartSize.height}
                                rangeSelected={rangeSelected}
                                rangeSetter={rangeSetter}
                            />
                        ) : (
                            <PlayerDropsLoadingSpinner isError={isError} />
                        )}
                    </DebouncedResizeContainer>
                </div>

                <div className="border-border/40 flex items-center gap-3 border-t border-b px-3 py-3 sm:px-4">
                    <div className="bg-secondary/40 border-border/50 text-accent/80 flex size-9 shrink-0 items-center justify-center rounded-lg border [&>svg]:size-4">
                        <ZapIcon />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-sm leading-tight font-semibold tracking-tight">Unexpected Player Drops</h3>
                        <p className="text-muted-foreground/70 mt-0.5 truncate text-xs">
                            Crashes, timeouts & unknown disconnects
                        </p>
                    </div>
                </div>
                <div className="h-64 max-h-64">
                    <DebouncedResizeContainer onDebouncedResize={setUnexpectedDropsChartSize}>
                        {chartsData ? (
                            <TimelineDropsChart
                                chartData={chartsData.unexpected}
                                chartName="unexpected"
                                width={unexpectedDropsChartSize.width}
                                height={unexpectedDropsChartSize.height}
                                rangeSelected={rangeSelected}
                                rangeSetter={rangeSetter}
                            />
                        ) : (
                            <PlayerDropsLoadingSpinner isError={isError} />
                        )}
                    </DebouncedResizeContainer>
                </div>
            </Card>
        );
    },
);

export default memo(TimelineCard);
