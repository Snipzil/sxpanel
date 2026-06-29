import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    gotGet: vi.fn(),
}));

vi.mock('@lib/got', () => {
    const got = vi.fn(() => ({
        json: vi.fn().mockResolvedValue({ Data: { players: [] } }),
    }));
    return {
        default: Object.assign(got, {
            get: mocks.gotGet,
        }),
    };
});

const HTTP_CLIENTS_CACHE_KEY = 'fxsRuntime:httpReportedClients';

const stubRuntime = (onlineCount = 0) => {
    const cache = new Map<string, unknown>();
    vi.stubGlobal('txConfig', {
        restarter: {
            disableHealthCheck: false,
            httpPlayerlistHost: '',
        },
    });
    vi.stubGlobal('txCore', {
        cacheStore: {
            get: vi.fn((key: string) => cache.get(key)),
            set: vi.fn((key: string, value: unknown) => {
                cache.set(key, value);
            }),
            delete: vi.fn((key: string) => {
                cache.delete(key);
            }),
        },
        fxPlayerlist: {
            onlineCount,
        },
    });
    return cache;
};

const mockPlayersJson = (players: unknown[]) => {
    mocks.gotGet.mockResolvedValue({
        statusCode: 200,
        body: JSON.stringify(players),
    });
};

describe('HTTP playerlist cache', () => {
    beforeEach(() => {
        vi.resetModules();
        mocks.gotGet.mockReset();
    });

    it('clears stale HTTP players when reported clients reaches the FD3 count', async () => {
        const cache = stubRuntime(0);
        const { fetchAndCachePlayersJson, getCachedHttpPlayers } = await import('./httpHealthCheck');

        mockPlayersJson([{ id: 12, name: 'Leaving Player', identifiers: ['license:abc'] }]);
        await fetchAndCachePlayersJson('127.0.0.1:30120');
        expect(getCachedHttpPlayers()).toHaveLength(1);

        cache.set(HTTP_CLIENTS_CACHE_KEY, 0);
        mockPlayersJson([]);
        await fetchAndCachePlayersJson('127.0.0.1:30120');

        expect(getCachedHttpPlayers()).toEqual([]);
    });

    it('keeps the last HTTP roster during empty polls while reported clients still exceed FD3', async () => {
        stubRuntime(0);
        const { fetchAndCachePlayersJson, getCachedHttpPlayers } = await import('./httpHealthCheck');

        mockPlayersJson([{ id: 12, name: 'Still Reported', identifiers: ['license:abc'] }]);
        await fetchAndCachePlayersJson('127.0.0.1:30120');

        mockPlayersJson([]);
        await fetchAndCachePlayersJson('127.0.0.1:30120');

        expect(getCachedHttpPlayers()).toEqual([{ id: 12, name: 'Still Reported', identifiers: ['license:abc'] }]);
    });

    it('removes a dropped netid from the HTTP cache immediately', async () => {
        stubRuntime(0);
        const { fetchAndCachePlayersJson, getCachedHttpPlayers, getCachedHttpPlayerCount, removeCachedHttpPlayer } =
            await import('./httpHealthCheck');

        mockPlayersJson([
            { id: 12, name: 'Leaving Player', identifiers: ['license:abc'] },
            { id: 13, name: 'Remaining Player', identifiers: ['license:def'] },
        ]);
        await fetchAndCachePlayersJson('127.0.0.1:30120');

        expect(removeCachedHttpPlayer(12)).toBe(true);
        expect(getCachedHttpPlayers()).toEqual([{ id: 13, name: 'Remaining Player', identifiers: ['license:def'] }]);
        expect(getCachedHttpPlayerCount()).toBe(1);
        expect(removeCachedHttpPlayer(99)).toBe(false);
    });
});
