import { cn } from '@/lib/utils';
import type { SettingTabsDatum } from '@/pages/Settings/settingsTabsConfig';
import type { AddonWidgetEntry } from '@/hooks/addons';
import { BlocksIcon, ShieldAlertIcon } from 'lucide-react';
import { SETTINGS_NAV_GROUP_ORDER, SETTINGS_TAB_NAV_META, settingsTabsBaseNameKeys } from './settingsNavMeta';

type SettingsSectionPickerProps = {
    settingsTabs: SettingTabsDatum[];
    addonSettingsTabs: AddonWidgetEntry[];
    activeTab: string;
    pendingTabId?: string;
    showDangerZone: boolean;
    dangerZoneLabel: string;
    onSelect: (tabId: string) => void;
};

type SectionItem = {
    id: string;
    label: string;
    icon: typeof ShieldAlertIcon;
    danger?: boolean;
    hasPending?: boolean;
};

export function SettingsSectionPicker({
    settingsTabs,
    addonSettingsTabs,
    activeTab,
    pendingTabId,
    showDangerZone,
    dangerZoneLabel,
    onSelect,
}: SettingsSectionPickerProps) {
    const tabItems: SectionItem[] = SETTINGS_NAV_GROUP_ORDER.flatMap((groupId) => {
        const items: SectionItem[] = [];
        settingsTabs.forEach((tab, index) => {
            const nameKey = settingsTabsBaseNameKeys[index];
            const meta = SETTINGS_TAB_NAV_META[nameKey];
            if (!meta || meta.group !== groupId) return;
            items.push({
                id: tab.ctx.tabId,
                label: tab.ctx.tabName,
                icon: meta.icon,
                hasPending: pendingTabId === tab.ctx.tabId,
            });
        });
        return items;
    });

    const addonItems: SectionItem[] = addonSettingsTabs.map((w) => ({
        id: `addon-${w.addonId}-${w.title}`,
        label: w.title,
        icon: BlocksIcon,
        hasPending: pendingTabId === `addon-${w.addonId}-${w.title}`,
    }));

    const dangerItem: SectionItem | null = showDangerZone
        ? {
              id: 'danger-zone',
              label: dangerZoneLabel,
              icon: ShieldAlertIcon,
              danger: true,
              hasPending: pendingTabId === 'danger-zone',
          }
        : null;

    const allItems = [...tabItems, ...addonItems, ...(dangerItem ? [dangerItem] : [])];

    const renderChip = (item: SectionItem) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
            <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                    isActive
                        ? item.danger
                            ? 'border-destructive/50 bg-destructive/15 text-destructive-inline shadow-sm'
                            : 'border-primary/40 bg-primary/10 text-foreground shadow-sm'
                        : item.danger
                          ? 'border-destructive/25 text-destructive/80 hover:border-destructive/40 hover:bg-destructive/10'
                          : 'border-border/60 bg-background/50 text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground',
                )}
            >
                <Icon className="size-3.5 shrink-0 opacity-80" aria-hidden />
                <span>{item.label}</span>
                {item.hasPending ? (
                    <span className="bg-warning size-1.5 shrink-0 rounded-full" title="Unsaved changes" aria-hidden />
                ) : null}
            </button>
        );
    };

    return (
        <nav
            className="border-border/40 bg-card/95 mx-auto mb-6 flex w-fit max-w-full flex-wrap items-center justify-center gap-2 rounded-2xl border p-2 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:gap-2.5 sm:p-3"
            aria-label="Settings sections"
        >
            {allItems.map((item, index) => (
                <span key={item.id} className="contents">
                    {dangerItem && item.id === 'danger-zone' && index > 0 ? (
                        <span className="bg-border/70 mx-0.5 hidden h-6 w-px shrink-0 sm:block" aria-hidden />
                    ) : null}
                    {renderChip(item)}
                </span>
            ))}
        </nav>
    );
}
