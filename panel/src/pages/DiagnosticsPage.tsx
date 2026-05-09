import { useState, type ReactNode } from 'react';
import { useBackendApi } from '@/hooks/fetch';
import { Button } from '@/components/ui/button';
import { Loader2Icon, ActivityIcon } from 'lucide-react';
import useSWR from 'swr';
import { msToShortDuration } from '@/lib/dateTime';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiTimeout } from '@/hooks/fetch';
import { PageHeader } from '@/components/page-header';
import type { BotCommandAnalyticsSummary } from '@shared/discordBotAnalyticsTypes';
import { DiscordBotStatus } from '@shared/enums';

type DiagnosticsSectionId = 'overview' | 'discord' | 'commandAnalytics' | 'fxserver' | 'processes' | 'report';

type DiscordBotDiagnostics = {
    enabled: boolean;
    status: DiscordBotStatus;
    isClientReady: boolean;
    guildName: string | null;
    lastReadyAt: number | null;
    lastBotError: {
        code: string | null;
        message: string;
        at: number;
    } | null;
    lastProcessFailure: {
        reason: string;
        at: number;
    } | null;
    lastRecoveryAction: {
        action: 'restartRuntime' | 'reloadAddons' | 'resyncRuntime';
        source: 'manual' | 'automatic';
        ok: boolean;
        message: string;
        at: number;
    } | null;
    bridge: {
        isConnected: boolean;
        connectCount: number;
        disconnectCount: number;
        lastAuthenticatedAt: number | null;
        lastDisconnectedAt: number | null;
        disconnectedForMs: number | null;
        lastReconnectDurationMs: number | null;
        autoHealAt: number | null;
    };
    process: {
        isRunning: boolean;
        hasPendingRestart: boolean;
        nextRestartDelayMs: number | null;
        lastOutputLine: string | null;
        lastErrorLine: string | null;
    };
    runtime: {
        addonLoadFailures: Array<{
            kind: 'command' | 'event';
            filePath: string;
            message: string;
            addonId: string | null;
            updatedAt: number;
        }>;
        updatedAt: number | null;
    };
};

type DiagnosticsData = {
    message: string;
    host?: {
        error?: string;
        static?: {
            nodeVersion: string;
            osDistro: string;
            username: string;
            cpu: {
                manufacturer: string;
                brand: string;
                physicalCores: number;
                cores: number;
                speedMin: number;
            };
        };
        dynamic?: {
            cpuUsage: number;
            memory: {
                usage: number | null;
                used: number | null;
                total: number | null;
            };
        };
    };
    txadmin: {
        uptime: string;
        databaseFileSize: string;
        txEnv: {
            fxsPath: string;
            profilePath: string;
        };
        txHostConfig: {
            defaults: string[];
            netInterface?: string;
            providerName?: string;
        };
        monitor: {
            hbFails: { http: number; fd3: number };
            restarts: {
                bootTimeout: number;
                close: number;
                heartBeat: number;
                healthCheck: number;
                both: number;
            };
        };
        performance: {
            banCheck: string;
            whitelistCheck: string;
            playersTableSearch: string;
            historyTableSearch: string;
            databaseSave: string;
            perfCollection: string;
        };
        memoryUsage: {
            heap_used: string;
            heap_limit: string;
            heap_pct: string;
            physical: string;
            peak_malloced: string;
        };
        logger: {
            storageSize: string;
            statusAdmin: string;
            statusFXServer: string;
            statusServer: string;
        };
    };
    fxserver?: {
        error?: string | false;
        versionMismatch?: boolean;
        status?: string;
        statusColor?: string;
        version?: string;
        resources?: number;
        onesync?: string;
        maxClients?: number;
        txAdminVersion?: string;
    };
    processes?: Array<{
        pid: number;
        name: string;
        ppid: number;
        memory: number | null;
        cpu: number | null;
    }>;
    discordBot: DiscordBotDiagnostics;
    botCommandAnalytics?: BotCommandAnalyticsSummary;
};

type SendReportResp = {
    reportId?: string;
    error?: string;
};

type DiscordBotActionResp = {
    success?: boolean;
    message?: string;
    error?: string;
    diagnostics?: DiscordBotDiagnostics;
};

const discordBotStatusLabels = {
    [DiscordBotStatus.Disabled]: 'DISABLED',
    [DiscordBotStatus.Starting]: 'STARTING',
    [DiscordBotStatus.Ready]: 'READY',
    [DiscordBotStatus.Error]: 'ERROR',
} as const;

const discordBotStatusTone = {
    [DiscordBotStatus.Disabled]: 'border-border bg-muted text-muted-foreground',
    [DiscordBotStatus.Starting]: 'border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-400',
    [DiscordBotStatus.Ready]: 'border-green-500/25 bg-green-500/10 text-green-700 dark:text-green-400',
    [DiscordBotStatus.Error]: 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-400',
} as const;

const emptyBotCommandRollup = {
    total: 0,
    success: 0,
    denied: 0,
    failed: 0,
    timedOut: 0,
    successRate: 0,
    avgInteractionAckMs: 0,
    avgBridgeRoundtripMs: 0,
    avgHandlerDurationMs: 0,
};

const emptyBotCommandAnalytics: BotCommandAnalyticsSummary = {
    overview: {
        total: 0,
        success: 0,
        denied: 0,
        failed: 0,
        timedOut: 0,
        uniqueCommands: 0,
        successRate: 0,
    },
    latency: {
        avgInteractionAckMs: 0,
        p95InteractionAckMs: 0,
        avgBridgeRoundtripMs: 0,
        p95BridgeRoundtripMs: 0,
        avgHandlerDurationMs: 0,
        p95HandlerDurationMs: 0,
    },
    byCommand: [],
    denialReasons: [],
    timelineDays: [],
    rollups: {
        '7d': { ...emptyBotCommandRollup },
        '30d': { ...emptyBotCommandRollup },
    },
};

const formatTimestamp = (value: number | null) => {
    if (!value) return '--';
    return new Date(value).toLocaleString();
};

const formatDuration = (value: number | null) => {
    if (value === null) return '--';

    return msToShortDuration(value, {
        units: value >= 60_000 ? ['h', 'm', 's'] : ['m', 's'],
        delimiter: ' ',
    });
};

const formatLatency = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '--';
    if (value < 1000) return `${Math.round(value)}ms`;
    return formatDuration(value);
};

const formatRecoveryAction = (action: DiscordBotDiagnostics['lastRecoveryAction']) => {
    if (!action) return '--';

    const actionLabel =
        action.action === 'restartRuntime'
            ? 'Restart runtime'
            : action.action === 'reloadAddons'
              ? 'Reload addons'
              : 'Resync runtime';
    const sourceLabel = action.source === 'automatic' ? 'automatic' : 'manual';
    return `${actionLabel} (${sourceLabel}, ${action.ok ? 'ok' : 'failed'})`;
};

const diagnosticsSections: Array<{ id: DiagnosticsSectionId; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'discord', label: 'Discord Bot' },
    { id: 'commandAnalytics', label: 'Command Analytics' },
    { id: 'fxserver', label: 'FXServer' },
    { id: 'processes', label: 'Processes' },
    { id: 'report', label: 'Support' },
];

function DiagnosticsPill({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${className ?? ''}`}>
            {children}
        </span>
    );
}

function DiagnosticsMiniCard({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) {
    return (
        <div className="bg-muted/30 rounded-lg border p-3">
            <h3 className="text-foreground mb-2 text-xs font-semibold tracking-wide uppercase">{title}</h3>
            <div className="space-y-2">{children}</div>
        </div>
    );
}

function DiagnosticsMetricCard({
    label,
    value,
    detail,
    tone,
}: {
    label: string;
    value: ReactNode;
    detail?: ReactNode;
    tone?: string;
}) {
    return (
        <div className="bg-muted/30 rounded-lg border p-3">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{label}</p>
            <p className={`mt-2 text-2xl font-semibold ${tone ?? 'text-foreground'}`}>{value}</p>
            {detail && <p className="text-muted-foreground mt-1 text-xs">{detail}</p>}
        </div>
    );
}

function DiagnosticsKeyValue({
    label,
    value,
    mono = false,
    breakAll = false,
}: {
    label: string;
    value: ReactNode;
    mono?: boolean;
    breakAll?: boolean;
}) {
    return (
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <span className="text-muted-foreground text-xs">{label}</span>
            <span
                className={`text-right text-sm ${mono ? 'font-mono text-xs' : ''} ${breakAll ? 'break-all' : ''}`}
            >
                {value}
            </span>
        </div>
    );
}

function CpuBadge({ cores, speed }: { cores: number; speed: number }) {
    if (speed <= 2.4) {
        return (
            <span className="bg-destructive text-destructive-foreground ml-1 rounded px-1.5 py-0.5 text-xs font-bold">
                VERY SLOW!
            </span>
        );
    }
    if (speed < 3.0 && cores < 8) {
        return (
            <span className="bg-warning text-warning-foreground ml-1 rounded px-1.5 py-0.5 text-xs font-bold">
                SLOW
            </span>
        );
    }
    return null;
}

export default function DiagnosticsPage() {
    const [section, setSection] = useState<DiagnosticsSectionId>('overview');
    const [reportModalOpen, setReportModalOpen] = useState(false);
    const [reportState, setReportState] = useState<'info' | 'loading' | 'success' | 'error'>('info');
    const [reportId, setReportId] = useState('');
    const [reportError, setReportError] = useState('');
    const [botActionState, setBotActionState] = useState<{
        action: 'restart' | 'reload-addons' | 'resync' | null;
        error: string;
        message: string;
    }>({
        action: null,
        error: '',
        message: '',
    });

    const dataApi = useBackendApi<DiagnosticsData>({
        method: 'GET',
        path: '/diagnostics/data',
    });

    const reportApi = useBackendApi<SendReportResp>({
        method: 'POST',
        path: '/diagnostics/sendReport',
    });

    const botActionApi = useBackendApi<DiscordBotActionResp>({
        method: 'POST',
        path: '/diagnostics/discordBot/:action',
    });

    const {
        data,
        error: swrError,
        isLoading,
        mutate,
    } = useSWR('/diagnostics/data', async () => {
        let resp: DiagnosticsData | undefined;
        let fetchError: string | undefined;
        await dataApi({
            success: (d) => {
                resp = d;
            },
            error: (msg) => {
                fetchError = msg;
            },
        });
        if (fetchError) throw new Error(fetchError);
        return resp;
    });

    const handleBotAction = (action: 'restart' | 'reload-addons' | 'resync') => {
        setBotActionState({
            action,
            error: '',
            message: '',
        });

        botActionApi({
            pathParams: { action },
            timeout: ApiTimeout.LONG,
            success: (response) => {
                setBotActionState({
                    action: null,
                    error: response.error ?? '',
                    message: response.message ?? '',
                });

                if (response.diagnostics) {
                    void mutate(
                        (current) => (current ? { ...current, discordBot: response.diagnostics ?? current.discordBot } : current),
                        false,
                    );
                }

                void mutate();
            },
            error: (message) => {
                setBotActionState({
                    action: null,
                    error: message,
                    message: '',
                });
            },
        });
    };

    const handleSendReport = () => {
        setReportState('loading');
        reportApi({
            data: { bugfix: true },
            timeout: ApiTimeout.REALLY_REALLY_LONG,
            success(d) {
                if (d.error) {
                    setReportState('error');
                    setReportError(d.error);
                } else if (d.reportId) {
                    setReportState('success');
                    setReportId(d.reportId);
                } else {
                    setReportState('error');
                    setReportError('Unknown backend error.');
                }
            },
            error(msg) {
                setReportState('error');
                setReportError(msg);
            },
        });
    };

    if (isLoading || (!data && !swrError)) {
        return (
            <div className="flex min-h-96 items-center justify-center">
                <Loader2Icon className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    if (swrError || !data) {
        return (
            <div className="flex min-h-96 flex-col items-center justify-center gap-2">
                <p className="text-destructive">Failed to load diagnostics data.</p>
                <p className="text-muted-foreground text-sm">{swrError?.message ?? 'Unknown error'}</p>
            </div>
        );
    }

    const { host, txadmin, fxserver, processes, discordBot } = data;
    const botCommandAnalytics = data.botCommandAnalytics ?? emptyBotCommandAnalytics;
    const {
        overview: commandOverview,
        latency: commandLatency,
        byCommand: commandBreakdown,
        denialReasons: commandDenialReasons,
        timelineDays: commandTimelineDays,
        rollups: commandRollups,
    } = botCommandAnalytics;
    const discordBotStatusLabel = discordBotStatusLabels[discordBot.status] ?? `CODE-${discordBot.status}`;
    const isBotActionLoading = botActionState.action !== null;
    const discordBotRuntimeUpdated = formatTimestamp(discordBot.runtime.updatedAt);
    const commandOutcomeRows = [
        { label: 'Success', count: commandOverview.success, colorClass: 'bg-success' },
        { label: 'Denied', count: commandOverview.denied, colorClass: 'bg-warning' },
        { label: 'Failed', count: commandOverview.failed, colorClass: 'bg-destructive' },
        { label: 'Timed Out', count: commandOverview.timedOut, colorClass: 'bg-muted-foreground' },
    ];

    return (
        <div className="mx-auto w-full max-w-(--breakpoint-xl) space-y-4 px-2 md:px-0">
            <PageHeader
                icon={<ActivityIcon />}
                title="Diagnostics"
                description="Inspect runtime health, process state, and support data."
            />

            <Tabs value={section} onValueChange={(value) => setSection(value as DiagnosticsSectionId)} className="space-y-4">
                <TabsList className="h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
                    {diagnosticsSections.map((item) => (
                        <TabsTrigger
                            key={item.id}
                            value={item.id}
                            className="data-[state=active]:bg-card data-[state=active]:border-border data-[state=active]:shadow-xs rounded-lg border border-transparent px-3 py-1.5"
                        >
                            {item.label}
                        </TabsTrigger>
                    ))}
                </TabsList>

                <TabsContent value="overview" className="mt-0 space-y-4">
                    <div className="grid gap-4 xl:grid-cols-2">
                        <div className="border-border/60 bg-card rounded-xl border p-4 shadow-sm">
                            <h2 className="text-muted-foreground/60 mb-3 text-sm font-medium tracking-wider uppercase">
                                Environment
                            </h2>
                            {!host ? (
                                <p className="text-muted-foreground text-sm">Host data not available.</p>
                            ) : host.error ? (
                                <p className="text-destructive">{host.error}</p>
                            ) : host.static ? (
                                <div className="space-y-1 text-sm">
                                    <p>
                                        <strong>Node:</strong> {host.static.nodeVersion}
                                    </p>
                                    <p>
                                        <strong>OS:</strong> {host.static.osDistro}
                                    </p>
                                    <p>
                                        <strong>Username:</strong> {host.static.username}
                                    </p>
                                    <p>
                                        <strong>CPU Model:</strong> {host.static.cpu.manufacturer} {host.static.cpu.brand}
                                    </p>
                                    <p>
                                        <strong>CPU Stats:</strong> {host.static.cpu.physicalCores}c/{host.static.cpu.cores}
                                        t - {host.static.cpu.speedMin} GHz
                                        <CpuBadge cores={host.static.cpu.cores} speed={host.static.cpu.speedMin} />
                                    </p>
                                    {host.dynamic ? (
                                        <>
                                            <p>
                                                <strong>CPU Usage:</strong> {host.dynamic.cpuUsage}%
                                            </p>
                                            <p>
                                                <strong>Memory:</strong> {host.dynamic.memory.usage ?? '--'}% (
                                                {host.dynamic.memory.used?.toFixed(2) ?? '--'}/
                                                {host.dynamic.memory.total?.toFixed(2) ?? '--'})
                                            </p>
                                        </>
                                    ) : (
                                        <p className="text-muted-foreground italic">Dynamic usage data not available.</p>
                                    )}
                                </div>
                            ) : null}
                        </div>

                        <div className="border-border/60 bg-card rounded-xl border p-4 shadow-sm">
                            <h2 className="text-muted-foreground/60 mb-3 text-sm font-medium tracking-wider uppercase">
                                fxPanel Runtime
                            </h2>
                            <div className="space-y-1 text-sm">
                                <p>
                                    <strong>Uptime:</strong> <code>{txadmin.uptime}</code>
                                </p>
                                <p>
                                    <strong>Versions:</strong> <code>v{window.txConsts.txaVersion}</code> /{' '}
                                    <code>b{window.txConsts.fxsVersion}</code>
                                </p>
                                <p>
                                    <strong>Database File Size:</strong> <code>{txadmin.databaseFileSize}</code>
                                </p>
                                <div>
                                    <strong>Env:</strong>
                                    <div className="text-muted-foreground ml-2">
                                        <p>
                                            ├─ FXServer: <code>{txadmin.txEnv.fxsPath}</code>
                                        </p>
                                        <p>
                                            ├─ Profile: <code>{txadmin.txEnv.profilePath}</code>
                                        </p>
                                        <p>
                                            ├─ Defaults:{' '}
                                            <code>
                                                {txadmin.txHostConfig.defaults.length > 0
                                                    ? txadmin.txHostConfig.defaults.join(', ')
                                                    : '--'}
                                            </code>
                                        </p>
                                        <p>
                                            ├─ Interface: <code>{txadmin.txHostConfig.netInterface ?? '--'}</code>
                                        </p>
                                        <p>
                                            └─ Provider: <code>{txadmin.txHostConfig.providerName ?? '--'}</code>
                                        </p>
                                    </div>
                                </div>
                                <div>
                                    <strong>Monitor:</strong>
                                    <div className="text-muted-foreground ml-2">
                                        <p>
                                            ├─ HB Fails: <code>HTTP {txadmin.monitor.hbFails.http}</code> /{' '}
                                            <code>FD3 {txadmin.monitor.hbFails.fd3}</code>
                                        </p>
                                        <p>
                                            └─ Restarts: <code>BT {txadmin.monitor.restarts.bootTimeout}</code> /{' '}
                                            <code>CL {txadmin.monitor.restarts.close}</code> /{' '}
                                            <code>HB {txadmin.monitor.restarts.heartBeat}</code> /{' '}
                                            <code>HC {txadmin.monitor.restarts.healthCheck}</code> /{' '}
                                            <code>BO {txadmin.monitor.restarts.both}</code>
                                        </p>
                                    </div>
                                </div>
                                <div>
                                    <strong>Performance Times:</strong>
                                    <div className="text-muted-foreground ml-2">
                                        <p>
                                            ├─ BanCheck: <code>{txadmin.performance.banCheck}</code>
                                        </p>
                                        <p>
                                            ├─ WhitelistCheck: <code>{txadmin.performance.whitelistCheck}</code>
                                        </p>
                                        <p>
                                            ├─ PlayersTable: <code>{txadmin.performance.playersTableSearch}</code>
                                        </p>
                                        <p>
                                            ├─ HistoryTable: <code>{txadmin.performance.historyTableSearch}</code>
                                        </p>
                                        <p>
                                            ├─ DatabaseSave: <code>{txadmin.performance.databaseSave}</code>
                                        </p>
                                        <p>
                                            └─ PerfCollection: <code>{txadmin.performance.perfCollection}</code>
                                        </p>
                                    </div>
                                </div>
                                <div>
                                    <strong>Memory:</strong>
                                    <div className="text-muted-foreground ml-2">
                                        <p>
                                            ├─ Heap:{' '}
                                            <code>
                                                {txadmin.memoryUsage.heap_used} / {txadmin.memoryUsage.heap_limit} (
                                                {txadmin.memoryUsage.heap_pct}%)
                                            </code>
                                        </p>
                                        <p>
                                            ├─ Physical: <code>{txadmin.memoryUsage.physical}</code>
                                        </p>
                                        <p>
                                            └─ Peak. Alloc.: <code>{txadmin.memoryUsage.peak_malloced}</code>
                                        </p>
                                    </div>
                                </div>
                                <div>
                                    <strong>Logger Status:</strong>
                                    <div className="text-muted-foreground ml-2">
                                        <p>
                                            ├─ Storage Size: <code>{txadmin.logger.storageSize}</code>
                                        </p>
                                        <p>
                                            ├─ Admin: <code>{txadmin.logger.statusAdmin}</code>
                                        </p>
                                        <p>
                                            ├─ FXServer: <code>{txadmin.logger.statusFXServer}</code>
                                        </p>
                                        <p>
                                            └─ Server: <code>{txadmin.logger.statusServer}</code>
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="border-border/60 bg-card rounded-xl border p-4 shadow-sm">
                        <h2 className="text-muted-foreground/60 mb-2 text-sm font-medium tracking-wider uppercase">
                            Snapshot Metadata
                        </h2>
                        <p className="text-muted-foreground text-sm">{data.message}</p>
                    </div>
                </TabsContent>

                <TabsContent value="discord" className="mt-0 space-y-4">
                    <div className="border-border/60 bg-card rounded-xl border p-4 shadow-sm">
                        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-2">
                                <h2 className="text-muted-foreground/60 text-sm font-medium tracking-wider uppercase">
                                    Discord Bot
                                </h2>
                                <div className="flex flex-wrap items-center gap-2">
                                    <DiagnosticsPill className={discordBotStatusTone[discordBot.status] ?? discordBotStatusTone[DiscordBotStatus.Disabled]}>
                                        {discordBotStatusLabel}
                                    </DiagnosticsPill>
                                    <DiagnosticsPill className="border-border bg-background text-foreground">
                                        {discordBot.bridge.isConnected ? 'Bridge Connected' : 'Bridge Disconnected'}
                                    </DiagnosticsPill>
                                    <DiagnosticsPill className="border-border bg-background text-foreground">
                                        {discordBot.process.isRunning ? 'Process Running' : 'Process Stopped'}
                                    </DiagnosticsPill>
                                </div>
                                <p className="text-muted-foreground text-sm">
                                    Guild: <span className="text-foreground font-medium">{discordBot.guildName ?? '--'}</span>
                                    {' · '}
                                    Runtime diagnostics updated: <span className="text-foreground">{discordBotRuntimeUpdated}</span>
                                </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={isBotActionLoading || !discordBot.enabled}
                                    onClick={() => handleBotAction('restart')}
                                >
                                    {botActionState.action === 'restart' && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
                                    Restart Runtime
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={isBotActionLoading || !discordBot.enabled}
                                    onClick={() => handleBotAction('reload-addons')}
                                >
                                    {botActionState.action === 'reload-addons' && (
                                        <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                                    )}
                                    Retry Addon Load
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={isBotActionLoading || !discordBot.enabled}
                                    onClick={() => handleBotAction('resync')}
                                >
                                    {botActionState.action === 'resync' && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
                                    Resync Runtime
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-4 text-sm">
                            <div className="grid gap-3 xl:grid-cols-2">
                                <DiagnosticsMiniCard title="Bridge Health">
                                    <DiagnosticsKeyValue label="Connected" value={discordBot.bridge.isConnected ? 'Yes' : 'No'} />
                                    <DiagnosticsKeyValue
                                        label="Connect / Disconnect"
                                        value={`${discordBot.bridge.connectCount} / ${discordBot.bridge.disconnectCount}`}
                                        mono
                                    />
                                    <DiagnosticsKeyValue label="Last Auth" value={formatTimestamp(discordBot.bridge.lastAuthenticatedAt)} mono />
                                    <DiagnosticsKeyValue
                                        label="Last Disconnect"
                                        value={formatTimestamp(discordBot.bridge.lastDisconnectedAt)}
                                        mono
                                    />
                                    <DiagnosticsKeyValue
                                        label="Down For"
                                        value={formatDuration(discordBot.bridge.disconnectedForMs)}
                                        mono
                                    />
                                    <DiagnosticsKeyValue
                                        label="Reconnect Time"
                                        value={formatDuration(discordBot.bridge.lastReconnectDurationMs)}
                                        mono
                                    />
                                    <DiagnosticsKeyValue
                                        label="Auto Heal At"
                                        value={formatTimestamp(discordBot.bridge.autoHealAt)}
                                        mono
                                    />
                                </DiagnosticsMiniCard>

                                <DiagnosticsMiniCard title="Runtime State">
                                    <DiagnosticsKeyValue label="Client Ready" value={discordBot.isClientReady ? 'Yes' : 'No'} />
                                    <DiagnosticsKeyValue label="Last Ready" value={formatTimestamp(discordBot.lastReadyAt)} mono />
                                    <DiagnosticsKeyValue
                                        label="Pending Restart"
                                        value={discordBot.process.hasPendingRestart ? 'Yes' : 'No'}
                                    />
                                    <DiagnosticsKeyValue
                                        label="Restart Delay"
                                        value={formatDuration(discordBot.process.nextRestartDelayMs)}
                                        mono
                                    />
                                    <DiagnosticsKeyValue
                                        label="Last Recovery"
                                        value={formatRecoveryAction(discordBot.lastRecoveryAction)}
                                    />
                                    <DiagnosticsKeyValue
                                        label="Recovery Time"
                                        value={formatTimestamp(discordBot.lastRecoveryAction?.at ?? null)}
                                        mono
                                    />
                                </DiagnosticsMiniCard>
                            </div>

                            <div className="grid gap-3 xl:grid-cols-2">
                                <DiagnosticsMiniCard title="Recent Process Output">
                                    <DiagnosticsKeyValue
                                        label="stderr"
                                        value={discordBot.process.lastErrorLine ?? '--'}
                                        mono
                                        breakAll
                                    />
                                    <DiagnosticsKeyValue
                                        label="stdout"
                                        value={discordBot.process.lastOutputLine ?? '--'}
                                        mono
                                        breakAll
                                    />
                                </DiagnosticsMiniCard>

                                <DiagnosticsMiniCard title="Recovery Notes">
                                    <DiagnosticsKeyValue label="Bot Enabled" value={discordBot.enabled ? 'Yes' : 'No'} />
                                    <DiagnosticsKeyValue label="Runtime Updated" value={discordBotRuntimeUpdated} mono />
                                    <DiagnosticsKeyValue
                                        label="Addon Hook Failures"
                                        value={String(discordBot.runtime.addonLoadFailures.length)}
                                        mono
                                    />
                                </DiagnosticsMiniCard>
                            </div>

                            {discordBot.lastBotError && (
                                <div className="rounded-md border border-red-500/25 bg-red-500/10 p-3">
                                    <p className="text-sm font-medium text-red-700 dark:text-red-400">
                                        Bot Error {discordBot.lastBotError.code ? `(${discordBot.lastBotError.code})` : ''}
                                    </p>
                                    <p className="mt-1 text-xs text-red-700 dark:text-red-400">
                                        {discordBot.lastBotError.message}
                                    </p>
                                    <p className="mt-1 text-xs text-red-700/80 dark:text-red-400/80">
                                        {formatTimestamp(discordBot.lastBotError.at)}
                                    </p>
                                </div>
                            )}

                            {discordBot.lastProcessFailure && (
                                <div className="rounded-md border border-yellow-500/25 bg-yellow-500/10 p-3">
                                    <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                                        Process Failure
                                    </p>
                                    <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-400">
                                        {discordBot.lastProcessFailure.reason}
                                    </p>
                                    <p className="mt-1 text-xs text-yellow-700/80 dark:text-yellow-400/80">
                                        {formatTimestamp(discordBot.lastProcessFailure.at)}
                                    </p>
                                </div>
                            )}

                            {(botActionState.message || botActionState.error) && (
                                <div
                                    className={`rounded-md border p-3 text-sm ${
                                        botActionState.error
                                            ? 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-400'
                                            : 'border-green-500/25 bg-green-500/10 text-green-700 dark:text-green-400'
                                    }`}
                                >
                                    {botActionState.error || botActionState.message}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="border-border/60 bg-card rounded-xl border p-4 shadow-sm">
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <h2 className="text-muted-foreground/60 text-sm font-medium tracking-wider uppercase">
                                Addon Hook Failures
                            </h2>
                            <span className="text-muted-foreground text-xs">{discordBot.runtime.addonLoadFailures.length} recorded</span>
                        </div>
                        {discordBot.runtime.addonLoadFailures.length === 0 ? (
                            <p className="text-muted-foreground text-sm">No addon command or event load failures recorded.</p>
                        ) : (
                            <div className="space-y-2">
                                {discordBot.runtime.addonLoadFailures.map((failure, index) => (
                                    <div
                                        key={`${failure.kind}-${failure.filePath}-${failure.updatedAt}-${index}`}
                                        className="rounded-md border border-red-500/25 bg-red-500/5 p-3"
                                    >
                                        <div className="mb-1 flex flex-wrap items-center gap-2">
                                            <DiagnosticsPill className="border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-400">
                                                {failure.kind === 'event' ? 'Event' : 'Command'}
                                            </DiagnosticsPill>
                                            {failure.addonId && (
                                                <DiagnosticsPill className="border-border bg-background text-foreground">
                                                    {failure.addonId}
                                                </DiagnosticsPill>
                                            )}
                                            <span className="text-muted-foreground ml-auto text-xs">
                                                {formatTimestamp(failure.updatedAt)}
                                            </span>
                                        </div>
                                        <p className="text-xs text-red-700 dark:text-red-400">{failure.message}</p>
                                        <p className="text-muted-foreground mt-2 break-all font-mono text-[11px]">
                                            {failure.filePath}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="commandAnalytics" className="mt-0 space-y-4">
                    <div className="border-border/60 bg-card rounded-xl border p-4 shadow-sm">
                        <div className="mb-4 space-y-2">
                            <h2 className="text-muted-foreground/60 text-sm font-medium tracking-wider uppercase">
                                Discord Command Analytics
                            </h2>
                            <p className="text-muted-foreground text-sm">
                                Slash-command outcomes, latency, denial reasons, and 7d/30d rollups for the last 30 days.
                            </p>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            <DiagnosticsMetricCard
                                label="Commands"
                                value={commandOverview.total}
                                detail={`${commandOverview.uniqueCommands} unique commands`}
                            />
                            <DiagnosticsMetricCard
                                label="Success Rate"
                                value={`${commandOverview.successRate}%`}
                                detail={`${commandOverview.success} succeeded`}
                                tone="text-green-700 dark:text-green-400"
                            />
                            <DiagnosticsMetricCard
                                label="Denied / Failed"
                                value={`${commandOverview.denied} / ${commandOverview.failed}`}
                                detail={`${commandOverview.timedOut} timed out`}
                                tone="text-yellow-700 dark:text-yellow-400"
                            />
                            <DiagnosticsMetricCard
                                label="Ack Latency"
                                value={formatLatency(commandLatency.avgInteractionAckMs)}
                                detail={`P95 ${formatLatency(commandLatency.p95InteractionAckMs)}`}
                            />
                            <DiagnosticsMetricCard
                                label="Bridge Roundtrip"
                                value={formatLatency(commandLatency.avgBridgeRoundtripMs)}
                                detail={`P95 ${formatLatency(commandLatency.p95BridgeRoundtripMs)}`}
                            />
                            <DiagnosticsMetricCard
                                label="Handler Duration"
                                value={formatLatency(commandLatency.avgHandlerDurationMs)}
                                detail={`P95 ${formatLatency(commandLatency.p95HandlerDurationMs)}`}
                            />
                        </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-2">
                        <div className="border-border/60 bg-card rounded-xl border p-4 shadow-sm">
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <h2 className="text-muted-foreground/60 text-sm font-medium tracking-wider uppercase">
                                    Outcome Breakdown
                                </h2>
                                <span className="text-muted-foreground text-xs">{commandOverview.total} recorded</span>
                            </div>
                            <div className="space-y-3">
                                {commandOutcomeRows.map((row) => {
                                    const pct =
                                        commandOverview.total > 0
                                            ? Math.round((row.count / commandOverview.total) * 100)
                                            : 0;

                                    return (
                                        <div key={row.label}>
                                            <div className="mb-1 flex items-center justify-between text-sm">
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`inline-block h-2 w-2 rounded-full ${row.colorClass}`} />
                                                    <span>{row.label}</span>
                                                </div>
                                                <span className="text-muted-foreground">
                                                    {row.count} ({pct}%)
                                                </span>
                                            </div>
                                            <div className="bg-secondary/30 h-2 rounded-full">
                                                <div className={`${row.colorClass} h-2 rounded-full`} style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="border-border/60 bg-card rounded-xl border p-4 shadow-sm">
                            <h2 className="text-muted-foreground/60 mb-3 text-sm font-medium tracking-wider uppercase">
                                Rollups
                            </h2>
                            <div className="grid gap-3 md:grid-cols-2">
                                <DiagnosticsMiniCard title="Last 7 Days">
                                    <DiagnosticsKeyValue label="Commands" value={commandRollups['7d'].total} />
                                    <DiagnosticsKeyValue label="Success Rate" value={`${commandRollups['7d'].successRate}%`} />
                                    <DiagnosticsKeyValue
                                        label="Avg Ack"
                                        value={formatLatency(commandRollups['7d'].avgInteractionAckMs)}
                                        mono
                                    />
                                    <DiagnosticsKeyValue
                                        label="Avg Bridge"
                                        value={formatLatency(commandRollups['7d'].avgBridgeRoundtripMs)}
                                        mono
                                    />
                                    <DiagnosticsKeyValue
                                        label="Avg Handler"
                                        value={formatLatency(commandRollups['7d'].avgHandlerDurationMs)}
                                        mono
                                    />
                                </DiagnosticsMiniCard>

                                <DiagnosticsMiniCard title="Last 30 Days">
                                    <DiagnosticsKeyValue label="Commands" value={commandRollups['30d'].total} />
                                    <DiagnosticsKeyValue label="Success Rate" value={`${commandRollups['30d'].successRate}%`} />
                                    <DiagnosticsKeyValue
                                        label="Avg Ack"
                                        value={formatLatency(commandRollups['30d'].avgInteractionAckMs)}
                                        mono
                                    />
                                    <DiagnosticsKeyValue
                                        label="Avg Bridge"
                                        value={formatLatency(commandRollups['30d'].avgBridgeRoundtripMs)}
                                        mono
                                    />
                                    <DiagnosticsKeyValue
                                        label="Avg Handler"
                                        value={formatLatency(commandRollups['30d'].avgHandlerDurationMs)}
                                        mono
                                    />
                                </DiagnosticsMiniCard>
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-2">
                        <div className="border-border/60 bg-card rounded-xl border p-4 shadow-sm">
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <h2 className="text-muted-foreground/60 text-sm font-medium tracking-wider uppercase">
                                    Denial Reasons
                                </h2>
                                <span className="text-muted-foreground text-xs">{commandOverview.denied} denied</span>
                            </div>
                            {commandDenialReasons.length === 0 ? (
                                <p className="text-muted-foreground text-sm">No denial events recorded in the last 30 days.</p>
                            ) : (
                                <div className="space-y-3">
                                    {commandDenialReasons.map((row) => {
                                        const pct =
                                            commandOverview.denied > 0 ? Math.round((row.count / commandOverview.denied) * 100) : 0;

                                        return (
                                            <div key={row.reason}>
                                                <div className="mb-1 flex justify-between text-sm">
                                                    <span className="capitalize">{row.reason.replaceAll('_', ' ')}</span>
                                                    <span className="text-muted-foreground">
                                                        {row.count} ({pct}%)
                                                    </span>
                                                </div>
                                                <div className="bg-secondary/30 h-1.5 rounded-full">
                                                    <div className="bg-warning h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="border-border/60 bg-card rounded-xl border p-4 shadow-sm">
                            <h2 className="text-muted-foreground/60 mb-3 text-sm font-medium tracking-wider uppercase">
                                Daily Outcomes
                            </h2>
                            <div className="overflow-x-auto rounded-lg border">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-secondary/30">
                                            <th className="px-3 py-2 text-left font-medium">Date</th>
                                            <th className="px-3 py-2 text-right font-medium">Total</th>
                                            <th className="px-3 py-2 text-right font-medium">Success</th>
                                            <th className="px-3 py-2 text-right font-medium">Denied</th>
                                            <th className="px-3 py-2 text-right font-medium">Failed</th>
                                            <th className="px-3 py-2 text-right font-medium">Timed Out</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {commandTimelineDays.slice(-14).map((day, index) => (
                                            <tr key={day.date} className={index % 2 === 0 ? '' : 'bg-secondary/10'}>
                                                <td className="text-muted-foreground px-3 py-1.5">{day.date}</td>
                                                <td className="px-3 py-1.5 text-right">{day.total}</td>
                                                <td className="text-success px-3 py-1.5 text-right">{day.success}</td>
                                                <td className="text-warning px-3 py-1.5 text-right">{day.denied}</td>
                                                <td className="text-destructive px-3 py-1.5 text-right">{day.failed}</td>
                                                <td className="px-3 py-1.5 text-right">{day.timedOut}</td>
                                            </tr>
                                        ))}
                                        {commandTimelineDays.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="text-muted-foreground px-3 py-4 text-center">
                                                    No command telemetry recorded.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div className="border-border/60 bg-card rounded-xl border p-4 shadow-sm">
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <h2 className="text-muted-foreground/60 text-sm font-medium tracking-wider uppercase">
                                Command Breakdown
                            </h2>
                            <span className="text-muted-foreground text-xs">
                                Showing {Math.min(commandBreakdown.length, 8)} of {commandBreakdown.length}
                            </span>
                        </div>
                        <div className="overflow-x-auto rounded-lg border">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-secondary/30">
                                        <th className="px-3 py-2 text-left font-medium">Command</th>
                                        <th className="px-3 py-2 text-right font-medium">Total</th>
                                        <th className="px-3 py-2 text-right font-medium">Success Rate</th>
                                        <th className="px-3 py-2 text-right font-medium">Denied</th>
                                        <th className="px-3 py-2 text-right font-medium">Avg Ack</th>
                                        <th className="px-3 py-2 text-right font-medium">Avg Handler</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {commandBreakdown.slice(0, 8).map((row, index) => {
                                        const successRate = row.total > 0 ? Math.round((row.success / row.total) * 100) : 0;

                                        return (
                                            <tr key={row.commandName} className={index % 2 === 0 ? '' : 'bg-secondary/10'}>
                                                <td className="px-3 py-2 font-medium">/{row.commandName}</td>
                                                <td className="px-3 py-2 text-right">{row.total}</td>
                                                <td className="text-success px-3 py-2 text-right">{successRate}%</td>
                                                <td className="text-warning px-3 py-2 text-right">{row.denied}</td>
                                                <td className="px-3 py-2 text-right">{formatLatency(row.avgInteractionAckMs)}</td>
                                                <td className="px-3 py-2 text-right">{formatLatency(row.avgHandlerDurationMs)}</td>
                                            </tr>
                                        );
                                    })}
                                    {commandBreakdown.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="text-muted-foreground px-3 py-4 text-center">
                                                No command telemetry recorded.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="fxserver" className="mt-0 space-y-4">
                    <div className="border-border/60 bg-card rounded-xl border p-4 shadow-sm">
                        <h2 className="text-muted-foreground/60 mb-3 text-sm font-medium tracking-wider uppercase">
                            FXServer /info.json
                        </h2>
                        {!fxserver ? (
                            <p className="text-muted-foreground text-sm">FXServer data not available.</p>
                        ) : (
                            <>
                                {fxserver.versionMismatch && (
                                    <div className="bg-destructive/10 border-destructive/30 mb-3 rounded border p-3 text-center text-sm">
                                        <strong className="text-destructive">
                                            This version doesn't match fxPanel's version!
                                        </strong>
                                        <br />
                                        If you just updated FXServer, restart fxPanel. Otherwise, it means FXServer was
                                        already running before fxPanel started, and nothing is going to work properly.
                                    </div>
                                )}
                                {fxserver.error !== false && fxserver.error ? (
                                    <p className="text-destructive">{fxserver.error}</p>
                                ) : (
                                    <div className="space-y-1 text-sm">
                                        <p>
                                            <strong>Status: </strong>
                                            <span
                                                className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                                                    fxserver.statusColor === 'success'
                                                        ? 'bg-success/20 text-success'
                                                        : fxserver.statusColor === 'warning'
                                                          ? 'bg-warning/20 text-warning'
                                                          : fxserver.statusColor === 'danger'
                                                            ? 'bg-destructive/20 text-destructive'
                                                            : 'bg-secondary text-secondary-foreground'
                                                }`}
                                            >
                                                {fxserver.status}
                                            </span>
                                        </p>
                                        <p>
                                            <strong>Version:</strong> {fxserver.version}
                                        </p>
                                        <p>
                                            <strong>Resources:</strong> {fxserver.resources}
                                        </p>
                                        <p>
                                            <strong>OneSync:</strong> {fxserver.onesync}
                                        </p>
                                        <p>
                                            <strong>Max Clients:</strong> {fxserver.maxClients}
                                        </p>
                                        <p>
                                            <strong>fxPanel Version:</strong> {fxserver.txAdminVersion}
                                        </p>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="processes" className="mt-0 space-y-4">
                    <div className="border-border/60 bg-card rounded-xl border p-4 shadow-sm">
                        <h2 className="text-muted-foreground/60 mb-3 text-sm font-medium tracking-wider uppercase">
                            Processes
                        </h2>
                        {!processes?.length ? (
                            <p className="text-muted-foreground text-sm">
                                Failed to retrieve process data. Check the terminal for more information (if verbosity
                                is enabled).
                            </p>
                        ) : (
                            <div className="grid gap-3 lg:grid-cols-2">
                                {processes.map((proc) => (
                                    <div key={proc.pid} className="bg-muted/30 rounded-lg border p-3 text-sm">
                                        <p>
                                            <strong>Process:</strong> ({proc.pid}) {proc.name}
                                        </p>
                                        <p>
                                            <strong>Parent:</strong> {proc.ppid}
                                        </p>
                                        <p>
                                            <strong>Memory:</strong> {proc.memory?.toFixed(2) ?? '--'}MB
                                        </p>
                                        <p>
                                            <strong>CPU:</strong> {proc.cpu?.toFixed(2) ?? '--'}%
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="report" className="mt-0 space-y-4">
                    <div className="border-border/60 bg-card rounded-xl border p-4 shadow-sm">
                        <h2 className="text-muted-foreground/60 mb-3 text-sm font-medium tracking-wider uppercase">
                            Diagnostics Report
                        </h2>
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm">
                                To receive fxPanel Support, it is recommended that you send the diagnostics data
                                directly to the Support Team.
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setReportState('info');
                                    setReportModalOpen(true);
                                }}
                            >
                                Review Details & Send Data
                            </Button>
                        </div>
                    </div>

                    <div className="border-border/60 bg-card rounded-xl border p-4 shadow-sm">
                        <h2 className="text-muted-foreground/60 mb-2 text-sm font-medium tracking-wider uppercase">
                            Snapshot Metadata
                        </h2>
                        <p className="text-muted-foreground text-sm">{data.message}</p>
                    </div>
                </TabsContent>
            </Tabs>

            {/* Report Modal */}
            <Dialog open={reportModalOpen} onOpenChange={setReportModalOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Send Diagnostics Data</DialogTitle>
                        <DialogDescription>Submit diagnostics data to the support team.</DialogDescription>
                    </DialogHeader>

                    {reportState === 'info' && (
                        <div className="space-y-3 text-sm">
                            <p>
                                This <em>optional</em> feature sends a diagnostics report to the fxPanel/Cfx.re teams,
                                and may be required to diagnose a wide range of server issues. After sending the data,
                                you will receive a Report ID you can send in the support channels.
                            </p>
                            <div>
                                <strong>Which data will be sent?</strong>
                                <ul className="mt-1 list-inside list-disc space-y-0.5">
                                    <li>All diagnostics page data</li>
                                    <li>Recent fxPanel (system), live console and server log</li>
                                    <li>Environment variables</li>
                                    <li>Server performance (dashboard chart) data</li>
                                    <li>Player database statistics</li>
                                    <li>fxPanel settings (no bot token)</li>
                                    <li>List of admins (no passwords/hashes)</li>
                                    <li>List of files/folders in server data and monitor folders</li>
                                    <li>Config files in server data folder</li>
                                </ul>
                            </div>
                            <div>
                                <strong>Sensitive Information Protection:</strong>
                                <ul className="mt-1 list-inside list-disc space-y-0.5">
                                    <li>
                                        <strong>Settings:</strong> the Discord Bot Token will be removed
                                    </li>
                                    <li>
                                        <strong>Admin List:</strong> the password hashes will not be sent
                                    </li>
                                    <li>
                                        <strong>Env Vars:</strong> parameters with key, license, pass, private, secret,
                                        token in their name will be masked.
                                    </li>
                                    <li>
                                        <strong>CFG Files:</strong> known secret parameters will be masked.
                                    </li>
                                    <li>
                                        <strong>Logs:</strong> any identifiable IPv4 address in logs will be masked.
                                    </li>
                                </ul>
                            </div>
                        </div>
                    )}

                    {reportState === 'loading' && (
                        <div className="flex min-h-32 items-center justify-center">
                            <Loader2Icon className="h-8 w-8 animate-spin" />
                        </div>
                    )}

                    {reportState === 'success' && (
                        <div className="text-center">
                            <h2 className="text-xl">
                                Report ID:{' '}
                                <code className="bg-secondary rounded px-3 py-1 text-2xl tracking-widest">
                                    {reportId}
                                </code>
                            </h2>
                        </div>
                    )}

                    {reportState === 'error' && (
                        <div className="text-center">
                            <h4 className="text-destructive">{reportError}</h4>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setReportModalOpen(false)}>
                            Close
                        </Button>
                        {reportState === 'info' && (
                            <Button variant="default" onClick={handleSendReport}>
                                Agree & Send Data
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
