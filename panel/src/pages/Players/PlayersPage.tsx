import { memo, useCallback, useMemo, useState } from 'react';
import { PlayersSearchBar } from './PlayersSearchBar';
import type { PlayersSearchBoxReturnStateType } from '@/pages/Players/players-search-config';
import { PlayersList } from './PlayersList';
import { PlayersHeaderBand } from './PlayersHeaderBand';
import { PlayersTableFiltersType, PlayersTableSearchType } from '@shared/playerApiTypes';
import { usePlayersStats } from '@/pages/Players/usePlayersStats';
import { availableFilters, availableSearchTypes } from '@/pages/Players/players-search-config';

const PlayersSearchBarMemo = memo(PlayersSearchBar);
const PlayersListMemo = memo(PlayersList);

const LOCALSTORAGE_KEY = 'playerSearchRememberType';
const getStoredSearchType = () => {
    const stored = localStorage.getItem(LOCALSTORAGE_KEY);
    if (!stored) return false;
    if (!availableSearchTypes.some((f) => f.value === stored)) return false;
    return stored;
};
const setStoredSearchType = (searchType: string | false) => {
    if (searchType) {
        localStorage.setItem(LOCALSTORAGE_KEY, searchType);
    } else {
        localStorage.removeItem(LOCALSTORAGE_KEY);
    }
};

const updateUrlSearchParams = (search: PlayersTableSearchType, filters: PlayersTableFiltersType) => {
    const newUrl = new URL(window.location.toString());
    if (search && search.value && search.type) {
        newUrl.searchParams.set('searchType', search.type);
        newUrl.searchParams.set('searchQuery', search.value);
    } else {
        newUrl.searchParams.delete('searchType');
        newUrl.searchParams.delete('searchQuery');
    }
    if (filters.length) {
        newUrl.searchParams.set('filters', filters.join(','));
    } else {
        newUrl.searchParams.delete('filters');
    }
    window.history.replaceState({}, '', newUrl);
};

const getInitialState = () => {
    const params = new URLSearchParams(window.location.search);
    const validTypes = availableSearchTypes.map((f) => f.value) as string[];
    const searchType = params.get('searchType');
    const searchQuery = params.get('searchQuery');
    const validFilters = availableFilters.map((f) => f.value) as string[];
    const searchFilters = params
        .get('filters')
        ?.split(',')
        .filter((f) => validFilters.includes(f));

    let defaultSearchType = availableSearchTypes[0].value as string;
    let rememberSearchType = false;
    try {
        const storedSearchType = getStoredSearchType();
        if (storedSearchType) {
            defaultSearchType = storedSearchType;
            rememberSearchType = true;
        }
    } catch (error) {
        console.error('Failed to get stored search type:', error);
    }

    return {
        search:
            searchQuery && searchType && validTypes.includes(searchType)
                ? {
                      type: searchType,
                      value: searchQuery,
                  }
                : {
                      type: defaultSearchType,
                      value: '',
                  },
        filters: searchFilters ?? [],
        rememberSearchType,
    };
};

export default function PlayersPage() {
    const { stats: calloutData, isLoading: statsLoading } = usePlayersStats();
    const [searchBoxReturn, setSearchBoxReturn] = useState<PlayersSearchBoxReturnStateType | undefined>(undefined);

    const doSearch = useCallback(
        (search: PlayersTableSearchType, filters: PlayersTableFiltersType, rememberSearchType: boolean) => {
            setSearchBoxReturn({ search, filters });
            updateUrlSearchParams(search, filters);
            try {
                setStoredSearchType(rememberSearchType ? search.type : false);
            } catch (error) {
                console.error('Failed to set stored search type:', error);
            }
        },
        [],
    );
    const initialState = useMemo(() => getInitialState(), []);

    return (
        <div className="h-contentvh flex w-full min-w-96 flex-col">
            <PlayersHeaderBand
                total={calloutData?.total}
                playedLast24h={calloutData?.playedLast24h}
                joinedLast24h={calloutData?.joinedLast24h}
                joinedLast7d={calloutData?.joinedLast7d}
                statsLoading={statsLoading}
            />

            <PlayersSearchBarMemo doSearch={doSearch} initialState={initialState} />

            {searchBoxReturn ? (
                <PlayersListMemo search={searchBoxReturn.search} filters={searchBoxReturn.filters} />
            ) : null}
        </div>
    );
}
