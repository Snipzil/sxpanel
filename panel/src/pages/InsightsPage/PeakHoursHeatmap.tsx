import { Fragment, memo, useMemo } from 'react';
import type { InsightsPeakHoursCell } from '@shared/insightsApiTypes';

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const getHeatColor = (value: number, max: number) => {
    if (max === 0) return 'rgb(39,39,42)';
    const ratio = value / max;
    // Deep slate -> cyan -> warm highlight
    const r = Math.round(31 + (251 - 31) * Math.pow(ratio, 1.15));
    const g = Math.round(41 + (191 - 41) * ratio);
    const b = Math.round(55 + (36 - 55) * Math.pow(ratio, 0.75));
    return `rgb(${r},${g},${b})`;
};

type Props = {
    cells: InsightsPeakHoursCell[];
    maxAvg: number;
};

function PeakHoursHeatmap({ cells, maxAvg }: Props) {
    // Build grid lookup: [dow][hour] = avgPlayers
    const grid = useMemo(() => {
        const g: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
        for (const cell of cells) {
            g[cell.dayOfWeek][cell.hour] = cell.avgPlayers;
        }
        return g;
    }, [cells]);

    if (!cells.length) {
        return (
            <div className="text-muted-foreground flex items-center justify-center py-12 text-sm">
                No data available
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <div className="inline-grid gap-[2px]" style={{ gridTemplateColumns: `auto repeat(24, 1fr)` }}>
                {/* Hour header row */}
                <div />
                {Array.from({ length: 24 }, (_, hour) => hour).map((hour) => (
                    <div key={hour} className="text-muted-foreground w-6 text-center text-[10px] select-none">
                        {hour}
                    </div>
                ))}

                {/* Data rows */}
                {dayLabels.map((label, dow) => (
                    <Fragment key={`day-${label}`}>
                        <div className="text-muted-foreground flex items-center pr-1 text-[10px] select-none">
                            {label}
                        </div>
                        {Array.from({ length: 24 }, (_, hour) => hour).map((hour) => {
                            const value = grid[dow][hour];
                            return (
                                <div
                                    key={`${label}-${hour}`}
                                    className="group relative h-5 w-6 cursor-default rounded-sm"
                                    style={{ backgroundColor: getHeatColor(value, maxAvg) }}
                                >
                                    <div className="bg-card text-card-foreground border-border absolute bottom-full left-1/2 z-50 mb-1 hidden -translate-x-1/2 rounded border px-2 py-1 text-xs whitespace-nowrap shadow-md group-hover:block">
                                        {label} {String(hour).padStart(2, '0')}:00, <strong>{value}</strong> avg players
                                    </div>
                                </div>
                            );
                        })}
                    </Fragment>
                ))}
            </div>

            {/* Legend */}
            <div className="text-muted-foreground mt-2 flex items-center justify-end gap-1 text-[10px]">
                <span>0</span>
                <div className="flex h-3 overflow-hidden rounded">
                    {Array.from({ length: 6 }, (_, step) => step / 5).map((ratio) => (
                        <div
                            key={`legend-${ratio}`}
                            className="h-3 w-4"
                            style={{ backgroundColor: getHeatColor(ratio * maxAvg, maxAvg) }}
                        />
                    ))}
                </div>
                <span>{maxAvg}</span>
            </div>
        </div>
    );
}

export default memo(PeakHoursHeatmap);
