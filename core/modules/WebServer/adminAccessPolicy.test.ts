import { describe, expect, it, vi } from 'vitest';
import { StoredAdmin } from '@modules/AdminStore/adminClasses';
import { getAdminAccessBlockReason, getAdminAccessDenial } from './adminAccessPolicy';

const makeAdmin = (overrides: Partial<ConstructorParameters<typeof StoredAdmin>[0]> = {}) =>
    new StoredAdmin({
        $schema: 1,
        name: 'user',
        master: false,
        password_hash: '$argon2id$v=19$m=65536,t=3,p=1$aaaaaaaaaaaaaaa$bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        providers: {},
        permissions: [],
        ...overrides,
    });

vi.stubGlobal('txConfig', {
    general: {
        requireAdminTwoFactor: false,
    },
});

describe('adminAccessPolicy', () => {
    it('blocks admins with a temporary password', () => {
        const admin = makeAdmin({ password_temporary: true });
        expect(getAdminAccessBlockReason(admin)).toBe('temp_password_change_required');
        expect(getAdminAccessDenial(admin, '/player')).toMatchObject({
            reason: 'temp_password_change_required',
        });
        expect(getAdminAccessDenial(admin, '/auth/changePassword')).toBeNull();
    });

    it('blocks non-master admins without 2FA when required', () => {
        txConfig.general.requireAdminTwoFactor = true;
        const admin = makeAdmin();
        expect(getAdminAccessBlockReason(admin)).toBe('two_factor_required');
        expect(getAdminAccessDenial(admin, '/player')).toMatchObject({ reason: 'two_factor_required' });
        expect(getAdminAccessDenial(admin, '/auth/totp/setup')).toBeNull();
    });

    it('blocks the master admin when 2FA is required but not enabled', () => {
        txConfig.general.requireAdminTwoFactor = true;
        const admin = makeAdmin({ master: true });
        expect(getAdminAccessBlockReason(admin)).toBe('two_factor_required');
    });

    it('allows master to reach general settings while 2FA is required (disable escape hatch)', () => {
        txConfig.general.requireAdminTwoFactor = true;
        const admin = makeAdmin({ master: true });
        expect(getAdminAccessDenial(admin, '/settings/configs/general')).toBeNull();
        expect(getAdminAccessDenial(admin, '/player')).toMatchObject({ reason: 'two_factor_required' });
    });
});
