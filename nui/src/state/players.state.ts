import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { VehicleStatus, PlayerData, LuaPlayerData } from '@nui/src/hooks/usePlayerListListener';
import { debugData } from '../utils/debugData';
import cleanPlayerName from '@shared/cleanPlayerName';

export enum PlayerDataFilter {
    NoFilter = 'noFilter',
    IsAdmin = 'isAdmin',
    IsInjured = 'isInjured',
    InVehicle = 'inVehicle',
}
export enum PlayerDataSort {
    IdJoinedFirst = 'idJoinedFirst',
    IdJoinedLast = 'idJoinedLast',
    DistanceClosest = 'distanceClosest',
    DistanceFarthest = 'distanceFarthest',
}

const playerDataAtom = atom<PlayerData[]>([]);

const playerFilterTypeAtom = atom<PlayerDataFilter | null>(PlayerDataFilter.NoFilter);

const playerSortTypeAtom = atom<PlayerDataSort | null>(PlayerDataSort.IdJoinedFirst);

const filterPlayerDataInputAtom = atom('');

// If true, player data filter will reset on page switch
const filterPlayerDataIsTempAtom = atom(false);

const sortedAndFilteredPlayerDataAtom = atom((get) => {
    const filterType: PlayerDataFilter = get(playerFilterTypeAtom) ?? PlayerDataFilter.NoFilter;
    const sortType: PlayerDataSort = get(playerSortTypeAtom) ?? PlayerDataSort.IdJoinedFirst;
    const filteredValueInput = get(filterPlayerDataInputAtom);
    const unfilteredPlayerStates = get(playerDataAtom) as PlayerData[];

    let searchFilter = (p: PlayerData) => true;
    const formattedInput = filteredValueInput.trim();
    if (formattedInput) {
        const searchInput = cleanPlayerName(formattedInput).pureName;
        searchFilter = (p) => {
            return p.pureName.includes(searchInput) || p.id.toString().includes(formattedInput);
        };
    }

    let playerFilter = (p: PlayerData) => true;
    if (filterType === PlayerDataFilter.IsAdmin) {
        playerFilter = (p) => p.admin;
    } else if (filterType === PlayerDataFilter.IsInjured) {
        playerFilter = (p) => p.health <= 20;
    } else if (filterType === PlayerDataFilter.InVehicle) {
        playerFilter = (p) => p.vType !== VehicleStatus.Walking;
    }

    const playerStates = unfilteredPlayerStates.filter((p) => {
        return searchFilter(p) && playerFilter(p);
    });

    switch (sortType) {
        case PlayerDataSort.DistanceClosest:
            // Since our distance can come back as -1 when unknown, we need to explicitly
            // move to the end of the sorted array.
            return [...playerStates].sort((a, b) => {
                if (a.dist < 0 && b.dist < 0) return 0;
                if (a.dist < 0) return 1;
                if (b.dist < 0) return -1;
                return a.dist - b.dist;
            });
        case PlayerDataSort.DistanceFarthest:
            return [...playerStates].sort((a, b) => {
                if (a.dist < 0 && b.dist < 0) return 0;
                if (a.dist < 0) return 1;
                if (b.dist < 0) return -1;
                return b.dist - a.dist;
            });
        case PlayerDataSort.IdJoinedFirst:
            return [...playerStates].sort((a, b) => (a.id > b.id ? 1 : -1));
        case PlayerDataSort.IdJoinedLast:
            return [...playerStates].sort((a, b) => (a.id < b.id ? 1 : -1));
        default:
            return playerStates;
    }
});

export const usePlayersState = () => useAtomValue(playerDataAtom);

export const useSetPlayersState = () => useSetAtom(playerDataAtom);

export const useSetPlayerFilter = () => useSetAtom(filterPlayerDataInputAtom);

export const useSetPlayersFilterIsTemp = () => useSetAtom(filterPlayerDataIsTempAtom);

export const usePlayersSortedValue = () => useAtomValue(sortedAndFilteredPlayerDataAtom);

export const usePlayersFilterBy = () => useAtom(playerFilterTypeAtom);

export const usePlayersSortBy = () => useAtom(playerSortTypeAtom);

export const usePlayersSearch = () => useAtom(filterPlayerDataInputAtom);

export const usePlayersFilterIsTemp = () => useAtom(filterPlayerDataIsTempAtom);

export const useFilteredSortedPlayers = (): PlayerData[] => useAtomValue(sortedAndFilteredPlayerDataAtom);

debugData<LuaPlayerData[]>(
    [
        {
            action: 'setPlayerList',
            data: [
                {
                    vType: VehicleStatus.Walking,
                    name: 'example',
                    id: 1,
                    dist: 0,
                    health: 80,
                    admin: false,
                    tags: ['newplayer'],
                },
                {
                    vType: VehicleStatus.Driving,
                    name: 'example2',
                    id: 2,
                    dist: 20,
                    health: 50,
                    admin: true,
                    tags: ['staff'],
                },
                {
                    vType: VehicleStatus.Boat,
                    name: 'example3',
                    id: 3,
                    dist: 700,
                    health: 10,
                    admin: true,
                    tags: ['staff', 'problematic'],
                },
            ],
        },
    ],
    750,
);
