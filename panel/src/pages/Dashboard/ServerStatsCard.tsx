import { GaugeIcon, Loader2Icon, MemoryStickIcon, TimerIcon, TrendingUpIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { dashPerfCursorAtom, dashServerStatsAtom, dashSvRuntimeAtom, useGetDashDataAge } from './dashboardHooks';
import { cn } from '@/lib/utils';
import { dateToLocaleDateString, dateToLocaleTimeString, isDateToday } from '@/lib/dateTime';

//NOTE: null and undefined are semantically equal here
type HostStatsDataProps = {
    uptimePct: number | null | undefined;
    medianPlayerCount: number | null | undefined;
    fxsMemory: number | null | undefined;
    nodeMemory:
        | {
              used: number;
              limit: number;
          }
        | null
        | undefined;
};

type StatRowProps = {
    icon: React.ElementType;
    label: string;
    value: React.ReactNode;
    valueClass?: string | null;
    title?: string;
};
function StatRow({ icon: Icon, label, value, valueClass, title }: StatRowProps) {
    return (
        <div className="flex items-center gap-3 py-2.5" title={title}>
            <div className="bg-secondary/50 flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
                <Icon className="text-muted-foreground/60 h-3.5 w-3.5" />
            </div>
            <span className="text-muted-foreground/70 flex-1 text-xs">{label}</span>
            <span className={cn('font-mono text-sm font-semibold', valueClass ?? 'text-foreground')}>{value}</span>
        </div>
    );
}

const HostStatsData = memo(({ uptimePct, medianPlayerCount, fxsMemory, nodeMemory }: HostStatsDataProps) => {
    const uptimePart = uptimePct != null ? uptimePct.toFixed(2) + '%' : '--';
    const medianPlayerPart = medianPlayerCount != null ? String(Math.ceil(medianPlayerCount)) : '--';
    const fxsPart = fxsMemory != null ? fxsMemory.toFixed(2) + ' MB' : '--';

    let nodeCustomClass: string | null = null;
    let nodePart: React.ReactNode = '--';
    let nodeTitle = '';
    if (nodeMemory) {
        if (nodeMemory.limit > 0) {
            const pct = Math.ceil((nodeMemory.used / nodeMemory.limit) * 100);
            nodePart = `${nodeMemory.used.toFixed(2)} MB (${pct}%)`;
            nodeTitle = `${nodeMemory.used.toFixed(2)} MB / ${nodeMemory.limit} MB`;
            if (pct > 85) nodeCustomClass = 'text-destructive';
            else if (pct > 70) nodeCustomClass = 'text-warning-inline';
        } else {
            nodePart = `${nodeMemory.used.toFixed(2)} MB`;
            nodeTitle = `${nodeMemory.used.toFixed(2)} MB`;
        }
    }

    return (
        <div className="divide-border/30 flex flex-col divide-y">
            <StatRow icon={TimerIcon} label="Uptime 24h" value={uptimePart} />
            <StatRow icon={TrendingUpIcon} label="Median Players 24h" value={medianPlayerPart} />
            <StatRow icon={MemoryStickIcon} label="FXServer Memory" value={fxsPart} />
            <StatRow
                icon={MemoryStickIcon}
                label="Node.js Memory"
                value={nodePart}
                valueClass={nodeCustomClass}
                title={nodeTitle}
            />
        </div>
    );
});

export default function ServerStatsCard() {
    const pastStatsData = useAtomValue(dashServerStatsAtom);
    const svRuntimeData = useAtomValue(dashSvRuntimeAtom);
    const perfCursorData = useAtomValue(dashPerfCursorAtom);
    const getDashDataAge = useGetDashDataAge();

    const displayData = useMemo(() => {
        //Data availability & age check
        const dataAge = getDashDataAge();
        if (!svRuntimeData || dataAge.isExpired) return null;

        if (perfCursorData && perfCursorData.snap) {
            const timeStr = dateToLocaleTimeString(perfCursorData.snap.end, '2-digit', '2-digit');
            const dateStr = dateToLocaleDateString(perfCursorData.snap.end, 'short');
            const titleTimeIndicator = isDateToday(perfCursorData.snap.end) ? timeStr : `${timeStr} - ${dateStr}`;
            return {
                fxsMemory: perfCursorData.snap.fxsMemory,
                nodeMemory:
                    svRuntimeData.nodeMemory && perfCursorData.snap.nodeMemory
                        ? {
                              used: perfCursorData.snap.nodeMemory,
                              limit: svRuntimeData.nodeMemory.limit,
                          }
                        : null,
                titleTimeIndicator: (
                    <>
                        (<span className="text-warning-inline font-mono text-xs">{titleTimeIndicator}</span>)
                    </>
                ),
            };
        } else {
            return {
                fxsMemory: svRuntimeData.fxsMemory,
                nodeMemory: svRuntimeData.nodeMemory,
                titleTimeIndicator: dataAge.isStale ? '(minutes ago)' : '(live)',
            };
        }
    }, [svRuntimeData, perfCursorData, getDashDataAge]);

    //Rendering
    let titleNode: React.ReactNode = null;
    let contentNode: React.ReactNode = null;
    if (displayData) {
        titleNode = displayData.titleTimeIndicator;
        contentNode = (
            <HostStatsData
                fxsMemory={displayData.fxsMemory}
                medianPlayerCount={pastStatsData?.medianPlayerCount}
                uptimePct={pastStatsData?.uptimePct}
                nodeMemory={displayData.nodeMemory}
            />
        );
    } else {
        contentNode = (
            <div className="flex size-full flex-col items-center justify-center">
                <Loader2Icon className="text-muted-foreground size-16 animate-spin" />
            </div>
        );
    }

    return (
        <div className="bg-card border-border/60 flex h-80 max-h-80 flex-col rounded-xl border px-4 py-3 shadow-sm">
            <div className="flex flex-row items-center justify-between pb-1">
                <h3 className="text-muted-foreground/50 text-[10px] font-semibold tracking-widest uppercase">
                    Server Stats {titleNode}
                </h3>
                <GaugeIcon className="text-muted-foreground/30 h-3.5 w-3.5" />
            </div>
            {contentNode}
        </div>
    );
}
