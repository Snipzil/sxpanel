import type {
    PlayersStatsResp,
    PlayersTablePlayerType,
    PlayersTableSearchResp,
    PlayersTableSortingType,
} from '@shared/playerApiTypes';

const DEV_PLAYERS_PAGE_SIZE = 64;

const NAME_A = [
    'Neon',
    'Silver',
    'Turbo',
    'Mango',
    'Dusty',
    'Echo',
    'Lucky',
    'Rogue',
    'Pixel',
    'Nova',
    'Crimson',
    'Kilo',
    'Blaze',
    'Orbit',
    'Sable',
] as const;

const NAME_B = [
    'Fox',
    'Drift',
    'Rider',
    'Bandit',
    'Nomad',
    'Comet',
    'Falcon',
    'Warden',
    'Scout',
    'Pilot',
    'Viking',
    'Cipher',
    'Titan',
    'Phantom',
    'Maverick',
] as const;

const NOTES = [
    'Helpful community member.',
    'Frequent event host.',
    'Needs reminder about safe driving rules.',
    'Strong RP quality and positive reports.',
    'Prefers economy gameplay loops.',
    'Returning veteran from last season.',
] as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const makePlayer = (idx: number): PlayersTablePlayerType => {
    const id = idx + 1;
    const now = Date.now();
    const joinDaysAgo = 2 + ((id * 17) % 220);
    const joinedAt = now - joinDaysAgo * 24 * 60 * 60 * 1000 - ((id * 193) % (20 * 60 * 60 * 1000));
    const online = id % 3 !== 0;
    const lastConnection = online ? now - ((id * 41) % (25 * 60 * 1000)) : now - (1 + ((id * 9) % 12)) * 60 * 60 * 1000;
    const playTimeMinutes = clamp(joinDaysAgo * (25 + (id % 90)), 120, 58_000);
    const isAdmin = id % 23 === 0;
    const isWhitelisted = id % 4 !== 0;
    const banCount = id % 19 === 0 ? 1 + (id % 3) : id % 14 === 0 ? 1 : 0;
    const isBanned = banCount > 0 && id % 19 === 0;
    const warnCount = id % 6 === 0 ? 1 + (id % 4) : id % 10 === 0 ? 1 : 0;

    const tags: string[] = [];
    if (isAdmin) tags.push('staff');
    if (warnCount >= 2 || isBanned) tags.push('problematic');
    if (joinDaysAgo < 10) tags.push('newplayer');

    const displayName = `${NAME_A[id % NAME_A.length]}${NAME_B[(id + 3) % NAME_B.length]}${String(1000 + id).slice(-3)}`;
    const notes = id % 5 === 0 ? NOTES[id % NOTES.length] : '';

    return {
        license: `license:${id.toString(16).padStart(10, '0')}`,
        displayName,
        playTime: playTimeMinutes,
        tsJoined: joinedAt,
        tsLastConnection: lastConnection,
        notes,
        tags,
        isAdmin,
        isOnline: online,
        isWhitelisted,
        isBanned,
        warnCount,
        banCount,
    };
};

const DEV_PLAYERS: PlayersTablePlayerType[] = Array.from({ length: 420 }, (_, idx) => makePlayer(idx));

const filterBySearch = (players: PlayersTablePlayerType[], searchValue: string, searchType: string) => {
    const query = searchValue.trim().toLowerCase();
    if (!query.length) return players;

    if (searchType === 'playerName') {
        return players.filter((p) => p.displayName.toLowerCase().includes(query));
    }

    if (searchType === 'playerNotes') {
        return players.filter((p) => (p.notes || '').toLowerCase().includes(query));
    }

    if (searchType === 'playerIds') {
        const ids = query.split(/[\s,]+/).flatMap((id) => {
            const trimmedId = id.trim();
            return trimmedId ? [trimmedId] : [];
        });
        if (!ids.length) return players;

        return players.filter((p) => {
            const normalizedLicense = p.license.toLowerCase();
            const hexPart = p.license.slice(8);
            const parsed = parseInt(hexPart, 16);
            const discord = Number.isNaN(parsed)
                ? ''
                : `discord:${(900000000000000000n + BigInt(parsed)).toString()}`.toLowerCase();
            const idSet = [normalizedLicense, discord, p.displayName.toLowerCase()].flatMap((id) => (id ? [id] : []));
            return ids.some((needle) => idSet.some((id) => id.includes(needle)));
        });
    }

    return players;
};

const filterByFlags = (players: PlayersTablePlayerType[], filtersCsv?: string) => {
    if (!filtersCsv?.length) return players;
    const filters = new Set(
        filtersCsv.split(',').flatMap((filterValue) => {
            const trimmedFilter = filterValue.trim();
            return trimmedFilter ? [trimmedFilter] : [];
        }),
    );

    return players.filter((p) => {
        if (filters.has('isAdmin') && !p.isAdmin) return false;
        if (filters.has('isOnline') && !p.isOnline) return false;
        if (filters.has('isWhitelisted') && !p.isWhitelisted) return false;
        if (filters.has('hasNote') && !(p.notes && p.notes.length)) return false;
        if (filters.has('isBanned') && !p.isBanned) return false;
        if (filters.has('hasPreviousBan') && p.banCount < 1) return false;
        return true;
    });
};

const sortPlayers = (players: PlayersTablePlayerType[], sorting: PlayersTableSortingType) => {
    const sorted = [...players].sort((a, b) => {
        const aVal = a[sorting.key];
        const bVal = b[sorting.key];
        if (aVal === bVal) {
            return a.license.localeCompare(b.license);
        }
        const cmp = aVal < bVal ? -1 : 1;
        return sorting.desc ? -cmp : cmp;
    });
    return sorted;
};

export const getMockPlayersStats = (): PlayersStatsResp => {
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    return {
        total: DEV_PLAYERS.length,
        playedLast24h: DEV_PLAYERS.filter((p) => p.tsLastConnection >= dayAgo).length,
        joinedLast24h: DEV_PLAYERS.filter((p) => p.tsJoined >= dayAgo).length,
        joinedLast7d: DEV_PLAYERS.filter((p) => p.tsJoined >= weekAgo).length,
    };
};

export const searchMockPlayers = async (queryParams: {
    sortingKey?: string | number | boolean;
    sortingDesc?: string | number | boolean;
    searchValue?: string | number | boolean;
    searchType?: string | number | boolean;
    filters?: string | number | boolean;
    offsetLicense?: string | number | boolean;
}): Promise<PlayersTableSearchResp> => {
    const allowedSortingKeys: ReadonlyArray<PlayersTableSortingType['key']> = [
        'playTime',
        'tsJoined',
        'tsLastConnection',
    ];
    const requestedSortingKey = queryParams.sortingKey;
    const sortingKey: PlayersTableSortingType['key'] =
        typeof requestedSortingKey === 'string' &&
        (allowedSortingKeys as readonly string[]).includes(requestedSortingKey)
            ? (requestedSortingKey as PlayersTableSortingType['key'])
            : 'tsJoined';
    const sorting: PlayersTableSortingType = {
        key: sortingKey,
        desc: String(queryParams.sortingDesc) === 'true',
    };

    const searchValue = typeof queryParams.searchValue === 'string' ? queryParams.searchValue : '';
    const searchType = typeof queryParams.searchType === 'string' ? queryParams.searchType : '';
    const filtersCsv = typeof queryParams.filters === 'string' ? queryParams.filters : undefined;
    const offsetLicense = typeof queryParams.offsetLicense === 'string' ? queryParams.offsetLicense : undefined;

    let rows = DEV_PLAYERS;
    rows = filterByFlags(rows, filtersCsv);
    rows = filterBySearch(rows, searchValue, searchType);
    rows = sortPlayers(rows, sorting);

    let startIndex = 0;
    if (offsetLicense) {
        const offsetIndex = rows.findIndex((p) => p.license === offsetLicense);
        if (offsetIndex >= 0) {
            startIndex = offsetIndex + 1;
        }
    }

    const players = rows.slice(startIndex, startIndex + DEV_PLAYERS_PAGE_SIZE);
    const hasReachedEnd = startIndex + players.length >= rows.length;

    return {
        players,
        hasReachedEnd,
    };
};
