import { memo, useCallback, useMemo, useState } from 'react';
import { Pie, DatumId, PieCustomLayerProps, ComputedDatum } from '@nivo/pie';
import { numberToLocaleString } from '@/lib/utils';
import { DoorOpenIcon, Loader2Icon } from 'lucide-react';
import { useIsDarkMode } from '@/hooks/theme';
import DebouncedResizeContainer from '@/components/DebouncedResizeContainer';
import { useAtomValue } from 'jotai';
import { dashPlayerDropAtom, useGetDashDataAge } from './dashboardHooks';
import { playerDropCategories, playerDropCategoryDefaultColor } from '@/lib/playerDropCategories';

type PlayerDropChartDatum = {
    id: string;
    label: string;
    value: number;
    count: number;
};

type PieCenterTextProps = PieCustomLayerProps<PlayerDropChartDatum> & {
    active?: ComputedDatum<PlayerDropChartDatum>;
};

const PieCenterText = ({ centerX, centerY, dataWithArc, innerRadius, active }: PieCenterTextProps) => {
    if (active) {
        return (
            <>
                <circle cx={centerX} cy={centerY} r={innerRadius * 0.95} fill={active.color} />
                <text
                    x={centerX}
                    y={centerY - 15}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="text-xl font-bold"
                    opacity={0.75}
                >
                    {active.label}:
                </text>
                <text
                    x={centerX}
                    y={centerY + 15}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="text-xl font-bold"
                    opacity={0.75}
                >
                    {numberToLocaleString(active.data.count)}
                </text>
            </>
        );
    } else {
        const totalDrops = useMemo(() => dataWithArc.reduce((acc, d) => acc + d.data.count, 0), [dataWithArc]);
        return (
            <>
                <text
                    x={centerX}
                    y={centerY - 15}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="fill-muted-foreground text-2xl font-bold"
                >
                    Total:
                </text>
                <text
                    x={centerX}
                    y={centerY + 15}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="fill-muted-foreground text-2xl font-bold"
                >
                    {numberToLocaleString(totalDrops)}
                </text>
            </>
        );
    }
};

type PlayerDropChartProps = {
    data: PlayerDropChartDatum[];
    activeId: DatumId | null;
    setActiveId: (id: DatumId | null) => void;
    width: number;
    height: number;
};

const PlayerDropChart = memo(({ data, activeId, setActiveId, width, height }: PlayerDropChartProps) => {
    const isDarkMode = useIsDarkMode();
    const [hasClicked, setHasClicked] = useState(false);
    const CenterLayer = useCallback(
        (allArgs: PieCustomLayerProps<PlayerDropChartDatum>) => {
            if (!activeId) return PieCenterText(allArgs);
            const active = allArgs.dataWithArc.find((d) => d.id === activeId);
            return PieCenterText({ ...allArgs, active });
        },
        [activeId],
    );

    if (!width || !height) return null;
    return (
        <Pie
            data={data}
            height={height}
            width={width}
            theme={{
                text: {
                    fontSize: '13px',
                    fontWeight: 600,
                },
            }}
            activeId={activeId}
            onActiveIdChange={setActiveId}
            margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
            innerRadius={0.6}
            padAngle={1.75}
            cornerRadius={4}
            activeOuterRadiusOffset={6}
            borderWidth={1}
            borderColor={
                isDarkMode
                    ? undefined
                    : {
                          from: 'data.border',
                          // modifiers: [['darker', 0.8]]
                      }
            }
            valueFormat={'.1%'}
            enableArcLinkLabels={false}
            layers={['arcs', 'arcLabels', 'arcLinkLabels', CenterLayer]}
            arcLabelsSkipAngle={20}
            arcLabelsTextColor={{
                from: 'color',
                modifiers: [['darker', 2.5]],
            }}
            onClick={(datum, event) => setHasClicked((curr) => !curr)}
            onMouseEnter={(datum, event) => setHasClicked(false)} //resets behavior
            onMouseLeave={(datum, event) => {
                hasClicked && setActiveId(datum.id);
                event.preventDefault();
            }}
            colors={{ datum: 'data.color' }}
            tooltip={() => null}
            sortByValue
        />
    );
});

export default function PlayerDropCard() {
    const [activeId, setActiveId] = useState<DatumId | null>(null);
    const [chartSize, setChartSize] = useState({ width: 0, height: 0 });
    const playerDropData = useAtomValue(dashPlayerDropAtom);
    const getDashDataAge = useGetDashDataAge();

    const chartData = useMemo(() => {
        if (!playerDropData?.summaryLast6h || !Array.isArray(playerDropData.summaryLast6h)) return null;
        const dataAge = getDashDataAge();
        if (dataAge.isExpired) return null;
        if (!playerDropData.summaryLast6h.length) return 'not_enough_data';

        const totalDrops = playerDropData.summaryLast6h.reduce((acc, d) => acc + d[1], 0);
        return playerDropData.summaryLast6h.map(([reason, count]) => ({
            id: reason,
            label: playerDropCategories[reason]?.label ?? reason,
            count,
            value: count / totalDrops,
            color: playerDropCategories[reason]?.color ?? playerDropCategoryDefaultColor,
            border: playerDropCategories[reason]?.border ?? playerDropCategoryDefaultColor,
        }));
    }, [playerDropData?.summaryLast6h]);

    const displayLegends = useMemo(() => {
        if (!playerDropData?.summaryLast6h || !Array.isArray(playerDropData.summaryLast6h)) return null;
        const dataAge = getDashDataAge();
        if (dataAge.isExpired) return null;
        if (!playerDropData.summaryLast6h.length) return null;

        return playerDropData.summaryLast6h.map(([reason, count]) => ({
            id: reason,
            label: playerDropCategories[reason]?.label ?? reason,
            color: playerDropCategories[reason]?.color ?? playerDropCategoryDefaultColor,
            border: playerDropCategories[reason]?.border ?? playerDropCategoryDefaultColor,
        }));
    }, [playerDropData?.summaryLast6h]);

    //Rendering
    let contentNode: React.ReactNode = null;
    if (typeof chartData === 'object' && chartData !== null) {
        contentNode = (
            <PlayerDropChart
                data={chartData}
                activeId={activeId}
                setActiveId={setActiveId}
                width={chartSize.width}
                height={chartSize.height}
            />
        );
    } else if (typeof chartData === 'string') {
        contentNode = (
            <div className="text-muted-foreground absolute inset-0 flex flex-col items-center justify-center text-center">
                <p className="max-w-80">No players have disconnected from the server in the last 6 hours.</p>
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
        <div className="bg-card border-border/60 flex h-80 max-h-80 flex-col rounded-xl border py-2 shadow-sm">
            <div className="flex flex-row items-center justify-between space-y-0 px-4 pb-2">
                <h3 className="text-muted-foreground/50 text-[10px] font-semibold tracking-widest uppercase">
                    Player Drops (last 6h)
                </h3>
                <DoorOpenIcon className="text-muted-foreground/30 h-3.5 w-3.5" />
            </div>
            {/* <div className='font-mono'>
                {Object.entries(playerDropCategories).map(([reason, { label, color }]) => {
                    return (
                        <div key={reason} className='w-full pl-8 text-black' style={{ backgroundColor: color }}>{color} - {label}</div>
                    )
                })}
            </div> */}
            <DebouncedResizeContainer onDebouncedResize={setChartSize}>{contentNode}</DebouncedResizeContainer>
            {displayLegends && (
                <div className="mx-auto flex flex-wrap justify-center gap-2 px-4">
                    {displayLegends.map((legend) => {
                        return (
                            <div
                                key={legend.id}
                                data-active={activeId === legend.id}
                                className="flex cursor-pointer items-center hover:underline data-[active=true]:underline"
                                onClick={() => setActiveId(activeId === legend.id ? null : legend.id)}
                            >
                                <div
                                    className="mr-1 size-4 rounded-full border-0"
                                    style={{
                                        backgroundColor: legend.color,
                                        borderColor: legend.border,
                                    }}
                                />
                                <span className="text-sm">{legend.label}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
