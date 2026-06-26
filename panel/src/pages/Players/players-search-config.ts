import type { PlayersTableFiltersType, PlayersTableSearchType } from '@shared/playerApiTypes';

/** Static search type values (URL/localStorage validation). Labels live in locale. */
export const playersSearchTypeValues = ['playerName', 'playerNotes', 'playerIds'] as const;
export const playersFilterValues = [
    'isAdmin',
    'isOnline',
    'isBanned',
    'hasPreviousBan',
    'isWhitelisted',
    'hasNote',
] as const;

/** @deprecated Dev-redesign URL helpers; use `playersSearchTypeValues` for validation only. */
export const availableSearchTypes = playersSearchTypeValues.map((value) => ({
    value,
    label: value,
    placeholder: '',
    description: '',
}));

/** @deprecated Dev-redesign URL helpers; use `playersFilterValues` for validation only. */
export const availableFilters = playersFilterValues.map((value) => ({
    value,
    label: value,
}));

export type PlayersSearchBoxReturnStateType = {
    search: PlayersTableSearchType;
    filters: PlayersTableFiltersType;
};
