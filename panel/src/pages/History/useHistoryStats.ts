import { useEffect, useReducer } from 'react';
import type { HistoryStatsResp } from '@shared/historyApiTypes';
import { useBackendApi } from '@/hooks/fetch';

type HistoryStatsSuccess = Exclude<HistoryStatsResp, { error: string }>;

type HistoryStatsState = {
    stats: HistoryStatsSuccess | undefined;
    isLoading: boolean;
    error: Error | null;
};

type HistoryStatsAction =
    | { type: 'startLoading' }
    | { type: 'loadSuccess'; stats: HistoryStatsSuccess | undefined }
    | { type: 'loadError'; error: Error };

function reduceHistoryStatsState(state: HistoryStatsState, action: HistoryStatsAction): HistoryStatsState {
    switch (action.type) {
        case 'startLoading':
            return { ...state, isLoading: true, error: null };
        case 'loadSuccess':
            return { stats: action.stats, isLoading: false, error: null };
        case 'loadError':
            return { stats: undefined, isLoading: false, error: action.error };
        default:
            return state;
    }
}

export function useHistoryStats() {
    const [state, dispatch] = useReducer(reduceHistoryStatsState, {
        stats: undefined,
        isLoading: true,
        error: null,
    });
    const statsApi = useBackendApi<HistoryStatsResp>({
        method: 'GET',
        path: '/history/stats',
        abortOnUnmount: true,
    });

    useEffect(() => {
        let isMounted = true;
        dispatch({ type: 'startLoading' });
        statsApi({
            success(data) {
                if (!isMounted) return;
                if (data && 'error' in data) {
                    dispatch({ type: 'loadError', error: new Error(data.error) });
                } else {
                    dispatch({ type: 'loadSuccess', stats: data });
                }
            },
            error(message) {
                if (!isMounted) return;
                dispatch({ type: 'loadError', error: new Error(message) });
            },
        });
        return () => {
            isMounted = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only stats fetch
    }, []);

    return state;
}
