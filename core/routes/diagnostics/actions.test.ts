import { beforeEach, expect, it, suite, vi } from 'vitest';
import { createMockCtx } from '@core/testing/routeTestUtils';
import DiagnosticsPage from './page';
import DiagnosticsActions from './actions';
import * as diagnosticsFuncs from '@lib/diagnostics';
import { DiscordBotStatus } from '@shared/enums';

vi.mock('@lib/diagnostics', () => ({
    getHostData: vi.fn(),
    getTxAdminData: vi.fn(),
    getFXServerData: vi.fn(),
    getProcessesData: vi.fn(),
}));

const baseDiagnostics = {
    enabled: true,
    status: DiscordBotStatus.Ready,
    isClientReady: true,
    guildName: 'Test Guild',
    lastReadyAt: 100,
    lastBotError: null,
    lastProcessFailure: null,
    lastRecoveryAction: null,
    bridge: {
        isConnected: true,
        connectCount: 2,
        disconnectCount: 1,
        lastAuthenticatedAt: 200,
        lastDisconnectedAt: 150,
        disconnectedForMs: null,
        lastReconnectDurationMs: 5000,
        autoHealAt: null,
    },
    process: {
        isRunning: true,
        hasPendingRestart: false,
        nextRestartDelayMs: null,
        lastOutputLine: 'ready',
        lastErrorLine: null,
    },
    runtime: {
        addonLoadFailures: [],
        addonRuntimeIssues: [],
        updatedAt: 250,
    },
};

const baseBotCommandAnalytics = {
    overview: {
        total: 12,
        success: 8,
        denied: 2,
        failed: 1,
        timedOut: 1,
        uniqueCommands: 3,
        successRate: 67,
    },
    latency: {
        avgInteractionAckMs: 120,
        p95InteractionAckMs: 240,
        avgBridgeRoundtripMs: 450,
        p95BridgeRoundtripMs: 900,
        avgHandlerDurationMs: 700,
        p95HandlerDurationMs: 1200,
    },
    byCommand: [
        {
            commandName: 'ticket',
            total: 7,
            success: 5,
            denied: 1,
            failed: 1,
            timedOut: 0,
            avgInteractionAckMs: 110,
            avgBridgeRoundtripMs: 420,
            avgHandlerDurationMs: 650,
        },
    ],
    denialReasons: [{ reason: 'missing_permissions', count: 2 }],
    timelineDays: [{ date: '2024-01-01', total: 2, success: 1, denied: 1, failed: 0, timedOut: 0 }],
    rollups: {
        '7d': {
            total: 5,
            success: 4,
            denied: 1,
            failed: 0,
            timedOut: 0,
            successRate: 80,
            avgInteractionAckMs: 100,
            avgBridgeRoundtripMs: 400,
            avgHandlerDurationMs: 600,
        },
        '30d': {
            total: 12,
            success: 8,
            denied: 2,
            failed: 1,
            timedOut: 1,
            successRate: 67,
            avgInteractionAckMs: 120,
            avgBridgeRoundtripMs: 450,
            avgHandlerDurationMs: 700,
        },
    },
};

const mockGetDiagnostics = vi.fn();
const mockGetCommandAnalytics = vi.fn();
const mockRestartRuntime = vi.fn();
const mockReloadRuntimeAddons = vi.fn();
const mockResyncRuntime = vi.fn();

vi.stubGlobal('txCore', {
    discordBot: {
        getDiagnostics: mockGetDiagnostics,
        restartRuntime: mockRestartRuntime,
        reloadRuntimeAddons: mockReloadRuntimeAddons,
        resyncRuntime: mockResyncRuntime,
    },
    database: {
        botAnalytics: {
            getCommandAnalytics: mockGetCommandAnalytics,
        },
    },
});

beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(diagnosticsFuncs.getHostData).mockResolvedValue({ host: 'ok' } as any);
    vi.mocked(diagnosticsFuncs.getTxAdminData).mockResolvedValue({ runtime: 'ok' } as any);
    vi.mocked(diagnosticsFuncs.getFXServerData).mockResolvedValue({ fxserver: 'ok' } as any);
    vi.mocked(diagnosticsFuncs.getProcessesData).mockResolvedValue([{ pid: 1 }] as any);

    mockGetDiagnostics.mockReturnValue(baseDiagnostics);
    mockGetCommandAnalytics.mockReturnValue(baseBotCommandAnalytics);
    mockRestartRuntime.mockResolvedValue('Discord bot restart requested.');
    mockReloadRuntimeAddons.mockResolvedValue('Discord bot addon commands and events reload requested.');
    mockResyncRuntime.mockResolvedValue('Discord bot config snapshot, presence, and embeds were resynced.');
});

suite('diagnostics/page', () => {
    it('includes Discord bot diagnostics in the payload', async () => {
        const { ctx, sentData } = createMockCtx();

        await DiagnosticsPage(ctx);

        expect(mockGetDiagnostics).toHaveBeenCalledOnce();
        expect(sentData[0]).toMatchObject({
            host: { host: 'ok' },
            txadmin: { runtime: 'ok' },
            fxserver: { fxserver: 'ok' },
            processes: [{ pid: 1 }],
            discordBot: baseDiagnostics,
            botCommandAnalytics: baseBotCommandAnalytics,
        });
    });
});

suite('diagnostics/actions', () => {
    it('rejects users without all_permissions', async () => {
        const { ctx, sentData } = createMockCtx({
            params: { action: 'restart' },
            permissions: ['settings.view'],
        });

        await DiagnosticsActions(ctx);

        expect(sentData[0]).toEqual({ error: 'Insufficient permissions.' });
        expect(mockRestartRuntime).not.toHaveBeenCalled();
    });

    it('calls restartRuntime and returns updated diagnostics', async () => {
        const { ctx, sentData } = createMockCtx({ params: { action: 'restart' } });

        await DiagnosticsActions(ctx);

        expect(mockRestartRuntime).toHaveBeenCalledOnce();
        expect(sentData[0]).toEqual({
            success: true,
            message: 'Discord bot restart requested.',
            diagnostics: baseDiagnostics,
        });
    });

    it('returns action errors with diagnostics snapshot', async () => {
        mockReloadRuntimeAddons.mockRejectedValue(new Error('Discord bridge is not connected.'));
        const { ctx, sentData } = createMockCtx({ params: { action: 'reload-addons' } });

        await DiagnosticsActions(ctx);

        expect(mockReloadRuntimeAddons).toHaveBeenCalledOnce();
        expect(sentData[0]).toEqual({
            success: false,
            error: 'Discord bridge is not connected.',
            diagnostics: baseDiagnostics,
        });
    });
});