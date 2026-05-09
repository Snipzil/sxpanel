import { useState, useEffect, useRef } from 'react';
import useSWR from 'swr';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { setUrlHash } from '@/lib/navigation';
import { Settings2Icon, ShieldAlertIcon } from 'lucide-react';
import DangerZoneTab from './DangerZoneTab';

import { ApiTimeout, useBackendApi } from '@/hooks/fetch';
import { useOpenConfirmDialog } from '@/hooks/dialogs';
import { txToast } from '@/components/TxToaster';
import { useAdminPerms } from '@/hooks/auth';
import {
    SYM_RESET_CONFIG,
    type SettingsCardContext,
    type SettingsCardInfo,
    type SettingsCardProps,
    type SettingsTabInfo,
} from './utils';
import type { GetConfigsResp, PartialTxConfigs, SaveConfigsReq, SaveConfigsResp } from '@shared/otherTypes';

import SettingsTab from './SettingsTab';
import ConfigCardBans from './tabCards/bans';
import ConfigCardDiscordBot from './tabCards/discord';
import ConfigCardDiscordOAuth from './tabCards/discordOAuth';
import ConfigCardFxserver from './tabCards/fxserver';
import ConfigCardGameMenu from './tabCards/gameMenu';
import ConfigCardGameNotifications from './tabCards/gameNotifications';
import ConfigCardGamePlayerTags from './tabCards/gamePlayerTags';
import ConfigCardGameReports from './tabCards/gameReports';
import ConfigCardGeneral from './tabCards/general';
import ConfigCardWhitelist from './tabCards/whitelist';
import SettingsCardTemplate from './tabCards/_template';
// import SettingsCardBlank from './tabCards/_blank';
import { PageHeader, PageHeaderChangelog } from '@/components/page-header';
import { emsg } from '@shared/emsg';
import { useAddonWidgets, useAddonWidgetsByPrefix } from '@/hooks/addons';
import { ErrorBoundary } from 'react-error-boundary';

//Tab configuration
const settingsTabsBase = [
    { name: 'General', Component: ConfigCardGeneral }, //TODO: cards [Server Listing, txAdmin]
    { name: 'FXServer', Component: ConfigCardFxserver },
    { name: 'Bans', Component: ConfigCardBans },
    { name: 'Whitelist', Component: ConfigCardWhitelist },
    {
        name: 'Discord',
        cards: [
            { name: 'Bot', Component: ConfigCardDiscordBot },
            { name: 'OAuth', Component: ConfigCardDiscordOAuth },
        ],
    },
    {
        name: 'Game',
        cards: [
            { name: 'Menu', Component: ConfigCardGameMenu },
            { name: 'Notifications', Component: ConfigCardGameNotifications },
            { name: 'Reports', Component: ConfigCardGameReports },
        ],
    },
    { name: 'Player Tags', Component: ConfigCardGamePlayerTags },
    //Dev only
    // { name: 'Template', Component: SettingsCardTemplate },
    // { name: 'Blank', Component: SettingsCardBlank },
];

//Types
type SettingGroup = {
    ctx: SettingsTabInfo & SettingsCardInfo;
    Component: React.FC<SettingsCardProps>;
};
type SettingTabMulti = {
    ctx: SettingsTabInfo;
    cards: SettingGroup[];
};
type SettingTabSingle = SettingGroup;
export type SettingTabsDatum = SettingTabMulti | SettingTabSingle;

//Massaging the data into the expected format
const nameToId = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '-');
export const settingsTabs: SettingTabsDatum[] = settingsTabsBase.map((tab) => {
    const tabCtx = {
        tabId: nameToId(tab.name),
        tabName: tab.name,
    } satisfies SettingsTabInfo;
    if ('cards' in tab && tab.cards) {
        return {
            ctx: tabCtx,
            cards: tab.cards.map(
                (card) =>
                    ({
                        ctx: {
                            ...tabCtx,
                            cardId: `${tabCtx.tabId}-${nameToId(card.name)}`,
                            cardName: card.name,
                            cardTitle: `${tabCtx.tabName} ${card.name}`,
                        },
                        Component: card.Component,
                    }) satisfies SettingGroup,
            ),
        } satisfies SettingTabMulti;
    } else {
        return {
            ctx: {
                ...tabCtx,
                cardId: tabCtx.tabId,
                cardName: tabCtx.tabName,
                cardTitle: tabCtx.tabName,
            },
            Component: tab.Component,
        } satisfies SettingTabSingle;
    }
});

export default function SettingsPage() {
    const [cardPendingSave, setCardPendingSave] = useState<SettingsCardContext | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const openConfirmDialog = useOpenConfirmDialog();
    const { hasPerm } = useAdminPerms();
    const hasPermRef = useRef(hasPerm);
    useEffect(() => {
        hasPermRef.current = hasPerm;
    }, [hasPerm]);

    // Addon widgets: full custom tabs (e.g. "settings.tab") and per-tab injections (e.g. "settings.tab.discord")
    const addonSettingsTabs = useAddonWidgets('settings.tab');
    const addonTabInject = useAddonWidgetsByPrefix('settings.tab.');

    //Check for default tab in URL hash
    const [tab, setTab] = useState(() => {
        const pageHash = window.location?.hash.slice(1);
        if (pageHash === 'danger-zone' && hasPerm('master')) return 'danger-zone';
        if (pageHash?.startsWith('addon-')) return pageHash;
        return settingsTabs.find((tab) => tab.ctx.tabId === pageHash)?.ctx.tabId ?? settingsTabs[0].ctx.tabId;
    });

    // Listen for hash changes (e.g. from addon warning bar)
    useEffect(() => {
        const onHashChange = () => {
            const hash = window.location.hash.slice(1);
            if (hash === 'danger-zone' && hasPermRef.current('master')) {
                setTab(hash);
            } else if (hash.startsWith('addon-')) {
                setTab(hash);
            } else {
                const match = settingsTabs.find((t) => t.ctx.tabId === hash);
                if (match) setTab(match.ctx.tabId);
            }
        };
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, []);

    //Warn on navigate-away with unsaved changes
    useEffect(() => {
        if (!cardPendingSave) return;
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [cardPendingSave]);

    //API stuff
    const queryApi = useBackendApi<GetConfigsResp>({
        method: 'GET',
        path: `/settings/configs`,
        throwGenericErrors: true,
    });
    const saveApi = useBackendApi<SaveConfigsResp, SaveConfigsReq>({
        method: 'POST',
        path: `/settings/configs/:card`,
        throwGenericErrors: true,
    });

    const swr = useSWR(
        '/settings/configs',
        async () => {
            const data = await queryApi({});
            if (!data) throw new Error('No data returned');
            return data;
        },
        {
            revalidateOnMount: true,
            revalidateOnFocus: false,
        },
    );

    //Handlers
    const saveChanges = async (source: SettingsCardContext, changes: PartialTxConfigs) => {
        if (isSaving) return;
        const toastId = txToast.loading(`Saving ${source.cardTitle} settings...`, { id: 'settingsSave' });
        setIsSaving(true);
        try {
            if (!swr.data) throw new Error('Cannot save changes without swr.data.');
            const resetKeys: string[] = [];
            for (const [scopeName, scopeData] of Object.entries(changes)) {
                for (const [configKey, configValue] of Object.entries(scopeData as Record<string, unknown>)) {
                    if (configValue === SYM_RESET_CONFIG) {
                        resetKeys.push(`${scopeName}.${configKey}`);
                    }
                }
            }
            const saveResp = await saveApi({
                pathParams: { card: source.cardId },
                data: { resetKeys, changes },
                timeout: source.cardId === 'discord-bot' ? ApiTimeout.REALLY_REALLY_LONG : ApiTimeout.LONG,
                toastId,
            });
            if (!saveResp) throw new Error('empty_response');
            if (saveResp.type === 'error') return; //the fetcher will handle the error
            if (!saveResp.stored) throw new Error('no_stored_data');
            if (!saveResp.changelog) throw new Error('no_changelog_data');
            swr.mutate(
                {
                    ...swr.data,
                    storedConfigs: saveResp.stored,
                    changelog: saveResp.changelog,
                },
                false,
            );
            setCardPendingSave(null);
        } catch (error) {
            txToast.error(
                {
                    title: `Error saving ${source.cardTitle} settings:`,
                    msg: emsg(error),
                },
                { id: toastId },
            );
        } finally {
            setIsSaving(false);
        }
    };

    const switchTab = (newTab: string) => {
        setCardPendingSave(null);
        setTab(newTab);
        setUrlHash(newTab);
    };

    //If switching tabs with unsaved changes, ask for confirmation
    const handleTabChange = (newTab: string) => {
        if (cardPendingSave && newTab && newTab !== cardPendingSave?.tabId) {
            openConfirmDialog({
                title: 'Discard Changes',
                actionLabel: 'Discard',
                confirmBtnVariant: 'destructive',
                message: (
                    <>
                        You have unsaved changes in the <strong>{cardPendingSave.cardTitle}</strong> tab. <br />
                        Are you sure you want to discard them?
                    </>
                ),
                onConfirm: () => {
                    switchTab(newTab);
                },
            });
        } else {
            switchTab(newTab);
        }
    };

    return (
        <div className="mb-10 w-full">
            <PageHeader title="Settings" icon={<Settings2Icon />}>
                <PageHeaderChangelog changelogData={swr?.data?.changelog} />
            </PageHeader>
            <div className="xs:px-3 flex w-full flex-row gap-2 px-0 md:px-0">
                <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
                    <TabsList className="max-xs:sticky max-xs:top-navbarvh max-xs:w-full max-xs:rounded-none z-10 h-[unset] flex-wrap">
                        {settingsTabs.map((tab) => (
                            <TabsTrigger key={tab.ctx.tabId} value={tab.ctx.tabId} className="hover:text-primary">
                                {tab.ctx.tabName}
                            </TabsTrigger>
                        ))}
                        {addonSettingsTabs.map((w) => (
                            <TabsTrigger
                                key={`addon-${w.addonId}-${w.title}`}
                                value={`addon-${w.addonId}-${w.title}`}
                                className="hover:text-primary"
                            >
                                {w.title}
                            </TabsTrigger>
                        ))}
                        {hasPerm('master') && (
                            <TabsTrigger value="danger-zone" className="hover:text-destructive text-destructive/70">
                                <ShieldAlertIcon className="mr-1 h-3.5 w-3.5" />
                                Danger Zone
                            </TabsTrigger>
                        )}
                    </TabsList>
                    {settingsTabs.map((tab) => {
                        // Find any addon widgets injected into this specific tab
                        const tabInjectWidgets = addonTabInject.filter(
                            (w) => w.slot === `settings.tab.${tab.ctx.tabId}`,
                        );
                        return (
                            <TabsContent value={tab.ctx.tabId} key={tab.ctx.tabId} className="mt-6">
                                <SettingsTab
                                    tab={tab}
                                    pageCtx={{
                                        apiData: swr.data,
                                        isReadOnly:
                                            swr.isLoading || isSaving || !swr.data || !hasPerm('settings.write'),
                                        isLoading: swr.isLoading,
                                        isSaving,
                                        swrError: swr.error ? swr.error.message : undefined,
                                        cardPendingSave,
                                        setCardPendingSave,
                                        saveChanges,
                                    }}
                                />
                                {tabInjectWidgets.length > 0 && (
                                    <div className="mt-6 flex flex-col gap-4">
                                        {tabInjectWidgets.map((w) => (
                                            <ErrorBoundary
                                                key={`${w.addonId}-${w.title}`}
                                                fallback={
                                                    <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-xl border p-4 text-sm">
                                                        Addon error: {w.title}
                                                    </div>
                                                }
                                            >
                                                <w.Component />
                                            </ErrorBoundary>
                                        ))}
                                    </div>
                                )}
                            </TabsContent>
                        );
                    })}
                    {addonSettingsTabs.map((w) => (
                        <TabsContent
                            key={`addon-${w.addonId}-${w.title}`}
                            value={`addon-${w.addonId}-${w.title}`}
                            className="mt-6"
                        >
                            <ErrorBoundary
                                fallback={
                                    <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-xl border p-4 text-sm">
                                        Addon tab error: {w.title}
                                    </div>
                                }
                            >
                                <w.Component />
                            </ErrorBoundary>
                        </TabsContent>
                    ))}
                    {hasPerm('master') && (
                        <TabsContent value="danger-zone" className="mt-6">
                            <DangerZoneTab />
                        </TabsContent>
                    )}
                </Tabs>
            </div>
        </div>
    );
}
