import type { SvRtPerfThreadNamesType } from '@shared/otherTypes';

export type PerfSnapType = {
    start: Date;
    end: Date;
    players: number;
    fxsMemory: number | null;
    nodeMemory: number | null;
    weightedPerf: number[];
};

export type DashboardServerStatsDataType = {
    uptimePct?: number;
    medianPlayerCount?: number;
};

export type DashboardPerfCursorDataType = {
    threadName: SvRtPerfThreadNamesType;
    snap: PerfSnapType;
};
