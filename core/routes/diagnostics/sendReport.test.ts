import { gunzipSync } from 'node:zlib';
import { beforeEach, expect, it, suite, vi } from 'vitest';
import { createMockCtx } from '@core/testing/routeTestUtils';

type SendDiagnosticsReportType = typeof import('./sendReport').default;

const mocks = vi.hoisted(() => ({
    gotPost: vi.fn(),
    getHostData: vi.fn(),
    getTxAdminData: vi.fn(),
    getFXServerData: vi.fn(),
    getProcessesData: vi.fn(),
    getServerDataContent: vi.fn(),
    getServerDataConfigs: vi.fn(),
    getLogBuffer: vi.fn(),
    scanMonitorFiles: vi.fn(),
    consoleWarn: vi.fn(),
    consoleVerboseDir: vi.fn(),
}));

vi.mock('@lib/got', () => ({
    default: {
        post: mocks.gotPost,
    },
}));

vi.mock('@core/globalData', () => ({
    txEnv: {
        txaVersion: '1.2.3',
        fxsVersion: 1234,
    },
    txHostConfig: {
        providerName: 'test-provider',
    },
}));

vi.mock('@lib/diagnostics', () => ({
    getHostData: mocks.getHostData,
    getTxAdminData: mocks.getTxAdminData,
    getFXServerData: mocks.getFXServerData,
    getProcessesData: mocks.getProcessesData,
}));

vi.mock('@lib/fxserver/serverData', () => ({
    getServerDataContent: mocks.getServerDataContent,
    getServerDataConfigs: mocks.getServerDataConfigs,
}));

vi.mock('@lib/console', () => ({
    default: vi.fn(() => ({
        warn: mocks.consoleWarn,
        verbose: {
            dir: mocks.consoleVerboseDir,
        },
    })),
    getLogBuffer: mocks.getLogBuffer,
}));

vi.mock('@lib/scanMonitorFiles', () => ({
    default: mocks.scanMonitorFiles,
}));

suite('diagnostics/sendReport', () => {
    let sendDiagnosticsReport: SendDiagnosticsReportType;

    beforeEach(async () => {
        vi.resetModules();
        vi.clearAllMocks();

        vi.stubGlobal('emsg', (error: unknown) => {
            if (error instanceof Error) return error.message;
            return String(error);
        });

        vi.stubGlobal('txCore', {
            discordBot: {
                getDiagnostics: vi.fn(() => ({
                    enabled: true,
                    status: 'ready',
                })),
            },
            database: {
                botAnalytics: {
                    getCommandAnalytics: vi.fn(() => ({
                        overview: {
                            total: 3,
                        },
                    })),
                },
                stats: {
                    getDatabaseStats: vi.fn(() => ({
                        writes: 1,
                    })),
                },
            },
            adminStore: {
                getRawAdminsList: vi.fn(() => [
                    {
                        name: 'admin',
                        password_hash: 'sensitive-hash',
                        permissions: ['all_permissions'],
                    },
                ]),
            },
            configStore: {
                getStoredConfig: vi.fn(() => ({
                    discordBot: {
                        token: 'super-secret-token',
                    },
                    server: {
                        startupArgs: ['+set', 'sv_licenseKey', 'cfxk_test_abcdefghijklmnop', '+set', 'rcon_password', 'secret'],
                    },
                })),
            },
            logger: {
                system: {
                    getSessionFileContent: vi.fn(async () => 'action log 127.0.0.1'),
                },
                server: {
                    getRecentBuffer: vi.fn(() => [
                        {
                            ts: 1,
                            type: 'info',
                            src: {
                                id: false,
                                name: 'server',
                            },
                            msg: 'server log 127.0.0.1',
                        },
                    ]),
                },
                fxserver: {
                    getRecentBufferString: vi.fn(() => 'fxserver log 127.0.0.1'),
                },
            },
            fxRunner: {
                serverPaths: {
                    dataPath: 'C:/fxserver-data',
                },
            },
            metrics: {
                svRuntime: {
                    getServerPerfSummary: vi.fn(() => ({
                        avgTickMs: 4,
                    })),
                },
            },
        });

        mocks.getHostData.mockResolvedValue({
            static: {
                nodeVersion: process.version,
            },
        });
        mocks.getTxAdminData.mockResolvedValue({
            uptime: '1 hour',
        });
        mocks.getFXServerData.mockResolvedValue({
            error: false,
            version: 'win:stable:1234',
        });
        mocks.getProcessesData.mockResolvedValue([{ pid: 1 }]);
        mocks.getServerDataContent.mockResolvedValue([{ path: 'server.cfg', type: 'file' }]);
        mocks.getServerDataConfigs.mockResolvedValue([['server.cfg', 'sv_licenseKey cfxk_test_abcdefghijklmnop']]);
        mocks.getLogBuffer.mockReturnValue('system log 127.0.0.1');
        mocks.scanMonitorFiles.mockResolvedValue({
            files: ['monitor/index.js'],
        });

        ({ default: sendDiagnosticsReport } = await import('./sendReport'));
    });

    it('returns a useful error when the upstream diagnostics API has no JSON body', async () => {
        mocks.gotPost.mockReturnValue({
            json: vi.fn().mockRejectedValue(
                Object.assign(new Error('upstream unavailable'), {
                    response: {
                        statusCode: 502,
                        statusMessage: 'Bad Gateway',
                    },
                }),
            ),
        });
        const { ctx, sentData } = createMockCtx();

        await sendDiagnosticsReport(ctx);

        expect(sentData[0]).toEqual({
            error: 'Report failed: HTTP 502 Bad Gateway - upstream unavailable',
        });
    });

    it('includes expanded sanitized metadata in the submitted report payload', async () => {
        mocks.gotPost.mockReturnValue({
            json: vi.fn().mockResolvedValue({
                reportId: 'report-123',
            }),
        });
        const { ctx, sentData } = createMockCtx({ adminName: 'Eli' });

        await sendDiagnosticsReport(ctx);

        expect(sentData[0]).toEqual({ reportId: 'report-123' });

        expect(mocks.gotPost).toHaveBeenCalledWith(
            'https://fxapi.fxpanel.org/api/diagnostics',
            expect.objectContaining({
                headers: expect.objectContaining({
                    'content-type': 'application/json',
                    'content-encoding': 'gzip',
                }),
            }),
        );
        const requestOptions = mocks.gotPost.mock.calls[0][1];
        const payload = JSON.parse(gunzipSync(requestOptions.body).toString('utf8'));

        expect(payload.reportMeta).toMatchObject({
            generatedAt: expect.any(String),
            payload: {
                contentEncoding: 'gzip',
                schemaVersion: 2,
                jsonBytes: expect.any(Number),
                gzipBytes: expect.any(Number),
            },
        });
        expect(payload.reportMeta.payload.jsonBytes).toBeGreaterThan(0);
        expect(payload.reportMeta.payload.gzipBytes).toBeGreaterThan(0);
        expect(payload.reportMeta.process).toEqual(
            expect.objectContaining({
                pid: expect.any(Number),
                ppid: expect.any(Number),
                platform: expect.any(String),
                arch: expect.any(String),
                versions: expect.any(Object),
                resourceUsage: expect.any(Object),
            }),
        );
        expect(payload.reportMeta.host).toEqual(
            expect.objectContaining({
                type: expect.any(String),
                release: expect.any(String),
                arch: expect.any(String),
                timezone: expect.any(String),
                locale: expect.any(String),
            }),
        );
        expect(payload.settings.discordBot.token).toBe('[REDACTED]');
        expect(payload.settings.server.startupArgs).toEqual(
            expect.arrayContaining(['sv_licenseKey', '[REDACTED cfxk...abcdefghijklmnop]', 'rcon_password', '[REDACTED]']),
        );
        expect(payload.txSystemLog).toContain('x.x.x.x');
        expect(payload.txSystemLog).not.toContain('127.0.0.1');
    });

    it('continues sending the report with partial diagnostics when one diagnostics section fails', async () => {
        mocks.getHostData.mockRejectedValue(new Error('host probe failed'));
        mocks.gotPost.mockReturnValue({
            json: vi.fn().mockResolvedValue({
                reportId: 'report-456',
            }),
        });
        const { ctx } = createMockCtx();

        await sendDiagnosticsReport(ctx);

        const requestOptions = mocks.gotPost.mock.calls[0][1];
        const payload = JSON.parse(gunzipSync(requestOptions.body).toString('utf8'));

        expect(payload.diagnostics.host).toEqual({
            error: 'Failed to collect host diagnostics: host probe failed',
        });
        expect(payload.diagnostics.txadmin).toEqual({ uptime: '1 hour' });
    });
});