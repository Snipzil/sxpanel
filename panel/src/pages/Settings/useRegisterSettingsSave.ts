import { useEffect } from 'react';
import type { SettingsCardShellProps } from '@/pages/Settings/settingsShellTypes';

export function useRegisterSettingsSave({
    cardCtx,
    pageCtx,
    onClickSave,
}: Pick<SettingsCardShellProps, 'cardCtx' | 'pageCtx' | 'onClickSave'>) {
    const { registerSaveHandler, unregisterSaveHandler } = pageCtx;

    useEffect(() => {
        registerSaveHandler(cardCtx.cardId, onClickSave);
        return () => unregisterSaveHandler(cardCtx.cardId);
    }, [cardCtx.cardId, onClickSave, registerSaveHandler, unregisterSaveHandler]);
}
