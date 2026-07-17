import { RadioIcon, SettingsIcon, ShieldIcon, TerminalIcon, ZapIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageHeaderChangelog } from '@/components/page-header';
import type { ConfigChangelogEntry } from '@shared/otherTypes';
import type { ActionLogFilterKey } from '@/pages/ActionLog/actionLogTypes';

type ActionLogHeaderBandProps = {
    title: string;
    isLive: boolean;
    isConnected: boolean;
    totalEvents: number;
    eventCounts: Record<ActionLogFilterKey, number>;
    activeSession: string | null;
    changelogData: ConfigChangelogEntry[];
};

/**
 * V2 header band for the Action Log page — icon tile, description,
 * connection status pill, event count pills, and the config changelog
 * popover carried over from the V1 PageHeader.
 */
export function ActionLogHeaderBand({
    title,
    isLive,
    isConnected,
    totalEvents,
    eventCounts,
    activeSession,
    changelogData,
}: ActionLogHeaderBandProps) {
    const pill = (label: string, value: number, Icon: typeof ZapIcon) => (
        <div className="border-border/50 bg-secondary/40 inline-flex items-center gap-2 rounded-full border px-3 py-1.5">
            <Icon className="text-muted-foreground size-3.5 shrink-0" />
            <span className="text-muted-foreground/70 text-[11px] font-semibold tracking-wider uppercase">{label}</span>
            <span className="text-foreground text-sm font-semibold tabular-nums">{value.toLocaleString()}</span>
        </div>
    );

    const isStreaming = isLive && isConnected && !activeSession;
    const connectionLabel = activeSession ? 'Session' : isLive ? (isConnected ? 'Live' : 'Connecting') : 'Paused';

    return (
        <div className="border-border/60 bg-background mb-4 rounded-xl border">
            <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="bg-secondary/50 text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-xl">
                        <ShieldIcon className="size-5" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-foreground text-lg font-semibold tracking-tight">{title}</h1>
                        <p className="text-muted-foreground mt-0.5 text-xs">
                            Review administrative activity and configuration changes.
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div
                        className={cn(
                            'inline-flex items-center gap-2 rounded-full border px-3 py-1.5',
                            isStreaming ? 'border-success/30 bg-success/10' : 'border-border/50 bg-secondary/40',
                        )}
                    >
                        <span className="relative flex size-2" aria-hidden="true">
                            {isStreaming && (
                                <span className="bg-success absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
                            )}
                            <span
                                className={cn(
                                    'relative inline-flex size-2 rounded-full',
                                    isStreaming ? 'bg-success' : 'bg-muted-foreground/50',
                                )}
                            />
                        </span>
                        <span
                            className={cn(
                                'text-[11px] font-semibold tracking-wider uppercase',
                                isStreaming ? 'text-success-inline' : 'text-muted-foreground/70',
                            )}
                        >
                            {connectionLabel}
                        </span>
                    </div>
                    {pill('Events', totalEvents, RadioIcon)}
                    {pill('Actions', eventCounts.action, ZapIcon)}
                    {pill('Commands', eventCounts.command, TerminalIcon)}
                    {pill('Config', eventCounts.config, SettingsIcon)}
                    <div className="bg-border/60 mx-1 hidden h-6 w-px sm:block" aria-hidden="true" />
                    <PageHeaderChangelog changelogData={changelogData} />
                </div>
            </div>
        </div>
    );
}
