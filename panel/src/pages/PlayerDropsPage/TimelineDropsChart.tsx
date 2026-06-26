import { memo, useEffect, useReducer, useRef } from 'react';
import { useIsDarkMode } from '@/hooks/theme';
import { Button } from '@/components/ui/button';
import drawDropsTimeline, { TimelineDropsDatum } from './drawDropsTimeline';
import { playerDropCategories } from '@/lib/playerDropCategories';
import { PlayerDropsMessage } from './PlayerDropsGenericSubcards';
import { DrilldownRangeSelectionType } from '@/pages/PlayerDropsPage/playerDropsTypes';
import { emsg } from '@shared/emsg';

export type TimelineDropsChartData = {
    displayLod: string;
    startDate: Date;
    endDate: Date;
    maxDrops: number;
    categoriesSorted: string[];
    log: TimelineDropsDatum[];
};

const ChartLabels = memo(({ categories }: { categories: string[] }) => {
    const categoriesReversed = categories.slice().reverse();
    return categoriesReversed.map((catName) => {
        return (
            <div key={catName} className="flex items-center text-sm">
                <div
                    className="mr-1 size-4 rounded-full border-0"
                    style={{
                        backgroundColor: playerDropCategories[catName].color,
                        borderColor: playerDropCategories[catName].border,
                    }}
                />
                <span className="tracking-wider">{playerDropCategories[catName].label}:</span>
                <div className="text-muted-foreground min-w-[3ch] grow text-right font-semibold">
                    <span data-category={catName} />
                </div>
            </div>
        );
    });
});

type TimelineDropsChartProps = {
    chartData: TimelineDropsChartData;
    chartName: string;
    width: number;
    height: number;
    rangeSelected: DrilldownRangeSelectionType;
    rangeSetter: (range: DrilldownRangeSelectionType) => void;
};

type TimelineDropsChartRenderState = {
    renderError: string;
    errorRetry: number;
};

type TimelineDropsChartRenderAction =
    | { type: 'drawSuccess' }
    | { type: 'drawError'; error: string }
    | { type: 'retry' };

function reduceTimelineDropsChartRenderState(
    state: TimelineDropsChartRenderState,
    action: TimelineDropsChartRenderAction,
): TimelineDropsChartRenderState {
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

function TimelineDropsChart({
    chartData,
    chartName,
    width,
    height,
    rangeSelected,
    rangeSetter,
}: TimelineDropsChartProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const legendRef = useRef<HTMLDivElement>(null);
    const [renderState, dispatchRender] = useReducer(reduceTimelineDropsChartRenderState, {
        renderError: '',
        errorRetry: 0,
    });
    const { renderError, errorRetry } = renderState;
    const isDarkMode = useIsDarkMode();
    const margins = {
        top: 8,
        right: 8,
        bottom: 24,
        left: 42,
        axis: 1,
    };

    //Redraw chart when data or size changes
    useEffect(() => {
        if (!chartData || !legendRef.current || !svgRef.current || !canvasRef.current || !width || !height) return;
        if (!chartData.log.length) return; //only in case somehow the api returned, but no data found
        try {
            console.groupCollapsed(`Drawing player ${chartName} drops:`);
            console.time(`drawDropsTimeline-${chartName}`);
            drawDropsTimeline({
                chartName,
                legendRef: legendRef.current,
                svgRef: svgRef.current,
                canvasRef: canvasRef.current,
                size: { width, height },
                rangeSelected,
                margins,
                isDarkMode,
                data: chartData,
                setRenderError: (error) => dispatchRender({ type: 'drawError', error }),
                rangeSetter,
            });
            dispatchRender({ type: 'drawSuccess' });
            console.timeEnd(`drawDropsTimeline-${chartName}`);
        } catch (error) {
            dispatchRender({ type: 'drawError', error: emsg(error) ?? 'Unknown error.' });
        } finally {
            console.groupEnd();
        }
    }, [
        chartData,
        chartName,
        width,
        height,
        rangeSelected,
        rangeSetter,
        isDarkMode,
        legendRef,
        svgRef,
        canvasRef,
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
    } else if (!chartData.maxDrops) {
        return <PlayerDropsMessage message="No players disconnected from your server recently." />;
    }
    return (
        <>
            <div
                ref={legendRef}
                style={{
                    zIndex: 2,
                    position: 'absolute',
                    top: `12px`,
                    opacity: 0,
                }}
                className="pointer-events-none rounded-md border bg-zinc-800/90 p-2 shadow-lg transition-all"
            >
                <ChartLabels categories={chartData.categoriesSorted} />
                <div className="change-flag bg-card/75 mt-1 w-full rounded-md border text-center text-xs tracking-wider" />
            </div>
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
                width={(width - margins.left - margins.right) * (window.devicePixelRatio || 1)}
                height={(height - margins.top - margins.bottom) * (window.devicePixelRatio || 1)}
                style={{
                    zIndex: 0,
                    position: 'absolute',
                    top: `${margins.top}px`,
                    left: `${margins.left}px`,
                    width: `${width - margins.left - margins.right}px`,
                    height: `${height - margins.top - margins.bottom}px`,
                }}
            />
        </>
    );
}

export default memo(TimelineDropsChart);
