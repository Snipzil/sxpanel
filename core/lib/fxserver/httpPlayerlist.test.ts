import { describe, expect, it } from 'vitest';
import { buildHttpPrimaryPlayerlist, mergeHttpPlayersIntoPlayerlist, parsePlayersJson } from './httpPlayerlist';

describe('parsePlayersJson', () => {
    it('keeps valid rows and drops invalid ones', () => {
        const parsed = parsePlayersJson([
            { id: 1, name: 'RealOne', identifiers: ['license:abc'] },
            { id: 'bad', name: '' },
            { name: 'NoId' },
        ]);

        expect(parsed).toEqual([{ id: 1, name: 'RealOne', identifiers: ['license:abc'] }]);
    });
});

describe('buildHttpPrimaryPlayerlist', () => {
    it('uses the HTTP roster as source of truth and overlays FD3 rows', () => {
        const fd3Players = [
            {
                netid: 7,
                displayName: 'Admin',
                pureName: 'admin',
                ids: ['license:real'],
                license: 'real',
                tags: [],
                playTimeMinutes: 10,
                sessionTimeSeconds: 60,
            },
        ];

        const merged = buildHttpPrimaryPlayerlist(fd3Players, [
            { id: 7, name: 'Admin', identifiers: ['license:real'] },
            { id: 1, name: 'vex', identifiers: [] },
            { id: 2, name: 'ZYN', identifiers: [] },
        ]);

        expect(merged).toHaveLength(3);
        expect(merged[0]?.netid).toBe(7);
        expect(merged[0]?.playTimeMinutes).toBe(10);
        expect(merged[1]?.displayName).toBe('vex');
        expect(merged[2]?.displayName).toBe('ZYN');
    });
});

describe('mergeHttpPlayersIntoPlayerlist', () => {
    it('adds HTTP-only players without replacing FD3 rows', () => {
        const fd3Players = [
            {
                netid: 7,
                displayName: 'Admin',
                pureName: 'admin',
                ids: ['license:real'],
                license: 'real',
                tags: [],
                playTimeMinutes: 10,
                sessionTimeSeconds: 60,
            },
        ];

        const merged = mergeHttpPlayersIntoPlayerlist(fd3Players, [
            { id: 7, name: 'HTTP Duplicate', identifiers: [] },
            { id: 42, name: 'Bot Player', identifiers: ['license:0123456789abcdef0123456789abcdef01234567'] },
        ]);

        expect(merged).toHaveLength(2);
        expect(merged[0]?.netid).toBe(7);
        expect(merged[0]?.displayName).toBe('Admin');
        expect(merged[1]?.netid).toBe(42);
        expect(merged[1]?.displayName).toBe('Bot Player');
        expect(merged[1]?.license).toBe('0123456789abcdef0123456789abcdef01234567');
    });
});
