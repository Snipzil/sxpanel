import { memo } from 'react';
import { ResponsiveBar, type BarDatum, type BarTooltipProps } from '@nivo/bar';
import { useIsDarkMode } from '@/hooks/theme';
import type { InsightsSessionLengthBucket } from '@shared/insightsApiTypes';

function ChartTooltip({ data, value, color }: BarTooltipProps<BarDatum>) {
    return (
        <div className="bg-card text-card-foreground border-border rounded-md border p-2 text-sm shadow-md">
            <div className="font-medium">{data.label as string}</div>
            <div style={{ color }}>
                Sessions: <strong>{value}</strong>
            </div>
        </div>
    );
}

type Props = {
    buckets: InsightsSessionLengthBucket[];
};

function SessionLengthChart({ buckets }: Props) {
    const isDarkMode = useIsDarkMode();

    if (!Array.isArray(buckets) || !buckets.length) {
        return (
            <div className="text-muted-foreground flex items-center justify-center py-12 text-sm">
                No data available
            </div>
        );
    }

    const data: BarDatum[] = buckets.map((b) => ({
        label: b.label,
        count: b.count,
    }));

    return (
        <div style={{ height: 220 }}>
            <ResponsiveBar
                data={data}
                keys={['count']}
                indexBy="label"
                margin={{ top: 10, right: 10, bottom: 50, left: 40 }}
                padding={0.3}
                colors={isDarkMode ? ['#fbbf24'] : ['#d97706']}
                borderWidth={1}
                borderRadius={4}
                borderColor={{ from: 'color', modifiers: [['darker', 0.55]] }}
                axisBottom={{
                    tickSize: 5,
                    tickPadding: 5,
                    tickRotation: -30,
                }}
                axisLeft={{
                    tickSize: 5,
                    tickPadding: 5,
                    tickValues: 5,
                }}
                enableGridX={false}
                enableGridY={true}
                enableLabel={false}
                theme={{
                    text: {
                        fontSize: 11,
                        fill: isDarkMode ? '#a1a1aa' : '#71717a',
                    },
                    grid: {
                        line: {
                            strokeDasharray: '8 6',
                            stroke: '#3F4146',
                            strokeOpacity: isDarkMode ? 1 : 0.25,
                            strokeWidth: 1,
                        },
                    },
                }}
                tooltip={ChartTooltip}
                animate={true}
                motionConfig="gentle"
            />
        </div>
    );
}

export default memo(SessionLengthChart);
