import { ClockIcon, ShieldCheckIcon, UserCheckIcon, UsersIcon, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WhitelistAnalyticsSummary } from '@shared/whitelistApiTypes';
import type { WhitelistTabCounts, WhitelistTabId } from './whitelist-types';
import { useLocale } from '@/hooks/locale';

type WhitelistHeaderBandProps = {
    counts: WhitelistTabCounts;
    activeTab: WhitelistTabId;
    analytics?: WhitelistAnalyticsSummary;
};

function StatPill({
    label,
    value,
    icon: Icon,
    active,
}: {
    label: string;
    value: number | undefined;
    icon: LucideIcon;
    active: boolean;
}) {
    const show = value !== undefined;
    return (
        <div
            className={cn(
                'border-border/50 bg-secondary/40 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 transition-colors',
                active && 'border-primary/35 bg-primary/8 ring-primary/20 ring-1',
                !show && 'opacity-60',
            )}
        >
            <Icon className="text-muted-foreground size-3.5 shrink-0" />
            <span className="text-muted-foreground/70 text-[11px] font-semibold tracking-wider uppercase">{label}</span>
            <span className="text-foreground text-sm font-semibold tabular-nums">
                {show ? value.toLocaleString() : '—'}
            </span>
        </div>
    );
}

export function WhitelistHeaderBand({ counts, activeTab, analytics }: WhitelistHeaderBandProps) {
    const { t } = useLocale();
    const approvalRate =
        analytics && analytics.approvedApplications + analytics.deniedApplications > 0
            ? Math.round(
                  (analytics.approvedApplications / (analytics.approvedApplications + analytics.deniedApplications)) *
                      100,
              )
            : undefined;

    return (
        <div className="border-border/60 bg-background mb-4 rounded-xl border">
            <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="bg-secondary/50 text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-xl">
                        <ShieldCheckIcon className="size-5" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-foreground text-lg font-semibold tracking-tight">
                            {t('panel.whitelist.page_title')}
                        </h1>
                        <p className="text-muted-foreground mt-0.5 text-xs">{t('panel.whitelist.page_subtitle')}</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <StatPill
                        label={t('panel.whitelist.stats.players')}
                        value={counts.players}
                        icon={UsersIcon}
                        active={activeTab === 'players'}
                    />
                    <StatPill
                        label={t('panel.whitelist.stats.requests')}
                        value={counts.requests}
                        icon={ClockIcon}
                        active={activeTab === 'requests'}
                    />
                    <StatPill
                        label={t('panel.whitelist.stats.pending')}
                        value={counts.approvals}
                        icon={UserCheckIcon}
                        active={activeTab === 'approvals'}
                    />
                    {approvalRate !== undefined ? (
                        <StatPill
                            label={t('panel.whitelist.stats.approved_pct')}
                            value={approvalRate}
                            icon={ShieldCheckIcon}
                            active={false}
                        />
                    ) : null}
                    {analytics?.avgApprovalWaitSeconds != null ? (
                        <StatPill
                            label={t('panel.whitelist.stats.avg_wait')}
                            value={analytics.avgApprovalWaitSeconds}
                            icon={ClockIcon}
                            active={false}
                        />
                    ) : null}
                    {analytics?.pendingOlderThan24h ? (
                        <StatPill
                            label={t('panel.whitelist.stats.stale_24h')}
                            value={analytics.pendingOlderThan24h}
                            icon={ClockIcon}
                            active={false}
                        />
                    ) : null}
                    {analytics?.connectedLast7d !== undefined ? (
                        <StatPill
                            label={t('panel.whitelist.stats.joined_7d')}
                            value={analytics.connectedLast7d}
                            icon={UsersIcon}
                            active={false}
                        />
                    ) : null}
                </div>
            </div>
        </div>
    );
}
