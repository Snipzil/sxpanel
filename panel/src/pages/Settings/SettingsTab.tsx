import { Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import type { SettingTabsDatum } from '@/pages/Settings/settingsTabsConfig';
import type { SettingsCardContext, SettingsCardProps, SettingsPageContext } from './utils';
import GenericSpinner from '@/components/GenericSpinner';

type SettingsTabProps = {
    tab: SettingTabsDatum;
    pageCtx: SettingsPageContext;
};

type LazySettingsCardComponent = LazyExoticComponent<ComponentType<SettingsCardProps>>;

function SettingsCardFallback() {
    return (
        <div className="flex w-full justify-center py-16">
            <GenericSpinner />
        </div>
    );
}

function LazySettingsCard({
    Component,
    pageCtx,
    cardCtx,
}: {
    Component: LazySettingsCardComponent;
    pageCtx: SettingsPageContext;
    cardCtx: SettingsCardContext;
}) {
    return (
        <Suspense fallback={<SettingsCardFallback />}>
            <Component pageCtx={pageCtx} cardCtx={cardCtx} />
        </Suspense>
    );
}

export default function SettingsTab({ tab, pageCtx }: SettingsTabProps) {
    if ('cards' in tab) {
        return (
            <div id={`tab-${tab.ctx.tabId}`} className="flex flex-col gap-8">
                {tab.cards.map(({ ctx, Component }) => (
                    <LazySettingsCard key={ctx.cardId} Component={Component} pageCtx={pageCtx} cardCtx={ctx} />
                ))}
            </div>
        );
    }

    return <LazySettingsCard key={tab.ctx.tabId} Component={tab.Component} pageCtx={pageCtx} cardCtx={tab.ctx} />;
}
