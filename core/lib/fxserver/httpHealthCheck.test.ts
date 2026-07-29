import { beforeEach, describe, expect, it, vi } from 'vitest';

const stubRuntime = (onlineCount: number, disableHealthCheck: boolean | string = false) => {
    vi.stubGlobal('txConfig', {
        restarter: { disableHealthCheck },
    });
    vi.stubGlobal('txCore', {
        fxPlayerlist: { onlineCount },
    });
};

describe('httpHealthCheck', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    describe('isHttpHealthCheckDisabled', () => {
        it('reflects the restarter.disableHealthCheck config value', async () => {
            stubRuntime(0, true);
            const { isHttpHealthCheckDisabled } = await import('./httpHealthCheck');
            expect(isHttpHealthCheckDisabled()).toBe(true);
        });

        it('treats the string "true" as enabled (legacy convar coercion)', async () => {
            stubRuntime(0, 'true');
            const { isHttpHealthCheckDisabled } = await import('./httpHealthCheck');
            expect(isHttpHealthCheckDisabled()).toBe(true);
        });

        it('defaults to false', async () => {
            stubRuntime(0, false);
            const { isHttpHealthCheckDisabled } = await import('./httpHealthCheck');
            expect(isHttpHealthCheckDisabled()).toBe(false);
        });
    });

    describe('getDisplayPlayerCount', () => {
        it('always reflects the real FD3-backed online count', async () => {
            stubRuntime(7);
            const { getDisplayPlayerCount } = await import('./httpHealthCheck');
            expect(getDisplayPlayerCount()).toBe(7);
        });

        it('returns 0 when fxPlayerlist is not yet available', async () => {
            vi.stubGlobal('txConfig', { restarter: { disableHealthCheck: false } });
            vi.stubGlobal('txCore', {});
            const { getDisplayPlayerCount } = await import('./httpHealthCheck');
            expect(getDisplayPlayerCount()).toBe(0);
        });
    });
});
