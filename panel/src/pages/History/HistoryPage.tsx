import { memo, useCallback, useMemo, useState } from 'react';
import type { HistoryTableSearchType } from '@shared/historyApiTypes';
import {
    availableSearchTypes,
    SEARCH_ANY_STRING,
    type HistorySearchReturnState,
} from '@/pages/History/historySearchConfig';
import { HistoryHeaderBand } from './HistoryHeaderBand';
import { HistorySearchBar } from './HistorySearchBar';
import { HistoryList } from './HistoryList';
import { useHistoryStats } from './useHistoryStats';

const HistorySearchBarMemo = memo(HistorySearchBar);
const HistoryListMemo = memo(HistoryList);

const updateUrlSearchParams = (
    search: HistoryTableSearchType,
    filterByType: string | undefined,
    filterByAdmin: string | undefined,
) => {
    const newUrl = new URL(window.location.toString());
    if (search && search.type && search.value) {
        newUrl.searchParams.set('searchType', search.type);
        newUrl.searchParams.set('searchQuery', search.value);
    } else {
        newUrl.searchParams.delete('searchType');
        newUrl.searchParams.delete('searchQuery');
    }
    if (filterByType && filterByType !== SEARCH_ANY_STRING) {
        newUrl.searchParams.set('filterbyType', filterByType);
    } else {
        newUrl.searchParams.delete('filterbyType');
    }
    if (filterByAdmin && filterByAdmin !== SEARCH_ANY_STRING) {
        newUrl.searchParams.set('filterbyAdmin', filterByAdmin);
    } else {
        newUrl.searchParams.delete('filterbyAdmin');
    }
    window.history.replaceState({}, '', newUrl);
};

const getInitialState = () => {
    const params = new URLSearchParams(window.location.search);
    const validSearchTypes = availableSearchTypes.map((f) => f.value) as string[];
    const searchType = params.get('searchType');
    const searchQuery = params.get('searchQuery');
    return {
        search:
            searchQuery && searchType && validSearchTypes.includes(searchType)
                ? {
                      type: searchType,
                      value: searchQuery,
                  }
                : {
                      type: availableSearchTypes[0].value,
                      value: '',
                  },
        filterByType: params.get('filterbyType') ?? SEARCH_ANY_STRING,
        filterByAdmin: params.get('filterbyAdmin') ?? SEARCH_ANY_STRING,
    } satisfies HistorySearchReturnState;
};

export default function HistoryPage() {
    const { stats, isLoading: statsLoading } = useHistoryStats();
    const [searchBoxReturn, setSearchBoxReturn] = useState<HistorySearchReturnState | undefined>(undefined);

    const doSearch = useCallback(
        (search: HistoryTableSearchType, filterByType: string | undefined, filterByAdmin: string | undefined) => {
            setSearchBoxReturn({ search, filterByType, filterByAdmin });
            updateUrlSearchParams(search, filterByType, filterByAdmin);
        },
        [],
    );
    const initialState = useMemo(getInitialState, []);

    const adminStats = stats && !('error' in stats) ? stats.groupedByAdmins : [];

    return (
        <div className="h-contentvh flex w-full min-w-96 flex-col">
            <HistoryHeaderBand
                totalWarns={stats && !('error' in stats) ? stats.totalWarns : undefined}
                warnsLast7d={stats && !('error' in stats) ? stats.warnsLast7d : undefined}
                totalBans={stats && !('error' in stats) ? stats.totalBans : undefined}
                bansLast7d={stats && !('error' in stats) ? stats.bansLast7d : undefined}
                statsLoading={statsLoading}
            />

            {stats && !('error' in stats) ? (
                <HistorySearchBarMemo doSearch={doSearch} initialState={initialState} adminStats={adminStats} />
            ) : null}

            {searchBoxReturn ? (
                <HistoryListMemo
                    search={searchBoxReturn.search}
                    filterByType={searchBoxReturn.filterByType}
                    filterByAdmin={searchBoxReturn.filterByAdmin}
                />
            ) : null}
        </div>
    );
}
