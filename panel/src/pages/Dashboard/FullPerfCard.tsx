import { LineChartIcon, Loader2Icon, UsersIcon, CpuIcon, MemoryStickIcon } from 'lucide-react';
import React, { ReactNode, memo, useEffect, useMemo, useReducer, useRef } from 'react';
import DebouncedResizeContainer from '@/components/DebouncedResizeContainer';
import drawFullPerfChart from './drawFullPerfChart';
import { useBackendApi } from '@/hooks/fetch';
import type { PerfChartApiResp, SvRtPerfThreadNamesType } from '@shared/otherTypes';
import type { PerfChartApiSuccessShape } from './chartingUtils';
import useSWR from 'swr';
import {
    PerfSnapType,
    formatTickBoundary,
    getBucketTicketsEstimatedTime,
    getServerStatsData,
    getTimeWeightedHistogram,
    isPerfChartApiSuccess,
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
    apiData: PerfChartApiSuccessShape;
    apiDataAge: number;
    width: number;
    height: number;
    isDarkMode: boolean;
    showPlayerCount: boolean;
    showFxsMemory: boolean;
    showNodeMemory: boolean;
};

type FullPerfChartRenderState = {
    renderError: string;
    errorRetry: number;
};

type FullPerfChartRenderAction = { type: 'drawSuccess' } | { type: 'drawError'; error: string } | { type: 'retry' };

function reduceFullPerfChartRenderState(
    state: FullPerfChartRenderState,
    action: FullPerfChartRenderAction,
): FullPerfChartRenderState {
    switch (action.type) {
        case 'drawSuccess':
            return {
                ...state,
                renderError: '',
                errorRetry: 0,
            };
        case 'drawError':
            return {
                ...state,
                renderError: action.error,
            };
        case 'retry':
            return {
                renderError: '',
                errorRetry: state.errorRetry + 1,
            };
        default:
            return state;
    }
}

type FullPerfCardState = {
    chartSize: { width: number; height: number };
    selectedThread: SvRtPerfThreadNamesType;
    apiFailReason: string;
    apiDataAge: number;
    showPlayerCount: boolean;
    showFxsMemory: boolean;
    showNodeMemory: boolean;
};

type FullPerfCardAction =
    | { type: 'patch'; patch: Partial<FullPerfCardState> }
    | { type: 'togglePlayerCount' }
    | { type: 'toggleFxsMemory' }
    | { type: 'toggleNodeMemory' };

function reduceFullPerfCardState(state: FullPerfCardState, action: FullPerfCardAction): FullPerfCardState {
    switch (action.type) {
        case 'patch':
            return {
                ...state,
                ...action.patch,
            };
        case 'togglePlayerCount':
            return {
                ...state,
                showPlayerCount: !state.showPlayerCount,
            };
        case 'toggleFxsMemory':
            return {
                ...state,
                showFxsMemory: !state.showFxsMemory,
            };
        case 'toggleNodeMemory':
            return {
                ...state,
                showNodeMemory: !state.showNodeMemory,
            };
        default:
            return state;
    }
}

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
        const [renderState, dispatchRender] = useReducer(reduceFullPerfChartRenderState, {
            renderError: '',
            errorRetry: 0,
        });
        const { renderError, errorRetry } = renderState;
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
            if (!isPerfChartApiSuccess(apiData)) return null;
            const parsed = processPerfLog(apiData.threadPerfLog, (threadPerf) => {
                const bucketTicketsEstimatedTime = getBucketTicketsEstimatedTime(apiData.boundaries);
                return getTimeWeightedHistogram(threadPerf.buckets, bucketTicketsEstimatedTime);
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
                    setRenderError: (error) => dispatchRender({ type: 'drawError', error }),
                    size: { width, height },
                    margins,
                    isDarkMode,
                    showPlayerCount,
                    showFxsMemory,
                    showNodeMemory,
                    ...processedData,
                });
                dispatchRender({ type: 'drawSuccess' });
                console.timeEnd('drawFullPerfChart');
            } catch (error) {
                dispatchRender({ type: 'drawError', error: emsg(error) ?? 'Unknown error.' });
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
            errorRetry,
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
                        onClick={() => dispatchRender({ type: 'retry' })}
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
    const [state, dispatch] = useReducer(reduceFullPerfCardState, {
        chartSize: { width: 0, height: 0 },
        selectedThread: 'svMain',
        apiFailReason: '',
        apiDataAge: 0,
        showPlayerCount: true,
        showFxsMemory: false,
        showNodeMemory: false,
    });
    const { chartSize, selectedThread, apiFailReason, apiDataAge, showPlayerCount, showFxsMemory, showNodeMemory } =
        state;
    const isDarkMode = useIsDarkMode();

    const chartApi = useBackendApi<PerfChartApiResp>({
        method: 'GET',
        path: `/perfChartData/:thread/`,
    });

    const swrChartApiResp = useSWR(
        `/perfChartData/${selectedThread}`,
        async () => {
            dispatch({ type: 'patch', patch: { apiFailReason: '' } });

            const isDevMockMode = import.meta.env.DEV && isDevMockStatusOptInEnabled();
            if (isDevMockMode) {
                dispatch({ type: 'patch', patch: { apiDataAge: Date.now() } });
                return createMockPerfChartApiData(selectedThread);
            }

            const data = await chartApi({
                pathParams: { thread: selectedThread },
            });
            if (!data) throw new Error('empty_response');
            if ('fail_reason' in data) {
                dispatch({ type: 'patch', patch: { apiFailReason: data.fail_reason } });
                return null;
            }
            if (!isPerfChartApiSuccess(data)) {
                throw new Error('invalid_chart_response');
            }
            dispatch({ type: 'patch', patch: { apiDataAge: Date.now() } });
            return data;
        },
        {
            //the data min interval is 5 mins, so we can safely cache for 1 min
            revalidateOnMount: true,
            revalidateOnFocus: false,
            refreshInterval: 60 * 1000,
        },
    );

    return (
        <div className="bg-card fill-primary border-border/60 flex min-h-112 w-full flex-1 flex-col rounded-xl border pt-2 shadow-sm">
            <div className="flex flex-row items-center justify-between gap-y-0 px-4 pb-2">
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
                        onClick={() => dispatch({ type: 'togglePlayerCount' })}
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
                        onClick={() => dispatch({ type: 'toggleFxsMemory' })}
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
                        onClick={() => dispatch({ type: 'toggleNodeMemory' })}
                        title="Toggle Node.js memory"
                    >
                        <MemoryStickIcon className="size-3" />
                        Node Mem
                    </Button>
                    <Select
                        value={selectedThread}
                        onValueChange={(value) =>
                            dispatch({ type: 'patch', patch: { selectedThread: value as SvRtPerfThreadNamesType } })
                        }
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
                    <LineChartIcon className="text-muted-foreground/30 size-3.5" />
                </div>
            </div>
            <DebouncedResizeContainer
                onDebouncedResize={(nextChartSize) => dispatch({ type: 'patch', patch: { chartSize: nextChartSize } })}
            >
                {isPerfChartApiSuccess(swrChartApiResp.data) ? (
                    <FullPerfChart
                        threadName={selectedThread}
                        apiData={swrChartApiResp.data}
                        apiDataAge={apiDataAge}
                        width={chartSize.width}
                        height={chartSize.height}
                        isDarkMode={isDarkMode}
                        showPlayerCount={showPlayerCount}
                        showFxsMemory={showFxsMemory}
                        showNodeMemory={showNodeMemory}
                    />
                ) : swrChartApiResp.isLoading ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <Loader2Icon className="text-muted-foreground size-16 animate-spin" />
                    </div>
                ) : apiFailReason || swrChartApiResp.error ? (
                    <ChartErrorMessage error={apiFailReason || swrChartApiResp.error} />
                ) : null}
            </DebouncedResizeContainer>
        </div>
    );
}
