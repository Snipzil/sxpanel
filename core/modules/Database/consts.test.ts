import { suite, it, expect } from 'vitest';
import { DATABASE_VERSION, defaultDatabase } from './consts';

suite('Database consts', () => {
    it('should have a positive integer DATABASE_VERSION', () => {
        expect(DATABASE_VERSION).toBeGreaterThan(0);
        expect(Number.isInteger(DATABASE_VERSION)).toBe(true);
    });

    it('should have a defaultDatabase with correct version', () => {
        expect(defaultDatabase.version).toBe(DATABASE_VERSION);
    });

    it('should have all expected empty collections', () => {
        expect(defaultDatabase.actions).toEqual([]);
        expect(defaultDatabase.players).toEqual([]);
        expect(defaultDatabase.whitelistApprovals).toEqual([]);
        expect(defaultDatabase.whitelistRequests).toEqual([]);
        expect(defaultDatabase.tickets).toEqual([]);
        expect(defaultDatabase.botCommandEvents).toEqual([]);
    });

    it('defaultDatabase collections should not share references', () => {
        expect(defaultDatabase.actions).not.toBe(defaultDatabase.players);
        expect(defaultDatabase.players).not.toBe(defaultDatabase.whitelistApprovals);
        expect(defaultDatabase.tickets).not.toBe(defaultDatabase.botCommandEvents);
    });
});
