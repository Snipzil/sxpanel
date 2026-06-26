import { Bar, BarTooltipProps } from '@nivo/bar';
import { BarChartHorizontalIcon, Loader2Icon } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useIsDarkMode } from '@/hooks/theme';
import {
    formatTickBoundary,
    getBucketTicketsEstimatedTime,
    getMinTickIntervalMarker,
    getTimeWeightedHistogram,
} from './chartingUtils';
import DebouncedResizeContainer from '@/components/DebouncedResizeContainer';
import { useAtomValue } from 'jotai';
import { dashPerfCursorAtom, dashSvRuntimeAtom, useGetDashDataAge } from './dashboardHooks';
import { interpolateRdYlGn } from 'd3-scale-chromatic';
import { color } from 'd3-color';
import { SvRtPerfThreadNamesType } from '@shared/otherTypes';
import { cn } from '@/lib/utils';
import { dateToLocaleDateString, dateToLocaleTimeString, isDateToday } from '@/lib/dateTime';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/**
 * Types
 */
type ThreadPerfChartDatum = {
    bucket: string | number;
    value: number;
    color: string;
    count: number;
};

type ThreadPerfChartProps = {
    data: ThreadPerfChartDatum[];
    minTickIntervalMarker: number | undefined;
    avgColor: string | undefined;
    width: number;
    height: number;
};

/**
 * Constants
 */
//NOTE: numbers from fivem/code/components/citizen-server-impl/src/GameServer.cpp
const PERF_MIN_TICK_TIME = {
    //svMain - 20fps, 50ms/tick
    //svNetwork - 100fps, 10ms/tick
    //svSync - 120fps, 8.3ms/tick
    svMain: 1000 / 20 / 1000,
    svNetwork: 1000 / 100 / 1000,
    svSync: 1000 / 120 / 1000,
};

/**
 * Memoized nivo bar chart component
 */
const ThreadPerfChart = memo(({ data, minTickIntervalMarker, avgColor, width, height }: ThreadPerfChartProps) => {
    const isDarkMode = useIsDarkMode();

    const CustomToolbar = (datum: BarTooltipProps<ThreadPerfChartDatum>) => {
        const lowerLimit = data.find((_, index) => index === datum.index - 1)?.bucket ?? 0;
        const upperLimit = datum.data.bucket;
        const pctString = (datum.value * 100).toFixed() + '%';
        return (
            <div className="text-card-foreground bg-card border-border rounded-md border p-3 shadow-md">
                <div>
                    Tick duration: <strong>{formatTickBoundary(lowerLimit)}</strong> ~{' '}
                    <strong>{formatTickBoundary(upperLimit)}</strong>
                </div>
                <div>
                    Time spent: <strong>~{pctString}</strong>
                </div>
                <div>Tick count: {datum.data.count}</div>
            </div>
        );
    };

    if (!width || !height) return null;
    return (
        <div style={{ backgroundColor: avgColor, width, height }}>
            <Bar
                height={height}
                width={width}
                data={data}
                theme={{
                    text: {
                        fontSize: '12px',
                        fontWeight: 600,
                        fill: 'inherit',
                    },
                    grid: {
                        line: {
                            strokeDasharray: '8 6',
                            stroke: '#3F4146', //secondary
                            strokeOpacity: isDarkMode ? 1 : 0.25,
                            strokeWidth: 1,
                        },
                    },
                }}
                indexBy="bucket"
                margin={{ top: 0, right: 25, bottom: 40, left: 60 }}
                layout="horizontal"
                valueFormat={'.1%'}
                colors={{ datum: 'data.color' }}
                colorBy="indexValue"
                borderWidth={0.5}
                borderColor={
                    isDarkMode
                        ? undefined
                        : {
                              from: 'color',
                              modifiers: [['darker', 1]],
                          }
                }
                axisBottom={{
                    format: '.0%',
                    legend: 'percent of total time',
                    legendPosition: 'middle',
                    legendOffset: 32,
                }}
                axisLeft={{ format: formatTickBoundary }}
                enableGridX={true}
                enableGridY={false}
                labelSkipWidth={25}
                labelSkipHeight={12}
                labelTextColor={{
                    from: 'color',
                    modifiers: [['darker', 1.6]],
                }}
                tooltip={CustomToolbar}
                markers={
                    minTickIntervalMarker
                        ? [
                              {
                                  axis: 'y',
                                  value: minTickIntervalMarker,
                                  lineStyle: {
                                      stroke: isDarkMode ? 'black' : '#333',
                                      opacity: 0.5,
                                      strokeWidth: 4,
                                      strokeDasharray: '6 2',
                                      strokeDashoffset: 1,
                                  },
                                  legend: 'good',
                                  legendPosition: 'bottom-right',
                                  //@ts-ignore - types are wrong, it errors if I remove this
                                  legendOffsetX: 10,
                                  legendOffsetY: 12,
                                  legendOrientation: 'horizontal',
                                  textStyle: {
                                      fontSize: '16px',
                                      opacity: 0.5,
                                  },
                              },
                              {
                                  axis: 'y',
                                  value: minTickIntervalMarker,
                                  lineStyle: {
                                      stroke: isDarkMode ? 'white' : '#666',
                                      opacity: 0.55,
                                      strokeWidth: 2,
                                      strokeDasharray: '4 4',
                                  },
                                  legend: 'bad',
                                  legendPosition: 'top-right',
                                  //@ts-ignore - types are wrong, it errors if I remove this
                                  legendOffsetX: 10,
                                  legendOffsetY: 12,
                                  legendOrientation: 'horizontal',
                                  textStyle: {
                                      fontSize: '16px',
                                      opacity: 0.5,
                                  },
                              },
                          ]
                        : undefined
                }
            />
        </div>
    );
});

export default function ThreadPerfCard() {
    const [chartSize, setChartSize] = useState({ width: 0, height: 0 });
    const [selectedThread, setSelectedThread] = useState<SvRtPerfThreadNamesType>('svMain');
    const svRuntimeData = useAtomValue(dashSvRuntimeAtom);
    const perfCursorData = useAtomValue(dashPerfCursorAtom);
    const getDashDataAge = useGetDashDataAge();

    const chartData = useMemo(() => {
        //Data availability & age check
        if (!svRuntimeData || getDashDataAge().isExpired) return null;

        //Data completeness check
        if (!Array.isArray(svRuntimeData.perfBoundaries) || !svRuntimeData.perfBucketCounts) {
            return 'incomplete';
        }

        const threadName = (perfCursorData ? perfCursorData.threadName : selectedThread) as SvRtPerfThreadNamesType;

        const { perfBoundaries, perfBucketCounts } = svRuntimeData;
        const minTickInterval = PERF_MIN_TICK_TIME[threadName];
        const minTickIntervalMarker = getMinTickIntervalMarker(perfBoundaries, minTickInterval);
        const minTickIntervalIndex = perfBoundaries.findIndex((b) => b === minTickIntervalMarker);
        let colorFunc: (bucketIndex: number) => string;
        if (minTickIntervalIndex !== -1) {
            colorFunc = (bucketIndex) => {
                if (bucketIndex <= minTickIntervalIndex) {
                    // Use interpolateRdYlGn instead of interpolateYlGn
                    return interpolateRdYlGn(bucketIndex / (minTickIntervalIndex + 1));
                } else {
                    const badCount = perfBoundaries.length - minTickIntervalIndex - 1;
                    // Red for bad performance (reversed RdYlGn)
                    return interpolateRdYlGn(1 - (bucketIndex - minTickIntervalIndex) / badCount);
                }
            };
        } else {
            colorFunc = (bucketIndex) => interpolateRdYlGn(1 - (bucketIndex + 1) / perfBoundaries.length);
        }

        const threadBucketCounts = perfBucketCounts[threadName];
        if (!Array.isArray(threadBucketCounts)) return 'incomplete';
        let threadHistogram: number[];
        if (perfCursorData) {
            threadHistogram = perfCursorData.snap.weightedPerf;
        } else {
            const bucketTicketsEstimatedTime = getBucketTicketsEstimatedTime(perfBoundaries);
            threadHistogram = getTimeWeightedHistogram(threadBucketCounts, bucketTicketsEstimatedTime);
        }

        const data: ThreadPerfChartDatum[] = [];
        for (let i = 0; i < perfBoundaries.length; i++) {
            data.push({
                bucket: perfBoundaries[i],
                count: perfCursorData ? 0 : threadBucketCounts[i],
                value: threadHistogram[i],
                color: colorFunc(i),
            });
        }
        //Calculate average color with heavy transparency for background
        let avgColor: string | undefined;
        if (data.length) {
            let totalWeight = 0;
            let weightedIndex = 0;
            for (let i = 0; i < data.length; i++) {
                totalWeight += data[i].value;
                weightedIndex += data[i].value * i;
            }
            if (totalWeight > 0) {
                const avgIdx = weightedIndex / totalWeight;
                const rawColor = colorFunc(Math.round(avgIdx));
                const parsed = color(rawColor);
                if (parsed) {
                    parsed.opacity = 0.08;
                    avgColor = parsed.formatRgb().replace('rgb(', 'rgba(').replace(')', `, ${parsed.opacity})`);
                }
            }
        }
        return { threadName, data, minTickIntervalMarker, perfBoundaries, avgColor };
    }, [svRuntimeData, perfCursorData, selectedThread]);

    const titleTimeIndicator = useMemo(() => {
        //Data availability & age check
        const dataAge = getDashDataAge();
        if (!svRuntimeData || dataAge.isExpired) return null;

        //Data completeness check
        if (!Array.isArray(svRuntimeData.perfBoundaries) || !svRuntimeData.perfBucketCounts) {
            return null;
        }

        if (perfCursorData) {
            const timeStr = dateToLocaleTimeString(perfCursorData.snap.end, '2-digit', '2-digit');
            const dateStr = dateToLocaleDateString(perfCursorData.snap.end, 'short');
            const fullStr = isDateToday(perfCursorData.snap.end) ? timeStr : `${timeStr} - ${dateStr}`;
            return (
                <>
                    (<span className="text-warning-inline font-mono text-xs">{fullStr}</span>)
                </>
            );
        } else {
            return dataAge.isStale ? '(minutes ago)' : '(last minute)';
        }
    }, [svRuntimeData, perfCursorData]);

    //Rendering
    let cursorThreadLabel;
    let contentNode: React.ReactNode = null;
    if (typeof chartData === 'object' && chartData !== null) {
        cursorThreadLabel = chartData.threadName;
        contentNode = <ThreadPerfChart {...chartData} width={chartSize.width} height={chartSize.height} />;
    } else if (typeof chartData === 'string') {
        contentNode = (
            <div className="text-muted-foreground absolute inset-0 flex flex-col items-center justify-center text-center">
                <p className="max-w-80">
                    Data not yet available. <br />
                    The thread performance chart will appear soon after the server is online.
                </p>
            </div>
        );
    } else {
        contentNode = (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Loader2Icon className="text-muted-foreground size-16 animate-spin" />
            </div>
        );
    }

    return (
        <div className="bg-card fill-primary border-border/60 flex h-80 max-h-80 flex-col rounded-xl border py-2 shadow-sm">
            <div className="flex flex-row items-center justify-between space-y-0 px-4 pb-2">
                <h3 className="text-muted-foreground/50 text-[10px] font-semibold tracking-widest uppercase">
                    {cursorThreadLabel ?? selectedThread} Performance {titleTimeIndicator}
                </h3>
                <div className="flex gap-4">
                    <Select
                        defaultValue={selectedThread}
                        onValueChange={(value) => setSelectedThread(value as SvRtPerfThreadNamesType)}
                        disabled={!!perfCursorData}
                    >
                        <SelectTrigger
                            className={cn('h-6 w-32 grow px-3 py-1 text-sm md:grow-0', !!perfCursorData && 'hidden')}
                        >
                            <SelectValue placeholder="Filter by admin" />
                        </SelectTrigger>
                        <SelectContent className="px-0">
                            <SelectItem value={'svMain'} className="cursor-pointer">
                                svMain
                            </SelectItem>
                            <SelectItem value={'svSync'} className="cursor-pointer">
                                svSync
                            </SelectItem>
                            <SelectItem value={'svNetwork'} className="cursor-pointer">
                                svNetwork
                            </SelectItem>
                        </SelectContent>
                    </Select>
                    <BarChartHorizontalIcon className="text-muted-foreground/30 size-3.5" />
                </div>
            </div>
            <DebouncedResizeContainer onDebouncedResize={setChartSize}>{contentNode}</DebouncedResizeContainer>
        </div>
    );
}
