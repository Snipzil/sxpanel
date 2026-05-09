import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangleIcon, GavelIcon, ClockIcon } from 'lucide-react';
import PageCalloutRow, { PageCalloutProps } from '@/components/PageCalloutRow';
import { PageHeader } from '@/components/page-header';
import {
    HistorySearchBox,
    HistorySearchBoxReturnStateType,
    SEARCH_ANY_STRING,
    availableSearchTypes,
} from './HistorySearchBox';
import HistoryTable from './HistoryTable';
import { HistoryStatsResp, HistoryTableSearchType } from '@shared/historyApiTypes';
import { useBackendApi } from '@/hooks/fetch';

//Memoized components
const HistorySearchBoxMemo = memo(HistorySearchBox);
const HistoryTableMemo = memo(HistoryTable);
const PageCalloutRowMemo = memo(PageCalloutRow);

//Helpers for storing search and filters in URL
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
    if (filterByType && filterByType !== '!any') {
        newUrl.searchParams.set('filterbyType', filterByType);
    } else {
        newUrl.searchParams.delete('filterbyType');
    }
    if (filterByAdmin && filterByAdmin !== '!any') {
        newUrl.searchParams.set('filterbyAdmin', filterByAdmin);
    } else {
        newUrl.searchParams.delete('filterbyAdmin');
    }
    window.history.replaceState({}, '', newUrl);
};
const getInitialState = () => {
    const params = new URLSearchParams(window.location.search);
    //NOTE: unlike the PlayersPage, I'm not really validating the filters here
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
    } satisfies HistorySearchBoxReturnStateType;
};

export default function HistoryPage() {
    const [calloutData, setCalloutData] = useState<HistoryStatsResp | undefined>(undefined);
    const [searchBoxReturn, setSearchBoxReturn] = useState<HistorySearchBoxReturnStateType | undefined>(undefined);
    const statsApi = useBackendApi<HistoryStatsResp>({
        method: 'GET',
        path: '/history/stats',
        abortOnUnmount: true,
    });

    //Callout data
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-only fetch; statsApi identity changes each render
    useEffect(() => {
        statsApi({
            success(data) {
                setCalloutData(data);
            },
        });
    }, []);

    //HistorySearchBox handlers
    const doSearch = useCallback(
        (search: HistoryTableSearchType, filterByType: string | undefined, filterByAdmin: string | undefined) => {
            setSearchBoxReturn({ search, filterByType, filterByAdmin });
            updateUrlSearchParams(search, filterByType, filterByAdmin);
        },
        [],
    );
    const initialState = useMemo(getInitialState, []);

    const calloutRowData = useMemo(() => {
        const hasCalloutData = calloutData && !('error' in calloutData);
        return [
            {
                label: 'Total Warns',
                value: hasCalloutData ? calloutData.totalWarns : false,
                icon: <AlertTriangleIcon />,
            },
            {
                label: 'New Warns Last 7d',
                value: hasCalloutData ? calloutData.warnsLast7d : false,
                icon: <AlertTriangleIcon />,
                prefix: '+',
            },
            {
                label: 'Total Bans',
                value: hasCalloutData ? calloutData.totalBans : false,
                icon: <GavelIcon />,
            },
            {
                label: 'New Bans Last 7d',
                value: hasCalloutData ? calloutData.bansLast7d : false,
                icon: <GavelIcon />,
                prefix: '+',
            },
        ] satisfies PageCalloutProps[];
    }, [calloutData]);

    return (
        <div className="h-contentvh flex w-full min-w-96 flex-col">
            <PageHeader title="History" icon={<ClockIcon className="size-5" />} />

            <PageCalloutRowMemo callouts={calloutRowData} />

            {calloutData && !('error' in calloutData) ? (
                <HistorySearchBoxMemo
                    doSearch={doSearch}
                    initialState={initialState}
                    adminStats={calloutData.groupedByAdmins}
                />
            ) : null}

            {searchBoxReturn ? (
                <HistoryTableMemo
                    search={searchBoxReturn.search}
                    filterByType={searchBoxReturn.filterByType}
                    filterByAdmin={searchBoxReturn.filterByAdmin}
                />
            ) : null}
        </div>
    );
}
