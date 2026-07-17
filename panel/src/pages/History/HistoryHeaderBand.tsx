import { AlertTriangleIcon, ClockIcon, GavelIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type HistoryHeaderBandProps = {
    totalWarns?: number;
    warnsLast7d?: number;
    totalBans?: number;
    bansLast7d?: number;
    statsLoading: boolean;
};

export function HistoryHeaderBand({
    totalWarns,
    warnsLast7d,
    totalBans,
    bansLast7d,
    statsLoading,
}: HistoryHeaderBandProps) {
    const pill = (label: string, value: number | undefined, opts?: { prefix?: string; icon?: typeof ClockIcon }) => {
        const Icon = opts?.icon ?? ClockIcon;
        const show = !statsLoading && value !== undefined;
        return (
            <div
                className={cn(
                    'border-border/50 bg-secondary/40 inline-flex items-center gap-2 rounded-full border px-3 py-1.5',
                    !show && 'opacity-60',
                )}
            >
                <Icon className="text-muted-foreground size-3.5 shrink-0" />
                <span className="text-muted-foreground/70 text-[11px] font-semibold tracking-wider uppercase">
                    {label}
                </span>
                <span className="text-foreground text-sm font-semibold tabular-nums">
                    {show ? `${opts?.prefix ?? ''}${value.toLocaleString()}` : '—'}
                </span>
            </div>
        );
    };

    return (
        <div className="border-border/60 bg-background mb-4 rounded-xl border">
            <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="bg-secondary/50 text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-xl">
                        <ClockIcon className="size-5" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-foreground text-lg font-semibold tracking-tight">History</h1>
                        <p className="text-muted-foreground mt-0.5 text-xs">
                            Audit bans, warns, and kicks — filter by staff or action type.
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {pill('Warns', totalWarns, { icon: AlertTriangleIcon })}
                    {pill('New warns 7d', warnsLast7d, { prefix: '+', icon: AlertTriangleIcon })}
                    {pill('Bans', totalBans, { icon: GavelIcon })}
                    {pill('New bans 7d', bansLast7d, { prefix: '+', icon: GavelIcon })}
                </div>
            </div>
        </div>
    );
}
