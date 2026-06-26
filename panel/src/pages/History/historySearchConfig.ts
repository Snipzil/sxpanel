import type { HistoryTableSearchType } from '@shared/historyApiTypes';

export const SEARCH_ANY_STRING = '!any';

/** Static search type values (URL validation). Labels live in locale. */
export const historySearchTypeValues = ['actionId', 'reason', 'identifiers'] as const;

/** URL validation helpers for history search types. */
export const availableSearchTypes = historySearchTypeValues.map((value) => ({
    value,
    label: value,
    placeholder: '',
    description: '',
}));

export type HistorySearchReturnState = {
    search: HistoryTableSearchType;
    filterByType?: string;
    filterByAdmin?: string;
};
