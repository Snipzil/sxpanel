import { describe, expect, it } from 'vitest';
import { buildResourceSyncPayload, resolveReportedSnapshot } from './reportedPlayerSnapshot';

describe('resolveReportedSnapshot', () => {
    it('is deterministic for the same id and seed', () => {
        const a = resolveReportedSnapshot(42, 'Test', undefined, 'mutex-a');
        const b = resolveReportedSnapshot(42, 'Test', undefined, 'mutex-a');
        expect(a).toEqual(b);
    });

    it('honors pushed health and vType', () => {
        const resolved = resolveReportedSnapshot(1, 'A', { health: 55, vType: 4 }, 'seed');
        expect(resolved.health).toBe(55);
        expect(resolved.vType).toBe(4);
    });

    it('honors pushed coords when both x and y are set', () => {
        const resolved = resolveReportedSnapshot(1, 'A', { x: 100.4, y: -200.6 }, 'seed');
        expect(resolved.x).toBe(100);
        expect(resolved.y).toBe(-201);
    });

    it('clamps health into 0-100', () => {
        expect(resolveReportedSnapshot(1, 'A', { health: 150 }, 'seed').health).toBe(100);
        expect(resolveReportedSnapshot(1, 'A', { health: -5 }, 'seed').health).toBe(0);
    });

    it('does not synthesize coords when omitted', () => {
        const resolved = resolveReportedSnapshot(99, 'Ghost', undefined, 'seed');
        expect(resolved.x).toBeUndefined();
        expect(resolved.y).toBeUndefined();
        expect(resolved.health).toBeGreaterThanOrEqual(68);
        expect(resolved.health).toBeLessThanOrEqual(100);
    });
});

describe('buildResourceSyncPayload', () => {
    it('maps roster rows to resource sync entries', () => {
        const payload = buildResourceSyncPayload(
            [{ id: 7, name: 'Row', health: 80, x: 10, y: 20, vType: 1 }],
            'seed',
        );
        expect(payload).toEqual([{ id: 7, name: 'Row', health: 80, vType: 1, x: 10, y: 20 }]);
    });
});
