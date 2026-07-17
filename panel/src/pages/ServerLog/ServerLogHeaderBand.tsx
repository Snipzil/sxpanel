import { LogInIcon, LogOutIcon, RadioIcon, ScrollTextIcon, SkullIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EventFilterKey } from '@/pages/ServerLog/serverLogTypes';

type ServerLogHeaderBandProps = {
    title: string;
    isLive: boolean;
    isConnected: boolean;
    totalEvents: number;
    eventCounts: Record<EventFilterKey, number>;
    activeSession: string | null;
};

/**
 * V2 header band for the Server Log page — mirrors the Players/History V2
 * band: icon tile, title + description, and stat pills surfacing the
 * connection state plus per-category counts that were previously buried in
 * tiny toolbar chips.
 */
export function ServerLogHeaderBand({
    title,
    isLive,
    isConnected,
    totalEvents,
    eventCounts,
    activeSession,
}: ServerLogHeaderBandProps) {
    const pill = (label: string, value: number, Icon: typeof ScrollTextIcon) => (
        <div className="border-border/50 bg-secondary/40 inline-flex items-center gap-2 rounded-full border px-3 py-1.5">
            <Icon className="text-muted-foreground size-3.5 shrink-0" />
            <span className="text-muted-foreground/70 text-[11px] font-semibold tracking-wider uppercase">{label}</span>
            <span className="text-foreground text-sm font-semibold tabular-nums">{value.toLocaleString()}</span>
        </div>
    );

    const connectionLabel = activeSession ? 'Session' : isLive ? (isConnected ? 'Live' : 'Connecting') : 'Paused';

    return (
        <div className="border-border/60 bg-background mb-4 rounded-xl border">
            <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="bg-secondary/50 text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-xl">
                        <ScrollTextIcon className="size-5" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-foreground text-lg font-semibold tracking-tight">{title}</h1>
                        <p className="text-muted-foreground mt-0.5 text-xs">
                            Follow joins, chat, deaths, and commands in real time — or replay a past session.
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div
                        className={cn(
                            'inline-flex items-center gap-2 rounded-full border px-3 py-1.5',
                            isLive && isConnected && !activeSession
                                ? 'border-success/30 bg-success/10'
                                : 'border-border/50 bg-secondary/40',
                        )}
                    >
                        <span className="relative flex size-2" aria-hidden="true">
                            {isLive && isConnected && !activeSession && (
                                <span className="bg-success absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
                            )}
                            <span
                                className={cn(
                                    'relative inline-flex size-2 rounded-full',
                                    isLive && isConnected && !activeSession ? 'bg-success' : 'bg-muted-foreground/50',
                                )}
                            />
                        </span>
                        <span
                            className={cn(
                                'text-[11px] font-semibold tracking-wider uppercase',
                                isLive && isConnected && !activeSession
                                    ? 'text-success-inline'
                                    : 'text-muted-foreground/70',
                            )}
                        >
                            {connectionLabel}
                        </span>
                    </div>
                    {pill('Events', totalEvents, RadioIcon)}
                    {pill('Joins', eventCounts.joins, LogInIcon)}
                    {pill('Leaves', eventCounts.leaves, LogOutIcon)}
                    {pill('Deaths', eventCounts.deaths, SkullIcon)}
                </div>
            </div>
        </div>
    );
}
