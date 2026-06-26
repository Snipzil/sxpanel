import type { ReactNode } from 'react';
import type { SettingsCardContext, SettingsPageContext } from './utils';

export type SettingsCardShellProps = {
    cardCtx: SettingsCardContext;
    pageCtx: SettingsPageContext;
    advancedVisible?: boolean;
    advancedSetter?: (visible: boolean) => void;
    onClickSave: () => void;
    children: ReactNode;
};
