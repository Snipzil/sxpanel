import { PERF_DATA_BUCKET_COUNT, STATS_LOG_SIZE_LIMIT, STATS_RESOLUTION_TABLE } from './config';
import type { SvRtLogDataType, SvRtLogType } from './perfSchemas';

//Consts
const YIELD_INTERVAL = 100;

/**
 * Combines an array of adjacent data entries into a single entry.
 * Perf counts/sums are summed, players/memory are averaged.
 */
const combineDataEntries = (entries: SvRtLogDataType[]): SvRtLogDataType => {
    const last = entries.at(-1)!;
    const count = entries.length;

    let totalPlayers = 0;
    let totalFxsMemory = 0;
    let fxsMemoryCount = 0;
    let totalNodeMemory = 0;
    let nodeMemoryCount = 0;

    const combinedPerf = {
        svMain: { count: 0, sum: 0, buckets: new Array(PERF_DATA_BUCKET_COUNT).fill(0) },
        svNetwork: { count: 0, sum: 0, buckets: new Array(PERF_DATA_BUCKET_COUNT).fill(0) },
        svSync: { count: 0, sum: 0, buckets: new Array(PERF_DATA_BUCKET_COUNT).fill(0) },
    };

    for (const entry of entries) {
        totalPlayers += entry.players;
        if (entry.fxsMemory !== null) {
            totalFxsMemory += entry.fxsMemory;
            fxsMemoryCount++;
        }
        if (entry.nodeMemory !== null) {
            totalNodeMemory += entry.nodeMemory;
            nodeMemoryCount++;
        }
        for (const thread of ['svMain', 'svNetwork', 'svSync'] as const) {
            combinedPerf[thread].count += entry.perf[thread].count;
            combinedPerf[thread].sum += entry.perf[thread].sum;
            for (let b = 0; b < PERF_DATA_BUCKET_COUNT; b++) {
                combinedPerf[thread].buckets[b] += entry.perf[thread].buckets[b];
            }
        }
    }

    return {
        ts: last.ts,
        type: 'data',
        players: Math.round(totalPlayers / count),
        fxsMemory: fxsMemoryCount ? Math.round(totalFxsMemory / fxsMemoryCount) : null,
        nodeMemory: nodeMemoryCount ? Math.round(totalNodeMemory / nodeMemoryCount) : null,
        perf: combinedPerf,
    };
};

/**
 * Gets the target resolution for a given timestamp based on its age.
 * Returns null if the entry is older than the retention window and should be dropped.
 */
const getTargetResolution = (ts: number, now: number) => {
    const age = now - ts;
    for (const tier of STATS_RESOLUTION_TABLE) {
        if (age <= tier.maxAge) {
            return tier.resolution;
        }
    }
    return null;
};

/**
 * Rounds a timestamp down to the nearest resolution boundary.
 */
const alignToResolution = (ts: number, resolution: number) => {
    return Math.floor(ts / resolution) * resolution;
};

/**
 * Optimizes (in place) the stats log by removing old data and combining snaps to match the resolution.
 * - Entries within 0-12h are kept at 5min resolution (untouched).
 * - Entries within 12-24h are combined to 15min resolution.
 * - Entries within 24-96h are combined to 30min resolution.
 * - Entries older than 96h are dropped.
 * - Boot/close events are always preserved.
 */
export const optimizeSvRuntimeLog = async (statsLog: SvRtLogType) => {
    //Trim to size limit first
    if (statsLog.length > STATS_LOG_SIZE_LIMIT) {
        statsLog.splice(0, statsLog.length - STATS_LOG_SIZE_LIMIT);
    }

    const now = Date.now();
    const initialResolution = STATS_RESOLUTION_TABLE[0].resolution;
    const result: SvRtLogType = [];
    let pendingDataEntries: SvRtLogDataType[] = [];
    let pendingAlignedTs: number | null = null;
    let pendingResolution: number | null = null;

    const flushPending = () => {
        if (!pendingDataEntries.length) return;
        if (pendingDataEntries.length === 1) {
            result.push(pendingDataEntries[0]);
        } else {
            result.push(combineDataEntries(pendingDataEntries));
        }
        pendingDataEntries = [];
        pendingAlignedTs = null;
        pendingResolution = null;
    };

    for (let i = 0; i < statsLog.length; i++) {
        const entry = statsLog[i];

        // Yield every YIELD_INTERVAL iterations
        if (i % YIELD_INTERVAL === 0 && i > 0) {
            await new Promise((resolve) => setImmediate(resolve));
        }

        // Non-data entries flush pending and pass through
        if (entry.type !== 'data') {
            flushPending();
            result.push(entry);
            continue;
        }

        const targetResolution = getTargetResolution(entry.ts, now);

        // Older than the retention window - drop it instead of combining forever
        if (targetResolution === null) {
            flushPending();
            continue;
        }

        // Keep recent entries (initial resolution tier) as-is
        if (targetResolution <= initialResolution) {
            flushPending();
            result.push(entry);
            continue;
        }

        const alignedTs = alignToResolution(entry.ts, targetResolution);

        // If same aligned bucket and same resolution, accumulate
        if (pendingAlignedTs === alignedTs && pendingResolution === targetResolution) {
            pendingDataEntries.push(entry);
            continue;
        }

        // Different bucket, flush previous and start new
        flushPending();
        pendingDataEntries = [entry];
        pendingAlignedTs = alignedTs;
        pendingResolution = targetResolution;
    }

    // Flush any remaining entries
    flushPending();

    // Replace in-place
    statsLog.length = 0;
    statsLog.push(...result);
};
