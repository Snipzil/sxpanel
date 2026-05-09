import { memo } from 'react';
import { ResponsiveLine, type Serie, type SliceTooltipProps } from '@nivo/line';
import { useIsDarkMode } from '@/hooks/theme';
import type { InsightsPlayerCountPoint } from '@shared/insightsApiTypes';
import { dateToLocaleTimeString, dateToLocaleDateString, isDateToday } from '@/lib/dateTime';

const formatTs = (ts: number) => {
    const d = new Date(ts);
    if (isDateToday(d)) return dateToLocaleTimeString(d, '2-digit', '2-digit');
    return dateToLocaleDateString(d, 'short') + ' ' + dateToLocaleTimeString(d, '2-digit', '2-digit');
};

const formatMemory = (mb: number) => {
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${Math.round(mb)} MB`;
};

function ChartTooltip({ slice }: SliceTooltipProps) {
    if (!slice.points.length) return null;
    const ts = slice.points[0]?.data.x as number;
    return (
        <div className="bg-card text-card-foreground border-border rounded-md border p-2 text-sm shadow-md">
            <div className="font-medium">{formatTs(ts)}</div>
            {slice.points.map((point) => (
                <div key={point.id} style={{ color: point.serieColor }}>
                    {point.serieId}:{' '}
                    <strong>
                        {point.serieId === 'Players' ? point.data.yFormatted : formatMemory(point.data.y as number)}
                    </strong>
                </div>
            ))}
        </div>
    );
}

type Props = {
    series: InsightsPlayerCountPoint[];
};

function PlayerCountChart({ series }: Props) {
    const isDarkMode = useIsDarkMode();

    const chartTheme = {
        text: { fill: isDarkMode ? '#a1a1aa' : '#52525b' },
        axis: {
            ticks: { text: { fill: isDarkMode ? '#a1a1aa' : '#52525b', fontSize: 11 } },
        },
        grid: {
            line: { stroke: isDarkMode ? '#27272a' : '#e4e4e7', strokeWidth: 1 },
        },
        crosshair: {
            line: { stroke: isDarkMode ? '#71717a' : '#a1a1aa', strokeWidth: 1 },
        },
    };

    if (!Array.isArray(series) || !series.length) {
        return (
            <div className="text-muted-foreground flex items-center justify-center py-12 text-sm">
                No data available
            </div>
        );
    }

    const playerData: Serie = {
        id: 'Players',
        data: series.map((p) => ({ x: p.ts, y: p.players })),
    };
    const memoryPoints = series.filter(
        (p): p is InsightsPlayerCountPoint & { fxsMemory: number } => p.fxsMemory !== null,
    );
    const memoryData: Serie | null = memoryPoints.length
        ? {
              id: 'FXS Memory',
              data: memoryPoints.map((p) => ({ x: p.ts, y: p.fxsMemory })),
          }
        : null;

    return (
        <div className="space-y-3">
            <div>
                <div className="text-muted-foreground mb-1 px-1 text-[11px] tracking-wider uppercase">Players</div>
                <div style={{ height: 220 }}>
                    <ResponsiveLine
                        data={[playerData]}
                        margin={{ top: 10, right: 20, bottom: 34, left: 46 }}
                        xScale={{ type: 'linear', min: 'auto', max: 'auto' }}
                        yScale={{ type: 'linear', min: 0, stacked: false }}
                        curve="catmullRom"
                        colors={isDarkMode ? ['#4cc9f0'] : ['#0284c7']}
                        lineWidth={3}
                        enablePoints={false}
                        enableArea={true}
                        areaOpacity={isDarkMode ? 0.22 : 0.14}
                        enableGridX={false}
                        enableGridY={true}
                        axisBottom={{
                            tickSize: 5,
                            tickPadding: 5,
                            format: (v) => formatTs(v as number),
                            tickValues: 5,
                        }}
                        axisLeft={{
                            tickSize: 5,
                            tickPadding: 5,
                            tickValues: 5,
                        }}
                        theme={chartTheme}
                        useMesh={true}
                        enableSlices="x"
                        sliceTooltip={ChartTooltip}
                    />
                </div>
            </div>
            {memoryData && (
                <div>
                    <div className="text-muted-foreground mb-1 px-1 text-[11px] tracking-wider uppercase">
                        FXServer Memory
                    </div>
                    <div style={{ height: 130 }}>
                        <ResponsiveLine
                            data={[memoryData]}
                            margin={{ top: 8, right: 20, bottom: 24, left: 52 }}
                            xScale={{ type: 'linear', min: 'auto', max: 'auto' }}
                            yScale={{ type: 'linear', min: 'auto', max: 'auto', stacked: false }}
                            curve="catmullRom"
                            colors={isDarkMode ? ['#f72585'] : ['#be185d']}
                            lineWidth={2.5}
                            enablePoints={false}
                            enableArea={true}
                            areaOpacity={isDarkMode ? 0.2 : 0.12}
                            enableGridX={false}
                            enableGridY={true}
                            axisBottom={null}
                            axisLeft={{
                                tickSize: 5,
                                tickPadding: 5,
                                tickValues: 4,
                                format: (v) => formatMemory(v as number),
                            }}
                            theme={chartTheme}
                            useMesh={true}
                            enableSlices="x"
                            sliceTooltip={ChartTooltip}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

export default memo(PlayerCountChart);
