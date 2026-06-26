import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2Icon, BotIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DiscordBotStatus } from '@shared/enums';
import type { DiscordBotDiagnostics } from './diagnosticsModel';
const discordBotStatusTone: Record<DiscordBotStatus, string> = {
    [DiscordBotStatus.Disabled]: 'border-border bg-muted text-muted-foreground',
    [DiscordBotStatus.Starting]: 'border-border bg-info/15 text-info',
    [DiscordBotStatus.Ready]: 'border-border bg-success/15 text-success',
    [DiscordBotStatus.Error]: 'border-border bg-destructive/15 text-destructive',
};

function Pill({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <span
            className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold', className)}
        >
            {children}
        </span>
    );
}

export function BotStatusHero({
    discordBot,
    discordBotRuntimeUpdated,
    discordBotStatusLabel,
    isBotActionLoading,
    botActionState,
    onRestart,
    onReloadAddons,
    onResync,
}: {
    discordBot: DiscordBotDiagnostics;
    discordBotRuntimeUpdated: string;
    discordBotStatusLabel: string;
    isBotActionLoading: boolean;
    botActionState: { action: 'restart' | 'reload-addons' | 'resync' | null };
    onRestart: () => void;
    onReloadAddons: () => void;
    onResync: () => void;
}) {
    const statusTone = discordBotStatusTone[discordBot.status] ?? discordBotStatusTone[DiscordBotStatus.Disabled];

    return (
        <div className="border-border/60 bg-card rounded-xl border p-4 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 flex-1 gap-3">
                    <div className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-lg">
                        <BotIcon className="text-foreground size-4" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                        <div>
                            <h2 className="text-foreground text-base font-semibold">Discord Bot</h2>
                            <p className="text-muted-foreground text-sm">
                                Guild <span className="text-foreground font-medium">{discordBot.guildName ?? '—'}</span>
                                <span className="text-muted-foreground/70"> · </span>
                                Runtime updated{' '}
                                <span className="text-foreground font-mono text-xs">{discordBotRuntimeUpdated}</span>
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Pill className={statusTone}>{discordBotStatusLabel}</Pill>
                            <Pill className="border-border bg-background text-foreground">
                                {discordBot.bridge.isConnected ? 'Bridge connected' : 'Bridge disconnected'}
                            </Pill>
                            <Pill className="border-border bg-background text-foreground">
                                {discordBot.process.isRunning ? 'Process running' : 'Process stopped'}
                            </Pill>
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={isBotActionLoading || !discordBot.enabled}
                        onClick={onRestart}
                    >
                        {botActionState.action === 'restart' && <Loader2Icon className="mr-2 size-4 animate-spin" />}
                        Restart Runtime
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={isBotActionLoading || !discordBot.enabled}
                        onClick={onReloadAddons}
                    >
                        {botActionState.action === 'reload-addons' && (
                            <Loader2Icon className="mr-2 size-4 animate-spin" />
                        )}
                        Retry Addon Load
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={isBotActionLoading || !discordBot.enabled}
                        onClick={onResync}
                    >
                        {botActionState.action === 'resync' && <Loader2Icon className="mr-2 size-4 animate-spin" />}
                        Resync Runtime
                    </Button>
                </div>
            </div>
        </div>
    );
}
