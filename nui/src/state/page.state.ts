import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';

export enum txAdminMenuPage {
    Main,
    Players,
    Stats,
    Reports,
    PlayerModalOnly,
}

/**
 * Returns the highest cycleable page given the enabled optional tabs.
 * Stats is always enabled (unlike Reports, which is gated by serverCtx).
 */
export const getMaxMenuPage = (reportsEnabled: boolean): txAdminMenuPage => {
    if (reportsEnabled) return txAdminMenuPage.Reports;
    return txAdminMenuPage.Stats;
};

/**
 * Returns the next page in the Tab-key cycle, skipping disabled tabs.
 */
export const getNextMenuPage = (prevPage: txAdminMenuPage, reportsEnabled: boolean): txAdminMenuPage => {
    const maxPage = getMaxMenuPage(reportsEnabled);
    if (prevPage >= maxPage) return txAdminMenuPage.Main;
    const nextPage = prevPage + 1;
    if (nextPage === txAdminMenuPage.Reports && !reportsEnabled) {
        return txAdminMenuPage.Main;
    }
    return nextPage;
};

const pageState = atom<txAdminMenuPage>(txAdminMenuPage.Main);

export const usePage = () => useAtom(pageState);

export const useSetPage = () => useSetAtom(pageState);

export const usePageValue = () => useAtomValue(pageState);
