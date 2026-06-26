import { atom, useSetAtom } from 'jotai';
import { navigate } from 'wouter/use-browser-location';
import type { DeferralCardsConfig, DeferralScenarioId } from '@shared/deferralCardTypes';

export type DeferralEditorState = {
    /** Built-in scenario id or addon namespaced id (`addon-id:scenario_key`). */
    scenarioId: DeferralScenarioId | string;
    deferralCards: DeferralCardsConfig;
};

export const deferralEditorAtom = atom<DeferralEditorState | null>(null);

export const useOpenDeferralEditor = () => {
    const setEditorState = useSetAtom(deferralEditorAtom);
    return (state: DeferralEditorState) => {
        setEditorState(state);
        navigate('/settings/deferral-studio');
    };
};
