import { expect, it, suite } from 'vitest';
import { optimizeSvRuntimeLog } from './logOptimizer';
import { PERF_DATA_BUCKET_COUNT } from './config';
import type { SvRtLogDataType, SvRtLogType } from './perfSchemas';

const makeDataEntry = (ts: number): SvRtLogDataType => ({
    ts,
    type: 'data',
    players: 1,
    fxsMemory: null,
    nodeMemory: null,
    perf: {
        svMain: { count: 1, sum: 1, buckets: new Array(PERF_DATA_BUCKET_COUNT).fill(0) },
        svNetwork: { count: 1, sum: 1, buckets: new Array(PERF_DATA_BUCKET_COUNT).fill(0) },
        svSync: { count: 1, sum: 1, buckets: new Array(PERF_DATA_BUCKET_COUNT).fill(0) },
    },
});

suite('optimizeSvRuntimeLog', () => {
    it('drops data entries older than the retention window (96h) instead of combining forever', async () => {
        const now = Date.now();
        const hoursMs = 60 * 60 * 1000;
        const statsLog: SvRtLogType = [
            makeDataEntry(now - 200 * hoursMs), //way past retention, should be dropped
            makeDataEntry(now - 100 * hoursMs), //past retention, should be dropped
            makeDataEntry(now - 1 * hoursMs), //recent, should be kept
        ];

        await optimizeSvRuntimeLog(statsLog);

        expect(statsLog.length).toBe(1);
        expect(statsLog[0].ts).toBe(now - 1 * hoursMs);
    });

    it('keeps boot/close events regardless of age', async () => {
        const now = Date.now();
        const hoursMs = 60 * 60 * 1000;
        const statsLog: SvRtLogType = [
            { ts: now - 300 * hoursMs, type: 'svBoot', duration: 1000 },
            makeDataEntry(now - 200 * hoursMs), //dropped
            { ts: now - 150 * hoursMs, type: 'svClose', reason: 'test' },
            makeDataEntry(now - 1 * hoursMs), //kept
        ];

        await optimizeSvRuntimeLog(statsLog);

        expect(statsLog.map((e) => e.type)).toEqual(['svBoot', 'svClose', 'data']);
    });

    it('does not indefinitely grow when repeatedly optimizing old combined entries', async () => {
        const now = Date.now();
        const hoursMs = 60 * 60 * 1000;
        //Simulate many weeks worth of already-combined 30min entries beyond the retention window
        const statsLog: SvRtLogType = [];
        for (let h = 200; h > 96; h -= 0.5) {
            statsLog.push(makeDataEntry(now - h * hoursMs));
        }
        statsLog.push(makeDataEntry(now - 1 * hoursMs));

        await optimizeSvRuntimeLog(statsLog);

        expect(statsLog.length).toBe(1);
    });
});
