import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { ClockIcon, UserCheckIcon, UsersIcon, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBackendApi } from '@/hooks/fetch';
import { useLocale } from '@/hooks/locale';
import type { ApiWhitelistAnalyticsResp } from '@shared/whitelistApiTypes';
import { WhitelistHeaderBand } from './whitelist-header-band';
import { WhitelistPlayersPanel } from './whitelist-players-panel';
import { WhitelistRequestsPanel } from './whitelist-requests-panel';
import { WhitelistApprovalsPanel } from './whitelist-approvals-panel';
import type { WhitelistTabCounts, WhitelistTabId } from './whitelist-types';

const TAB_DEFS: { id: WhitelistTabId; key: string; icon: LucideIcon }[] = [
    { id: 'players', key: 'players', icon: UsersIcon },
    { id: 'requests', key: 'requests', icon: ClockIcon },
    { id: 'approvals', key: 'approvals', icon: UserCheckIcon },
];

export default function WhitelistPageContent() {
    const { t } = useLocale();
    const tabs = useMemo(
        () =>
            TAB_DEFS.map((def) => ({
                id: def.id,
                icon: def.icon,
                label: t(`panel.whitelist.tabs.${def.key}.label`),
                shortLabel: t(`panel.whitelist.tabs.${def.key}.short`),
                subtitle: t(`panel.whitelist.tabs.${def.key}.subtitle`),
            })),
        [t],
    );

    const [activeTab, setActiveTab] = useState<WhitelistTabId>('players');
    const [counts, setCounts] = useState<WhitelistTabCounts>({});

    const handlePlayersCount = useCallback((total: number | undefined) => {
        setCounts((prev) => ({ ...prev, players: total }));
    }, []);
    const handleRequestsCount = useCallback((total: number | undefined) => {
        setCounts((prev) => ({ ...prev, requests: total }));
    }, []);
    const handleApprovalsCount = useCallback((total: number | undefined) => {
        setCounts((prev) => ({ ...prev, approvals: total }));
    }, []);

    const analyticsApi = useBackendApi<ApiWhitelistAnalyticsResp>({
        method: 'GET',
        path: '/whitelist/analytics/summary',
        throwGenericErrors: true,
    });
    const analyticsSwr = useSWR('/whitelist/analytics/summary', async () => {
        const data = await analyticsApi({});
        if (!data || 'error' in data) throw new Error('Failed to load analytics');
        return data;
    });

    const activeMeta = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

    return (
        <div className="h-contentvh flex w-full min-w-0 flex-col">
            <WhitelistHeaderBand counts={counts} activeTab={activeTab} analytics={analyticsSwr.data} />

            <div className="border-border/60 bg-secondary/25 mb-4 inline-flex w-full flex-wrap gap-1 rounded-xl border p-1 sm:w-auto">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                'inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:flex-initial',
                                isActive
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-background/60',
                            )}
                        >
                            <Icon className="size-4 shrink-0 opacity-80" />
                            <span className="truncate">{tab.shortLabel}</span>
                        </button>
                    );
                })}
            </div>

            <div className="mb-3">
                <h2 className="text-foreground text-lg font-semibold tracking-tight">{activeMeta.label}</h2>
                <p className="text-muted-foreground text-sm">{activeMeta.subtitle}</p>
            </div>

            {activeTab === 'players' && <WhitelistPlayersPanel onCountChange={handlePlayersCount} />}
            {activeTab === 'requests' && <WhitelistRequestsPanel onCountChange={handleRequestsCount} />}
            {activeTab === 'approvals' && <WhitelistApprovalsPanel onCountChange={handleApprovalsCount} />}
        </div>
    );
}
