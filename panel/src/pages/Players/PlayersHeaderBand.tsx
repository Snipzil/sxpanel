import { UsersIcon, UserRoundPlusIcon, ActivityIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type PlayersHeaderBandProps = {
    total?: number;
    playedLast24h?: number;
    joinedLast24h?: number;
    joinedLast7d?: number;
    statsLoading: boolean;
};

export function PlayersHeaderBand({
    total,
    playedLast24h,
    joinedLast24h,
    joinedLast7d,
    statsLoading,
}: PlayersHeaderBandProps) {
    const pill = (label: string, value: number | undefined, opts?: { prefix?: string; icon?: typeof UsersIcon }) => {
        const Icon = opts?.icon ?? UsersIcon;
        const show = !statsLoading && value !== undefined;
        return (
            <div
                className={cn(
                    'border-border/50 bg-muted/15 inline-flex items-center gap-2 rounded-full border px-3 py-1.5',
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
        <div className="border-border/60 bg-card mb-4 rounded-xl border shadow-sm">
            <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-xl">
                        <UsersIcon className="text-foreground size-5" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-foreground text-lg font-semibold tracking-tight">Players</h1>
                        <p className="text-muted-foreground mt-0.5 text-xs">
                            Browse the roster, search identifiers, and open profiles.
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {pill('Total', total, { icon: UsersIcon })}
                    {pill('Active 24h', playedLast24h, { icon: ActivityIcon })}
                    {pill('New 24h', joinedLast24h, { prefix: '+', icon: UserRoundPlusIcon })}
                    {pill('New 7d', joinedLast7d, { prefix: '+', icon: UserRoundPlusIcon })}
                </div>
            </div>
        </div>
    );
}
