import { atom, useSetAtom } from 'jotai';
import type { DashboardPleyerDropDataType, DashboardSvRuntimeDataType } from '@shared/socketioTypes';
import type { DashboardPerfCursorDataType, DashboardServerStatsDataType } from './dashboardTypes';

export const dashPlayerDropAtom = atom<DashboardPleyerDropDataType | undefined>(undefined);
export const dashServerStatsAtom = atom<DashboardServerStatsDataType | undefined>(undefined);
export const dashSvRuntimeAtom = atom<DashboardSvRuntimeDataType | undefined>(undefined);
export const dashPerfCursorAtom = atom<DashboardPerfCursorDataType | undefined>(undefined);
export const dashDataTsAtom = atom<number>(0);

export const usePushPlayerDropEvent = () => {
    const setPlayerDrop = useSetAtom(dashPlayerDropAtom);
    return (category: string) => {
        setPlayerDrop((prev) => {
            if (!prev) return prev;
            const newSummary = prev.summaryLast6h.slice();
            const categoryIndex = newSummary.findIndex(([c]) => c === category);
            if (categoryIndex === -1) {
                newSummary.push([category, 1]);
            } else {
                newSummary[categoryIndex][1]++;
            }
            return {
                ...prev,
                summaryLast6h: newSummary,
            };
        });
    };
};
