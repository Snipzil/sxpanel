import { atom, useAtomValue, useSetAtom } from 'jotai';

export interface PlayerModeIndicatorAlert {
    key: string;
    message: string;
    isTranslationKey?: boolean;
    tOptions?: object;
}

const playerModeIndicatorsState = atom<PlayerModeIndicatorAlert[]>([]);

export const usePlayerModeIndicatorsValue = () => useAtomValue(playerModeIndicatorsState);

export const useAddPlayerModeIndicator = () => {
    const setIndicators = useSetAtom(playerModeIndicatorsState);
    return (alert: PlayerModeIndicatorAlert) => {
        setIndicators((prev) => (prev.some((a) => a.key === alert.key) ? prev : [...prev, alert]));
    };
};

export const useRemovePlayerModeIndicator = () => {
    const setIndicators = useSetAtom(playerModeIndicatorsState);
    return (key: string) => {
        setIndicators((prev) => prev.filter((a) => a.key !== key));
    };
};
