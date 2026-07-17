import { ArchiveIcon, BarChart2Icon, CheckCircle2Icon, EyeIcon, FlagIcon, Loader2Icon } from 'lucide-react';
import { navigate } from 'wouter/use-browser-location';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ReportsHeaderStats = {
    open: number;
    inReview: number;
    resolved: number;
    archived: number;
};

type ReportsHeaderBandProps = {
    title: string;
    stats?: ReportsHeaderStats;
    isRefreshing: boolean;
    onRefresh: () => void;
    refreshLabel: string;
    analyticsLabel: string;
};

/**
 * V2 header band for the Reports page — icon tile, description, ticket
 * status stat pills (replacing the loose badges in PageHeader), and the
 * Analytics/Refresh actions.
 */
export function ReportsHeaderBand({
    title,
    stats,
    isRefreshing,
    onRefresh,
    refreshLabel,
    analyticsLabel,
}: ReportsHeaderBandProps) {
    const pill = (label: string, value: number | undefined, Icon: typeof FlagIcon, accent?: 'destructive' | 'info') => (
        <div
            className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1.5',
                accent === 'destructive' && value
                    ? 'border-destructive/40 bg-destructive/10'
                    : accent === 'info' && value
                      ? 'border-info/40 bg-info/10'
                      : 'border-border/50 bg-secondary/40',
                value === undefined && 'opacity-60',
            )}
        >
            <Icon
                className={cn(
                    'size-3.5 shrink-0',
                    accent === 'destructive' && value
                        ? 'text-destructive-inline'
                        : accent === 'info' && value
                          ? 'text-info-inline'
                          : 'text-muted-foreground',
                )}
            />
            <span className="text-muted-foreground/70 text-[11px] font-semibold tracking-wider uppercase">{label}</span>
            <span className="text-foreground text-sm font-semibold tabular-nums">
                {value !== undefined ? value.toLocaleString() : '—'}
            </span>
        </div>
    );

    return (
        <div className="border-border/60 bg-background mb-4 rounded-xl border">
            <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="bg-secondary/50 text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-xl">
                        <FlagIcon className="size-5" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-foreground text-lg font-semibold tracking-tight">{title}</h1>
                        <p className="text-muted-foreground mt-0.5 text-xs">
                            Player reports and tickets — triage, claim, and resolve.
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {pill('Open', stats?.open, FlagIcon, 'destructive')}
                    {pill('In review', stats?.inReview, EyeIcon, 'info')}
                    {pill('Resolved', stats?.resolved, CheckCircle2Icon)}
                    {pill('Archived', stats?.archived, ArchiveIcon)}
                    <div className="bg-border/60 mx-1 hidden h-6 w-px sm:block" aria-hidden="true" />
                    <Button variant="outline" size="sm" onClick={() => navigate('/reports/analytics')}>
                        <BarChart2Icon className="mr-1.5 size-4" />
                        {analyticsLabel}
                    </Button>
                    <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
                        {isRefreshing ? <Loader2Icon className="size-4 animate-spin" /> : refreshLabel}
                    </Button>
                </div>
            </div>
        </div>
    );
}
