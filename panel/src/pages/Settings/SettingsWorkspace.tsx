import { ErrorBoundary } from 'react-error-boundary';
import { lazy, Suspense } from 'react';
import SettingsTab from '@/pages/Settings/SettingsTab';
import type { SettingTabsDatum } from '@/pages/Settings/settingsTabsConfig';
import type { SettingsPageContext } from '@/pages/Settings/utils';
import type { AddonWidgetEntry } from '@/hooks/addons';
import GenericSpinner from '@/components/GenericSpinner';

const DangerZoneTab = lazy(() => import('@/pages/Settings/DangerZoneTab'));
type SettingsWorkspaceProps = {
    activeTab: string;
    settingsTabs: SettingTabsDatum[];
    addonSettingsTabs: AddonWidgetEntry[];
    addonTabInject: AddonWidgetEntry[];
    pageCtx: SettingsPageContext;
    t: (key: string, vars?: Record<string, string | number>) => string;
};

export function SettingsWorkspace({
    activeTab,
    settingsTabs,
    addonSettingsTabs,
    addonTabInject,
    pageCtx,
    t,
}: SettingsWorkspaceProps) {
    if (activeTab === 'danger-zone') {
        return (
            <div className="flex w-full flex-col gap-8">
                <Suspense
                    fallback={
                        <div className="flex w-full justify-center py-16">
                            <GenericSpinner />
                        </div>
                    }
                >
                    <DangerZoneTab pageCtx={pageCtx} />
                </Suspense>
            </div>
        );
    }
    const addonTab = addonSettingsTabs.find((w) => activeTab === `addon-${w.addonId}-${w.title}`);
    if (addonTab) {
        return (
            <ErrorBoundary
                fallback={
                    <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-2xl border p-4 text-sm">
                        {t('panel.settings.addon_tab_error', { title: addonTab.title })}
                    </div>
                }
            >
                <addonTab.Component />
            </ErrorBoundary>
        );
    }

    const tab = settingsTabs.find((entry) => entry.ctx.tabId === activeTab) ?? settingsTabs[0];
    if (!tab) {
        return (
            <p className="text-muted-foreground rounded-2xl border border-dashed px-6 py-10 text-center text-sm">
                No settings sections are available.
            </p>
        );
    }

    const tabInjectWidgets = addonTabInject.filter((w) => w.slot === `settings.tab.${tab.ctx.tabId}`);

    return (
        <div className="flex flex-col gap-8">
            <SettingsTab tab={tab} pageCtx={pageCtx} />
            {tabInjectWidgets.map((w) => (
                <ErrorBoundary
                    key={`${w.addonId}-${w.title}`}
                    fallback={
                        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-2xl border p-4 text-sm">
                            {t('panel.settings.addon_error', { title: w.title })}
                        </div>
                    }
                >
                    <w.Component />
                </ErrorBoundary>
            ))}
        </div>
    );
}
