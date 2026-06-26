import { useReducer, type Dispatch } from 'react';
import useSWR from 'swr';
import { msToShortDuration } from '@/lib/dateTime';
import { ApiTimeout, useBackendApi } from '@/hooks/fetch';
import type { BotCommandAnalyticsSummary } from '@shared/discordBotAnalyticsTypes';
import { DiscordBotStatus } from '@shared/enums';

export type DiagnosticsSectionId = 'overview' | 'discord' | 'commandAnalytics' | 'fxserver' | 'processes' | 'report';

export type DiscordBotDiagnostics = {
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
    nodeRuntime: {
        hostExecPath: string;
        resolved: boolean;
        resolvedChildLabel: string | null;
        resolvedViaMuslLoader: boolean;
        candidateCount: number;
        candidateSample: string[];
        cfxRoot: string | null;
        suggestedBotNodePath: string | null;
    };
};

export type DiagnosticsData = {
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

export type DiagnosticsPageState = {
    section: DiagnosticsSectionId;
    reportModalOpen: boolean;
    reportState: 'info' | 'loading' | 'success' | 'error';
    reportId: string;
    reportError: string;
    botActionState: {
        action: 'restart' | 'reload-addons' | 'resync' | null;
        error: string;
        message: string;
    };
};

export const reduceDiagnosticsPageState = (state: DiagnosticsPageState, action: Partial<DiagnosticsPageState>) => {
    return {
        ...state,
        ...action,
    };
};

export const discordBotStatusLabels = {
    [DiscordBotStatus.Disabled]: 'DISABLED',
    [DiscordBotStatus.Starting]: 'STARTING',
    [DiscordBotStatus.Ready]: 'READY',
    [DiscordBotStatus.Error]: 'ERROR',
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

export const emptyBotCommandAnalytics: BotCommandAnalyticsSummary = {
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

export const formatTimestamp = (value: number | null) => {
    if (!value) return '--';
    return new Date(value).toLocaleString();
};

export function formatDuration(value: number | null) {
    if (value === null) return '--';

    return msToShortDuration(value, {
        units: value >= 60_000 ? ['h', 'm', 's'] : ['m', 's'],
        delimiter: ' ',
    });
}

export const formatLatency = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '--';
    if (value < 1000) return `${Math.round(value)}ms`;
    return formatDuration(value);
};

export const formatRecoveryAction = (action: DiscordBotDiagnostics['lastRecoveryAction']) => {
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

export const diagnosticsSections: Array<{ id: DiagnosticsSectionId; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'discord', label: 'Discord Bot' },
    { id: 'commandAnalytics', label: 'Command Analytics' },
    { id: 'fxserver', label: 'FXServer' },
    { id: 'processes', label: 'Processes' },
    { id: 'report', label: 'Support' },
];

export type DiagnosticsModel =
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | {
          status: 'ready';
          data: DiagnosticsData;
          state: DiagnosticsPageState;
          dispatch: Dispatch<Partial<DiagnosticsPageState>>;
          handleBotAction: (action: 'restart' | 'reload-addons' | 'resync') => void;
          handleSendReport: () => void;
      };

export function useDiagnosticsModel(): DiagnosticsModel {
    const [state, dispatch] = useReducer(reduceDiagnosticsPageState, {
        section: 'overview',
        reportModalOpen: false,
        reportState: 'info',
        reportId: '',
        reportError: '',
        botActionState: {
            action: null,
            error: '',
            message: '',
        },
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
        dispatch({
            botActionState: {
                action,
                error: '',
                message: '',
            },
        });

        botActionApi({
            pathParams: { action },
            timeout: ApiTimeout.LONG,
            success: (response) => {
                dispatch({
                    botActionState: {
                        action: null,
                        error: response.error ?? '',
                        message: response.message ?? '',
                    },
                });

                if (response.diagnostics) {
                    void mutate(
                        (current) =>
                            current ? { ...current, discordBot: response.diagnostics ?? current.discordBot } : current,
                        false,
                    );
                }

                void mutate();
            },
            error: (message) => {
                dispatch({
                    botActionState: {
                        action: null,
                        error: message,
                        message: '',
                    },
                });
            },
        });
    };

    const handleSendReport = () => {
        dispatch({
            reportState: 'loading',
            reportError: '',
            reportId: '',
        });
        reportApi({
            data: { bugfix: true },
            timeout: ApiTimeout.REALLY_REALLY_LONG,
            success(d) {
                if (d.error) {
                    dispatch({ reportState: 'error', reportError: d.error });
                } else if (d.reportId) {
                    dispatch({ reportState: 'success', reportId: d.reportId });
                } else {
                    dispatch({ reportState: 'error', reportError: 'Unknown backend error.' });
                }
            },
            error(msg) {
                dispatch({ reportState: 'error', reportError: msg });
            },
        });
    };

    if (isLoading || (!data && !swrError)) {
        return { status: 'loading' as const };
    }

    if (swrError || !data) {
        return { status: 'error' as const, message: swrError?.message ?? 'Unknown error' };
    }

    return {
        status: 'ready' as const,
        data,
        state,
        dispatch,
        handleBotAction,
        handleSendReport,
    };
}
