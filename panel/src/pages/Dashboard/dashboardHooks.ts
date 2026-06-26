import { useAtomValue, useSetAtom } from 'jotai';
import type { DashboardDataEventType } from '@shared/socketioTypes';
import { throttle } from 'throttle-debounce';
import { useCallback } from 'react';
import { dashDataTsAtom, dashPerfCursorAtom, dashPlayerDropAtom, dashSvRuntimeAtom } from './dashboardAtoms';

export {
    dashDataTsAtom,
    dashPerfCursorAtom,
    dashPlayerDropAtom,
    dashServerStatsAtom,
    dashSvRuntimeAtom,
    usePushPlayerDropEvent,
} from './dashboardAtoms';

const dataMaxAge = 2.5 * 60 * 1000; //2.5 minutes

export const useSetDashboardData = () => {
    const setPlayerDrop = useSetAtom(dashPlayerDropAtom);
    const setSvRuntime = useSetAtom(dashSvRuntimeAtom);
    const setDataTs = useSetAtom(dashDataTsAtom);

    return (eventData: DashboardDataEventType) => {
        setPlayerDrop(eventData.playerDrop);
        setSvRuntime(eventData.svRuntime);
        setDataTs(Date.now());
    };
};

export const useThrottledSetCursor = () => {
    const setCursor = useSetAtom(dashPerfCursorAtom);
    const debouncedCursorSetter = useCallback(throttle(150, setCursor, { noLeading: false, noTrailing: false }), [
        setCursor,
    ]);
    return debouncedCursorSetter;
};

export const useGetDashDataAge = () => {
    const dataTs = useAtomValue(dashDataTsAtom);
    return () => {
        const now = Date.now();
        return {
            isExpired: now - dataTs > dataMaxAge,
            isStale: now - dataTs > 60 * 1000,
            age: now - dataTs,
        };
    };
};
