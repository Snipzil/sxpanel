import { lazy, Suspense } from 'react';
import type { SettingsCardShellProps } from './settingsShellTypes';

const SettingsCardShellV3 = lazy(() => import('./SettingsCardShellV3'));

export type { SettingsCardShellProps };

export default function SettingsCardShell(props: SettingsCardShellProps) {
    return (
        <Suspense fallback={null}>
            <SettingsCardShellV3 {...props} />
        </Suspense>
    );
}
