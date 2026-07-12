import { suite, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FxMonitorHealth } from '@shared/enums';
import { ChildProcessState } from '@modules/FxRunner/ProcessManager';
import { SYM_SYSTEM_AUTHOR } from '@lib/symbols';
import { MonitorState } from './utils';

//NOTE: @core/globalData has side effects (defines globalThis.emsg, reads env vars) that we
//don't want to run in this unit test, so we replace it with a minimal stub. index.ts itself
//only needs txHostConfig, but it transitively pulls in FxRunner/utils.ts (via ProcessManager's
//ChildProcessState enum import) which reads txEnv at module load time, so that's stubbed too.
vi.mock('@core/globalData', () => ({
    txHostConfig: {
        forceMaxClients: undefined,
        sourceName: 'Host Config',
        netInterface: undefined,
        txaPort: 40120,
    },
    txEnv: {
        isWindows: true,
        fxsVersionTag: 'v1.0.0',
        fxsVersion: 55555,
        txaVersion: '1.0.0',
        txaPath: 'C:\\txData',
        fxsPath: 'C:\\fxserver',
        profileName: 'default',
        profilePath: 'C:\\txData\\default',
        profileSubPath: (...parts: string[]) => parts.join('/'),
    },
}));

//The httpHealthCheck lib hits the network / reads txConfig - mock it entirely so tests are
//deterministic. Default implementations are the "HTTP health check enabled" behavior; individual
//tests override isHttpHealthCheckDisabled() as needed.
vi.mock('@lib/fxserver/httpHealthCheck', () => ({
    getEffectiveFxMonitorHealth: vi.fn((reported: FxMonitorHealth) => reported),
    isHttpHealthCheckDisabled: vi.fn(() => false),
    syncHttpRuntimeMetadata: vi.fn(async () => {}),
    clearHttpRuntimePlayerCache: vi.fn(),
    syncHttpPlayersToResource: vi.fn(),
    fetchAndCachePlayersJson: vi.fn(async () => {}),
    refreshHttpPlayerlistViews: vi.fn(),
    isHttpPlayerlistBypassEnabled: vi.fn(() => false),
    getCachedHttpPlayerCount: vi.fn(() => 0),
}));

//fetchDynamicJson/fetchInfoJson do real HTTP requests - stub only those two, keep everything
//else (Stopwatch, HealthEventMonitor, MonitorState, etc) real so the state machine behaves
//exactly like production.
vi.mock('./utils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./utils')>();
    return {
        ...actual,
        fetchDynamicJson: vi.fn(),
        fetchInfoJson: vi.fn(async () => undefined),
    };
});

vi.stubGlobal('emsg', (e: unknown) => (e instanceof Error ? e.message : String(e)));

const txCoreMock = {
    fxRunner: {
        isIdle: false,
        isAlive: true,
        child: null as null | { isAlive?: boolean; netEndpoint?: string; uptime?: number; status?: ChildProcessState },
        restartServer: vi.fn(),
        sendCommand: vi.fn(),
        sendEvent: vi.fn(),
        signalSpawnBackoffRequired: vi.fn(),
    },
    fxResources: {
        bootStatus: {
            current: null as null | { name: string; time: { isOver: (s: number) => boolean; elapsed: number } },
            elapsedSinceLast: null as null | number,
        },
    },
    fxPlayerlist: {
        broadcastPlayerlistState: vi.fn(),
        clearManualPlayers: vi.fn(),
    },
    discordBot: {
        updateBotStatus: vi.fn(async () => {}),
        sendAnnouncement: vi.fn(),
    },
    webServer: {
        webSocket: { pushRefresh: vi.fn() },
    },
    logger: {
        system: { writeSystem: vi.fn() },
        fxserver: { logInformational: vi.fn() },
    },
    translator: {
        t: vi.fn((key: string) => key),
    },
    cacheStore: {
        set: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
        get: vi.fn(),
    },
    metrics: {
        svRuntime: { logServerBoot: vi.fn() },
    },
};
vi.stubGlobal('txCore', txCoreMock);

const txManagerMock = {
    txRuntime: {
        registerFxserverRestart: vi.fn(),
        registerFxserverBoot: vi.fn(),
        registerFxserverHealthIssue: vi.fn(),
    },
};
vi.stubGlobal('txManager', txManagerMock);

const txConfigMock = {
    restarter: {
        bootGracePeriod: 0,
        resourceStartingTolerance: 300,
    },
    general: {
        serverName: 'TestServer',
    },
};
vi.stubGlobal('txConfig', txConfigMock);

// Imports below must come after the vi.mock/vi.stubGlobal calls above (vi.mock is hoisted by
// vitest anyway, but keeping the order explicit matches the FxScheduler.test.ts convention).
import FxMonitor from './index';
import * as httpHealthCheck from '@lib/fxserver/httpHealthCheck';

suite('FxMonitor', () => {
    let monitor: FxMonitor;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();

        //Reset mutable mock state to known defaults before every test
        txCoreMock.fxRunner.isIdle = false;
        txCoreMock.fxRunner.child = null;
        txCoreMock.fxResources.bootStatus = { current: null, elapsedSinceLast: null };
        txConfigMock.restarter.bootGracePeriod = 0;
        txConfigMock.restarter.resourceStartingTolerance = 300;

        vi.mocked(httpHealthCheck.isHttpHealthCheckDisabled).mockReturnValue(false);
        vi.mocked(httpHealthCheck.getEffectiveFxMonitorHealth).mockImplementation((reported: any) => reported);

        monitor = new FxMonitor();
    });

    afterEach(() => {
        //Avoid leaking the constructor's setInterval timers between tests
        monitor.timers.forEach((t) => clearInterval(t));
        vi.useRealTimers();
    });

    //MARK: constructor
    suite('constructor', () => {
        it('should start exactly two interval timers', () => {
            expect(monitor.timers).toHaveLength(2);
        });

        it('should start with OFFLINE status and no log entries', () => {
            expect(monitor.status.health).toBe(FxMonitorHealth.OFFLINE);
            expect(monitor.status.healthReason).toBe('Unknown - no log entries.');
            expect(monitor.status.uptime).toBe(0);
        });
    });

    //MARK: resetState
    suite('resetState', () => {
        it('should not re-trigger status propagation if already OFFLINE', () => {
            monitor.resetState();
            expect(txCoreMock.discordBot.updateBotStatus).not.toHaveBeenCalled();
            expect(txCoreMock.webServer.webSocket.pushRefresh).not.toHaveBeenCalled();
        });

        it('should clear the HTTP runtime player cache', () => {
            monitor.resetState();
            expect(httpHealthCheck.clearHttpRuntimePlayerCache).toHaveBeenCalledTimes(1);
        });

        it('should bring status back to OFFLINE and reset monitors after going healthy', () => {
            vi.mocked(httpHealthCheck.isHttpHealthCheckDisabled).mockReturnValue(true);
            monitor.handleHeartBeat('fd3');
            vi.advanceTimersByTime(1000);
            expect(monitor.status.health).toBe(FxMonitorHealth.ONLINE);

            monitor.resetState();

            expect(monitor.status.health).toBe(FxMonitorHealth.OFFLINE);
            expect((monitor as any).heartBeatMonitor.status.state).toBe(MonitorState.PENDING);
            expect((monitor as any).healthCheckMonitor.status.state).toBe(MonitorState.PENDING);
        });
    });

    //MARK: handleHeartBeat
    suite('handleHeartBeat', () => {
        it('should mark the heartbeat monitor healthy regardless of source', () => {
            monitor.handleHeartBeat('fd3');
            expect((monitor as any).heartBeatMonitor.status.state).toBe(MonitorState.HEALTHY);
        });

        it('fd3 heartbeat should restart the swLastFD3 stopwatch, not swLastHTTP', () => {
            monitor.handleHeartBeat('fd3');
            expect((monitor as any).swLastFD3.started).toBe(true);
            expect((monitor as any).swLastHTTP.started).toBe(false);
        });

        it('http heartbeat should restart the swLastHTTP stopwatch, not swLastFD3', () => {
            monitor.handleHeartBeat('http');
            expect((monitor as any).swLastHTTP.started).toBe(true);
            expect((monitor as any).swLastFD3.started).toBe(false);
        });

        it('should report a "http" health issue when http stalls but fd3 stays fresh', () => {
            const m = monitor as any;
            m.swLastHTTP.restart();
            vi.advanceTimersByTime(16000); //http now stale (>15s)
            m.swLastFD3.restart();
            vi.advanceTimersByTime(1000); //fd3 now fresh (<5s), http still stale

            monitor.handleHeartBeat('fd3');

            expect(txManagerMock.txRuntime.registerFxserverHealthIssue).toHaveBeenCalledWith('http');
        });

        it('should report a "fd3" health issue when fd3 stalls but http stays fresh', () => {
            const m = monitor as any;
            m.swLastFD3.restart();
            vi.advanceTimersByTime(16000); //fd3 now stale (>15s)
            m.swLastHTTP.restart();
            vi.advanceTimersByTime(1000); //http now fresh (<5s), fd3 still stale

            monitor.handleHeartBeat('http');

            expect(txManagerMock.txRuntime.registerFxserverHealthIssue).toHaveBeenCalledWith('fd3');
        });

        it('should NOT report a health issue when both sources are fresh', () => {
            monitor.handleHeartBeat('http');
            monitor.handleHeartBeat('fd3');
            expect(txManagerMock.txRuntime.registerFxserverHealthIssue).not.toHaveBeenCalled();
        });

        it('should resync the playerlist over fd3 when HTTP health check is disabled and resync is due', () => {
            vi.mocked(httpHealthCheck.isHttpHealthCheckDisabled).mockReturnValue(true);
            vi.advanceTimersByTime(16000); //let the auto-started swLastPlayerlistResync go over 15s
            vi.clearAllMocks(); //ignore whatever the interval ticks did in the meantime

            monitor.handleHeartBeat('fd3');

            expect(txCoreMock.fxPlayerlist.broadcastPlayerlistState).toHaveBeenCalledTimes(1);
            expect(txCoreMock.webServer.webSocket.pushRefresh).toHaveBeenCalledWith('status');
        });

        it('should NOT resync the playerlist twice within the 15s window', () => {
            vi.mocked(httpHealthCheck.isHttpHealthCheckDisabled).mockReturnValue(true);
            vi.advanceTimersByTime(16000);
            vi.clearAllMocks();

            monitor.handleHeartBeat('fd3');
            monitor.handleHeartBeat('fd3');

            expect(txCoreMock.fxPlayerlist.broadcastPlayerlistState).toHaveBeenCalledTimes(1);
        });

        it('should NOT resync the playerlist over fd3 when HTTP health check is enabled', () => {
            vi.mocked(httpHealthCheck.isHttpHealthCheckDisabled).mockReturnValue(false);
            vi.advanceTimersByTime(16000);
            vi.clearAllMocks();

            monitor.handleHeartBeat('fd3');

            expect(txCoreMock.fxPlayerlist.broadcastPlayerlistState).not.toHaveBeenCalled();
        });
    });

    //MARK: status state machine
    suite('status state machine (via updateStatus interval)', () => {
        it('should SKIP and reset state when fxRunner is idle', () => {
            txCoreMock.fxRunner.isIdle = true;
            vi.advanceTimersByTime(1000);

            expect(txCoreMock.fxRunner.restartServer).not.toHaveBeenCalled();
            expect(httpHealthCheck.clearHttpRuntimePlayerCache).toHaveBeenCalled(); //via resetState
        });

        it('should not restart while still within the boot grace period', () => {
            txConfigMock.restarter.bootGracePeriod = 30; //processUptime stays 0 (no child)
            vi.advanceTimersByTime(5000);

            expect(txCoreMock.fxRunner.restartServer).not.toHaveBeenCalled();
        });

        it('should stay ONLINE with no restart when heartbeat is healthy and HTTP health check is disabled', () => {
            vi.mocked(httpHealthCheck.isHttpHealthCheckDisabled).mockReturnValue(true);
            monitor.handleHeartBeat('fd3');
            vi.advanceTimersByTime(1000);

            expect(monitor.status.health).toBe(FxMonitorHealth.ONLINE);
            expect(txCoreMock.fxRunner.restartServer).not.toHaveBeenCalled();
        });

        it('should WARN (no restart) once the heartbeat exceeds the delay limit but not the fatal limit', () => {
            vi.mocked(httpHealthCheck.isHttpHealthCheckDisabled).mockReturnValue(true);
            monitor.handleHeartBeat('fd3');
            vi.advanceTimersByTime(15000); //> HB delayLimit(10), < HB fatalLimit(60)

            expect(txCoreMock.fxRunner.restartServer).not.toHaveBeenCalled();
            expect(monitor.status.healthReason).toContain('Server is not responding');
        });

        it('should RESTART with cause "heartBeat" once the heartbeat exceeds the fatal limit', () => {
            vi.mocked(httpHealthCheck.isHttpHealthCheckDisabled).mockReturnValue(true);
            monitor.handleHeartBeat('fd3');
            vi.advanceTimersByTime(60000); //>= HB fatalLimit(60)

            expect(txCoreMock.fxRunner.restartServer).toHaveBeenCalledTimes(1);
            expect(txCoreMock.fxRunner.restartServer).toHaveBeenCalledWith(
                'restarter.server_unhealthy_kick_reason',
                SYM_SYSTEM_AUTHOR,
            );
            expect(txManagerMock.txRuntime.registerFxserverRestart).toHaveBeenCalledWith('heartBeat');
        });

        it('should not fire the restart twice once isAwaitingRestart is set', () => {
            vi.mocked(httpHealthCheck.isHttpHealthCheckDisabled).mockReturnValue(true);
            monitor.handleHeartBeat('fd3');
            vi.advanceTimersByTime(65000); //past fatal limit, plus a few more ticks

            expect(txCoreMock.fxRunner.restartServer).toHaveBeenCalledTimes(1);
        });

        it('should RESTART with cause "close" when the child process was destroyed', () => {
            txCoreMock.fxRunner.child = { status: ChildProcessState.Destroyed };
            vi.advanceTimersByTime(1000);

            expect(txCoreMock.fxRunner.restartServer).toHaveBeenCalledTimes(1);
            expect(txManagerMock.txRuntime.registerFxserverRestart).toHaveBeenCalledWith('close');
        });

        it('should RESTART with cause "bootTimeout" when a resource exceeds resourceStartingTolerance', () => {
            txCoreMock.fxResources.bootStatus = {
                current: {
                    name: 'my_resource',
                    time: { isOver: () => true, elapsed: 999 },
                },
                elapsedSinceLast: null,
            };
            vi.advanceTimersByTime(1000);

            expect(txCoreMock.fxRunner.restartServer).toHaveBeenCalledTimes(1);
            expect(txManagerMock.txRuntime.registerFxserverRestart).toHaveBeenCalledWith('bootTimeout');
        });

        it('should RESTART with cause "bootTimeout" when no resource event was ever received past the no-event limit', () => {
            txCoreMock.fxRunner.child = { uptime: 31_000 }; //31s, > HB_CONFIG.bootNoEventLimit(30)
            vi.advanceTimersByTime(1000);

            expect(txCoreMock.fxRunner.restartServer).toHaveBeenCalledTimes(1);
            expect(txManagerMock.txRuntime.registerFxserverRestart).toHaveBeenCalledWith('bootTimeout');
        });

        it('should RESTART with cause "bootTimeout" when heartbeats are healthy but no HealthCheck ever arrives past the boot limit', () => {
            //HTTP health check enabled (default), so healthCheckMonitor stays PENDING forever
            //because performHealthCheck() early-returns (no child.netEndpoint in this test).
            monitor.handleHeartBeat('fd3'); //t=0, secsSinceFirst starts counting
            for (let i = 0; i < 6; i++) {
                vi.advanceTimersByTime(8000); //re-mark every 8s, staying under HB delayLimit(10)
                monitor.handleHeartBeat('fd3');
            }
            vi.advanceTimersByTime(1000);

            expect(txCoreMock.fxRunner.restartServer).toHaveBeenCalledTimes(1);
            expect(txManagerMock.txRuntime.registerFxserverRestart).toHaveBeenCalledWith('bootTimeout');
        });

        it('should send a discord "partial hang" warning when HTTP health check is stalled but heartbeat is healthy', () => {
            //HTTP health check enabled (default). Mark it healthy ONCE (simulating a successful boot),
            //then never again, so it degrades to DELAYED (not PENDING/FATAL) while heartbeat is kept
            //continuously healthy - this is the "server up, but HTTP endpoint hung" scenario.
            (monitor as any).healthCheckMonitor.markHealthy();
            monitor.handleHeartBeat('fd3');
            for (let i = 0; i < 16; i++) {
                vi.advanceTimersByTime(8000); //re-mark heartbeat every 8s, staying under HB delayLimit(10)
                monitor.handleHeartBeat('fd3');
            }
            //~128s elapsed: HC.secsSinceLast > fatalLimit(180)-60=120 (but still < 180, so DELAYED not FATAL)

            expect(txCoreMock.discordBot.sendAnnouncement).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'danger',
                    description: expect.objectContaining({ key: 'restarter.partial_hang_warn_discord' }),
                }),
            );
            expect(txCoreMock.fxRunner.sendEvent).toHaveBeenCalledWith('announcement', expect.anything());
        });
    });

    //MARK: setCurrentStatus dedup
    suite('status change propagation (setCurrentStatus dedup)', () => {
        it('should propagate exactly once when status actually changes, then stay silent while unchanged', () => {
            vi.mocked(httpHealthCheck.isHttpHealthCheckDisabled).mockReturnValue(true);
            monitor.handleHeartBeat('fd3');

            vi.advanceTimersByTime(1000); //OFFLINE -> ONLINE transition
            expect(txCoreMock.discordBot.updateBotStatus).toHaveBeenCalledTimes(1);
            expect(txCoreMock.webServer.webSocket.pushRefresh).toHaveBeenCalledWith('status');
            const callsAfterFirstTick = vi.mocked(txCoreMock.discordBot.updateBotStatus).mock.calls.length;

            monitor.handleHeartBeat('fd3');
            vi.advanceTimersByTime(1000); //still ONLINE, no change

            expect(txCoreMock.discordBot.updateBotStatus).toHaveBeenCalledTimes(callsAfterFirstTick);
        });
    });

    //MARK: handleConfigUpdate
    suite('handleConfigUpdate', () => {
        it('when HTTP health check becomes disabled: marks HC healthy, clears cache, broadcasts playerlist', () => {
            vi.mocked(httpHealthCheck.isHttpHealthCheckDisabled).mockReturnValue(true);

            monitor.handleConfigUpdate({} as any);

            expect((monitor as any).healthCheckMonitor.status.state).toBe(MonitorState.HEALTHY);
            expect(httpHealthCheck.clearHttpRuntimePlayerCache).toHaveBeenCalledTimes(1);
            expect(txCoreMock.fxPlayerlist.broadcastPlayerlistState).toHaveBeenCalledTimes(1);
            expect(httpHealthCheck.syncHttpPlayersToResource).not.toHaveBeenCalled();
            expect(txCoreMock.fxPlayerlist.clearManualPlayers).not.toHaveBeenCalled();
        });

        it('when HTTP health check becomes enabled with no netEndpoint: syncs directly, broadcasts immediately', () => {
            vi.mocked(httpHealthCheck.isHttpHealthCheckDisabled).mockReturnValue(false);
            txCoreMock.fxRunner.child = null;

            monitor.handleConfigUpdate({} as any);

            expect(txCoreMock.fxPlayerlist.clearManualPlayers).toHaveBeenCalledTimes(1);
            expect(httpHealthCheck.clearHttpRuntimePlayerCache).toHaveBeenCalledTimes(1);
            expect(httpHealthCheck.syncHttpPlayersToResource).toHaveBeenCalledTimes(1);
            expect(httpHealthCheck.syncHttpRuntimeMetadata).not.toHaveBeenCalled();
            expect(txCoreMock.fxPlayerlist.broadcastPlayerlistState).toHaveBeenCalledTimes(1);
        });

        it('when HTTP health check becomes enabled with a netEndpoint: syncs metadata then broadcasts', async () => {
            vi.mocked(httpHealthCheck.isHttpHealthCheckDisabled).mockReturnValue(false);
            txCoreMock.fxRunner.child = { netEndpoint: '127.0.0.1:30120' };

            monitor.handleConfigUpdate({} as any);

            expect(httpHealthCheck.syncHttpRuntimeMetadata).toHaveBeenCalledWith('127.0.0.1:30120', 1500);
            //broadcastPlayerlistState is chained via .then(), not called synchronously
            expect(txCoreMock.fxPlayerlist.broadcastPlayerlistState).not.toHaveBeenCalled();

            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();

            expect(txCoreMock.fxPlayerlist.broadcastPlayerlistState).toHaveBeenCalledTimes(1);
        });

        it('should always propagate the status change regardless of branch', () => {
            vi.mocked(httpHealthCheck.isHttpHealthCheckDisabled).mockReturnValue(true);
            monitor.handleConfigUpdate({} as any);
            expect(txCoreMock.discordBot.updateBotStatus).toHaveBeenCalledTimes(1);
            expect(txCoreMock.webServer.webSocket.pushRefresh).toHaveBeenCalledWith('status');
        });
    });
});
