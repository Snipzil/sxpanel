import { PageHeaderChangelog } from '@/components/page-header';
import { useSettingsPageState } from '@/pages/Settings/useSettingsPageState';
import { Loader2Icon, OctagonXIcon, Settings2Icon } from 'lucide-react';
import { SettingsFloatingSaveBar } from '@/pages/Settings/SettingsFloatingSaveBar';
import { SettingsSectionPicker } from './SettingsSectionPicker';
import { SettingsWorkspace } from './SettingsWorkspace';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
    const {
        t,
        settingsTabs,
        tab,
        handleTabChange,
        cardPendingSave,
        pageCtx,
        addonSettingsTabs,
        addonTabInject,
        hasPerm,
        swr,
    } = useSettingsPageState();

    const activeSettingsTab = settingsTabs.find((entry) => entry.ctx.tabId === tab);
    const activeAddonTab = addonSettingsTabs.find((w) => tab === `addon-${w.addonId}-${w.title}`);

    const sectionTitle =
        tab === 'danger-zone'
            ? t('panel.settings.tabs.danger_zone')
            : (activeSettingsTab?.ctx.tabName ?? activeAddonTab?.title ?? settingsTabs[0]?.ctx.tabName);

    const sectionBlurb =
        tab === 'danger-zone'
            ? 'Backup, cleanup, and other irreversible master actions.'
            : 'Change values below, then save each card when you are done.';

    return (
        <div className={cn('w-full min-w-0', cardPendingSave ? 'pb-28' : 'pb-16')}>
            <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                    <div className="bg-primary/15 text-primary flex size-11 shrink-0 items-center justify-center rounded-2xl">
                        <Settings2Icon className="size-5" aria-hidden />
                    </div>
                    <div className="min-w-0">
                        <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">Panel</p>
                        <h1 className="text-foreground text-2xl font-semibold tracking-tight">
                            {t('panel.routes.settings')}
                        </h1>
                        <p className="text-muted-foreground mt-1 max-w-xl text-sm">
                            FXServer, moderation, Discord, and gameplay — one section at a time.
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {pageCtx.isLoading ? (
                        <span className="border-border/50 bg-muted/20 text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
                            <Loader2Icon className="size-3.5 animate-spin" />
                            Loading…
                        </span>
                    ) : null}
                    {cardPendingSave ? (
                        <span className="border-warning/35 bg-warning/10 text-warning-inline rounded-full border px-3 py-1 text-xs font-semibold">
                            Unsaved · {cardPendingSave.cardTitle}
                        </span>
                    ) : null}
                    <PageHeaderChangelog changelogData={swr.data?.changelog} />
                </div>
            </header>

            <SettingsSectionPicker
                settingsTabs={settingsTabs}
                addonSettingsTabs={addonSettingsTabs}
                activeTab={tab}
                pendingTabId={cardPendingSave?.tabId}
                showDangerZone={hasPerm('master')}
                dangerZoneLabel={t('panel.settings.tabs.danger_zone')}
                onSelect={handleTabChange}
            />

            <div className="w-full min-w-0">
                <div className="space-y-6">
                    <div className="max-w-4xl">
                        <h2 className="text-foreground text-xl font-semibold tracking-tight">{sectionTitle}</h2>
                        <p className="text-muted-foreground mt-1 text-sm">{sectionBlurb}</p>
                    </div>

                    {pageCtx.swrError ? (
                        <div className="border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm">
                            <OctagonXIcon className="mt-0.5 size-4 shrink-0" />
                            <span>{pageCtx.swrError}</span>
                        </div>
                    ) : null}

                    <SettingsWorkspace
                        activeTab={tab}
                        settingsTabs={settingsTabs}
                        addonSettingsTabs={addonSettingsTabs}
                        addonTabInject={addonTabInject}
                        pageCtx={pageCtx}
                        t={t}
                    />

                    <SettingsFloatingSaveBar pageCtx={pageCtx} />
                </div>
            </div>
        </div>
    );
}
