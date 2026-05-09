import { LineChartIcon, Loader2Icon, UsersIcon, CpuIcon, MemoryStickIcon } from 'lucide-react';
import React, { ReactNode, memo, useEffect, useMemo, useRef, useState } from 'react';
import DebouncedResizeContainer from '@/components/DebouncedResizeContainer';
import drawFullPerfChart from './drawFullPerfChart';
import { useBackendApi } from '@/hooks/fetch';
import type { PerfChartApiResp, PerfChartApiSuccessResp, SvRtPerfThreadNamesType } from '@shared/otherTypes';
import useSWR from 'swr';
import {
    PerfSnapType,
    formatTickBoundary,
    getBucketTicketsEstimatedTime,
    getServerStatsData,
    getTimeWeightedHistogram,
    processPerfLog,
} from './chartingUtils';
import { dashServerStatsAtom, useThrottledSetCursor } from './dashboardHooks';
import { useIsDarkMode } from '@/hooks/theme';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useSetAtom } from 'jotai';
import { cn } from '@/lib/utils';
import { emsg } from '@shared/emsg';
import { createMockPerfChartApiData } from './devMockData';
import { isDevMockStatusOptInEnabled } from '@/lib/devFlags';

type FullPerfChartProps = {
    threadName: SvRtPerfThreadNamesType;
    apiData: PerfChartApiSuccessResp;
    apiDataAge: number;
    width: number;
    height: number;
    isDarkMode: boolean;
    showPlayerCount: boolean;
    showFxsMemory: boolean;
    showNodeMemory: boolean;
};

const FullPerfChart = memo(
    ({
        threadName,
        apiData,
        apiDataAge,
        width,
        height,
        isDarkMode,
        showPlayerCount,
        showFxsMemory,
        showNodeMemory,
    }: FullPerfChartProps) => {
        const setServerStats = useSetAtom(dashServerStatsAtom);
        const svgRef = useRef<SVGSVGElement>(null);
        const canvasRef = useRef<HTMLCanvasElement>(null);
        const [renderError, setRenderError] = useState('');
        const [errorRetry, setErrorRetry] = useState(0);
        const setCursor = useThrottledSetCursor();
        const margins = {
            top: 8,
            right: 50,
            bottom: 30,
            left: 40,
            axis: 1,
        };

        //Process data only once
        const processedData = useMemo(() => {
            if (!apiData) return null;
            const parsed = processPerfLog(apiData.threadPerfLog, (perfLog) => {
                const bucketTicketsEstimatedTime = getBucketTicketsEstimatedTime(apiData.boundaries);
                return getTimeWeightedHistogram(perfLog.buckets, bucketTicketsEstimatedTime);
            });
            if (!parsed) return null;

            return {
                ...parsed,
                bucketLabels: apiData.boundaries.map(formatTickBoundary),
                cursorSetter: (snap: PerfSnapType | undefined) => {
                    if (!snap) return setCursor(undefined);
                    setCursor({
                        threadName,
                        snap,
                    });
                },
            };
        }, [apiData, apiDataAge, threadName]);

        //Update server stats when data changes
        useEffect(() => {
            if (!processedData) {
                setServerStats(undefined);
            } else {
                const serverStatsData = getServerStatsData(processedData.lifespans, 24, apiDataAge);
                setServerStats(serverStatsData);
            }
        }, [processedData, apiDataAge]);

        //Redraw chart when data or size changes
        useEffect(() => {
            if (!processedData || !svgRef.current || !canvasRef.current || !width || !height) return;
            if (!processedData.lifespans.length) return; //only in case somehow the api returned, but no data found
            try {
                console.groupCollapsed('Drawing full performance chart:');
                console.time('drawFullPerfChart');
                drawFullPerfChart({
                    svgRef: svgRef.current,
                    canvasRef: canvasRef.current,
                    setRenderError,
                    size: { width, height },
                    margins,
                    isDarkMode,
                    showPlayerCount,
                    showFxsMemory,
                    showNodeMemory,
                    ...processedData,
                });
                setErrorRetry(0);
                setRenderError('');
                console.timeEnd('drawFullPerfChart');
            } catch (error) {
                setRenderError(emsg(error) ?? 'Unknown error.');
            } finally {
                console.groupEnd();
            }
        }, [
            processedData,
            width,
            height,
            svgRef,
            canvasRef,
            renderError,
            showPlayerCount,
            showFxsMemory,
            showNodeMemory,
        ]);

        if (!width || !height) return null;
        if (renderError) {
            return (
                <div className="text-destructive-inline absolute inset-0 flex flex-col items-center justify-center gap-4 p-4 text-center font-mono text-lg">
                    Render Error: {renderError}
                    <br />
                    <Button
                        size={'sm'}
                        variant={'outline'}
                        className="text-primary"
                        onClick={() => {
                            setErrorRetry((c) => c + 1);
                            setRenderError('');
                        }}
                    >
                        Retry{errorRetry ? ` (${errorRetry})` : ''}
                    </Button>
                </div>
            );
        }
        return (
            <>
                <svg
                    ref={svgRef}
                    width={width}
                    height={height}
                    style={{
                        zIndex: 1,
                        position: 'absolute',
                        top: '0px',
                        left: '0px',
                    }}
                />
                <canvas
                    ref={canvasRef}
                    width={width - margins.left - margins.right}
                    height={height - margins.top - margins.bottom}
                    style={{
                        zIndex: 0,
                        position: 'absolute',
                        top: `${margins.top}px`,
                        left: `${margins.left}px`,
                    }}
                />
            </>
        );
    },
);

function ChartErrorMessage({ error }: { error: Error | string }) {
    const errorMessageMaps: Record<string, ReactNode> = {
        bad_request: 'Chart data loading failed: bad request.',
        invalid_thread_name: 'Chart data loading failed: invalid thread name.',
        data_unavailable: 'Chart data loading failed: data not yet available.',
        not_enough_data: (
            <p className="text-center">
                <strong>There is not enough data to display the chart just yet.</strong>
                <br />
                <span className="text-base italic">
                    The chart requires at least 30 minutes of server runtime data to be available.
                </span>
            </p>
        ),
    };

    if (typeof error === 'string') {
        return (
            <div className="text-muted-foreground absolute inset-0 flex flex-col items-center justify-center text-2xl">
                {errorMessageMaps[error] ?? 'Unknown BackendApiError'}
            </div>
        );
    } else {
        return (
            <div className="text-destructive-inline absolute inset-0 flex flex-col items-center justify-center text-2xl">
                Error: {error.message ?? 'Unknown Error'}
            </div>
        );
    }
}

export default function FullPerfCard() {
    const [chartSize, setChartSize] = useState({ width: 0, height: 0 });
    const [selectedThread, setSelectedThread] = useState<SvRtPerfThreadNamesType>('svMain');
    const [apiFailReason, setApiFailReason] = useState('');
    const [apiDataAge, setApiDataAge] = useState(0);
    const [showPlayerCount, setShowPlayerCount] = useState(true);
    const [showFxsMemory, setShowFxsMemory] = useState(false);
    const [showNodeMemory, setShowNodeMemory] = useState(false);
    const isDarkMode = useIsDarkMode();

    const chartApi = useBackendApi<PerfChartApiResp>({
        method: 'GET',
        path: `/perfChartData/:thread/`,
    });

    const swrChartApiResp = useSWR(
        `/perfChartData/${selectedThread}`,
        async () => {
            setApiFailReason('');

            const isDevMockMode = import.meta.env.DEV && isDevMockStatusOptInEnabled();
            if (isDevMockMode) {
                setApiDataAge(Date.now());
                return createMockPerfChartApiData(selectedThread);
            }

            const data = await chartApi({
                pathParams: { thread: selectedThread },
            });
            if (!data) throw new Error('empty_response');
            if ('fail_reason' in data) {
                setApiFailReason(data.fail_reason);
                return null;
            }
            setApiDataAge(Date.now());
            return data;
        },
        {
            //the data min interval is 5 mins, so we can safely cache for 1 min
            revalidateOnMount: true,
            revalidateOnFocus: false,
            refreshInterval: 60 * 1000,
        },
    );

    //Rendering
    let contentNode: React.ReactNode = null;
    if (swrChartApiResp.data) {
        contentNode = (
            <FullPerfChart
                threadName={selectedThread}
                apiData={swrChartApiResp.data as PerfChartApiSuccessResp}
                apiDataAge={apiDataAge}
                width={chartSize.width}
                height={chartSize.height}
                isDarkMode={isDarkMode}
                showPlayerCount={showPlayerCount}
                showFxsMemory={showFxsMemory}
                showNodeMemory={showNodeMemory}
            />
        );
    } else if (swrChartApiResp.isLoading) {
        contentNode = (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Loader2Icon className="text-muted-foreground size-16 animate-spin" />
            </div>
        );
    } else if (apiFailReason || swrChartApiResp.error) {
        contentNode = <ChartErrorMessage error={apiFailReason || swrChartApiResp.error} />;
    }

    return (
        <div className="bg-card fill-primary border-border/60 flex min-h-112 w-full flex-1 flex-col rounded-xl border pt-2 shadow-sm">
            <div className="flex flex-row items-center justify-between space-y-0 px-4 pb-2">
                <h3 className="text-muted-foreground/50 text-[10px] font-semibold tracking-widest uppercase">
                    Server Performance
                </h3>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="xs"
                        className={cn(
                            'h-6 gap-1 px-2 text-xs',
                            showPlayerCount ? 'text-foreground' : 'text-muted-foreground opacity-50',
                        )}
                        onClick={() => setShowPlayerCount((p) => !p)}
                        title="Toggle player count"
                    >
                        <UsersIcon className="size-3" />
                        Players
                    </Button>
                    <Button
                        variant="ghost"
                        size="xs"
                        className={cn(
                            'h-6 gap-1 px-2 text-xs',
                            showFxsMemory ? 'text-foreground' : 'text-muted-foreground opacity-50',
                        )}
                        onClick={() => setShowFxsMemory((p) => !p)}
                        title="Toggle FXServer memory"
                    >
                        <CpuIcon className="size-3" />
                        FXS Mem
                    </Button>
                    <Button
                        variant="ghost"
                        size="xs"
                        className={cn(
                            'h-6 gap-1 px-2 text-xs',
                            showNodeMemory ? 'text-foreground' : 'text-muted-foreground opacity-50',
                        )}
                        onClick={() => setShowNodeMemory((p) => !p)}
                        title="Toggle Node.js memory"
                    >
                        <MemoryStickIcon className="size-3" />
                        Node Mem
                    </Button>
                    <Select
                        value={selectedThread}
                        onValueChange={(value) => setSelectedThread(value as SvRtPerfThreadNamesType)}
                    >
                        <SelectTrigger className="h-6 w-32 grow px-3 py-1 text-sm md:grow-0">
                            <SelectValue placeholder="Select thread" />
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
                    <LineChartIcon className="text-muted-foreground/30 h-3.5 w-3.5" />
                </div>
            </div>
            <DebouncedResizeContainer onDebouncedResize={setChartSize}>{contentNode}</DebouncedResizeContainer>
        </div>
    );
}
