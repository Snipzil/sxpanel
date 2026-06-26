import { suite, it, expect, vi, beforeEach } from 'vitest';
import AuthSelf from './self';
import { createMockCtx } from '../../testing/routeTestUtils';

vi.stubGlobal('txConfig', {
    general: {
        requireAdminTwoFactor: false,
    },
});

suite('authentication/self', () => {
    beforeEach(() => {
        txConfig.general.requireAdminTwoFactor = false;
    });

    it('should return the admin auth data', async () => {
        const { ctx, sentData } = createMockCtx({
            adminName: 'superadmin',
            permissions: ['all_permissions'],
        });
        ctx.headers = {};

        await AuthSelf(ctx);

        expect(ctx.send).toHaveBeenCalledOnce();
        expect(sentData[0]).toMatchObject({
            name: 'superadmin',
            permissions: ['all_permissions'],
            csrfToken: 'test-csrf',
        });
    });

    it('should reject NUI auth when 2FA is required but not enabled', async () => {
        txConfig.general.requireAdminTwoFactor = true;
        const { ctx, sentData } = createMockCtx({
            adminName: 'staff',
            permissions: ['players.ban'],
        });
        ctx.headers = { 'x-txadmin-token': 'test-token' };
        ctx.admin.isMaster = false;
        ctx.admin.totpEnabled = false;
        ctx.admin.isTempPassword = false;

        await AuthSelf(ctx);

        expect(sentData[0]).toMatchObject({
            logout: true,
            reason: 'two_factor_required',
        });
    });

    it('should reject NUI auth for master when 2FA is required but not enabled', async () => {
        txConfig.general.requireAdminTwoFactor = true;
        const { ctx, sentData } = createMockCtx({
            adminName: 'master',
            permissions: ['all_permissions'],
        });
        ctx.headers = { 'x-txadmin-token': 'test-token' };
        ctx.admin.isMaster = true;
        ctx.admin.totpEnabled = false;
        ctx.admin.isTempPassword = false;

        await AuthSelf(ctx);

        expect(sentData[0]).toMatchObject({
            logout: true,
            reason: 'two_factor_required',
        });
    });

    it('should still return web session auth data when 2FA is required but not enabled', async () => {
        txConfig.general.requireAdminTwoFactor = true;
        const { ctx, sentData } = createMockCtx({
            adminName: 'staff',
            permissions: ['players.ban'],
        });
        ctx.headers = {};
        ctx.admin.isMaster = false;
        ctx.admin.totpEnabled = false;
        ctx.admin.getAuthData = vi.fn(() => ({
            name: 'staff',
            permissions: ['players.ban'],
            csrfToken: 'test-csrf',
            isMaster: false,
            isTempPassword: false,
            totpEnabled: false,
        }));

        await AuthSelf(ctx);

        expect(sentData[0]).toMatchObject({
            name: 'staff',
            totpEnabled: false,
        });
    });
});
