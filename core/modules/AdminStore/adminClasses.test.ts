import { suite, it, expect, vi, beforeEach } from 'vitest';
import { StoredAdmin, AuthedAdmin, type RawAdminType } from './adminClasses';

// Mock txCore for AuthedAdmin tests
vi.stubGlobal('txCore', {
    cacheStore: {
        get: vi.fn(() => undefined),
    },
    logger: {
        system: {
            write: vi.fn(),
        },
    },
});

const makeMockRaw = (overrides: Partial<RawAdminType> = {}): RawAdminType => ({
    $schema: 1,
    name: 'testadmin',
    master: true,
    password_hash: '$2b$11$K3HwDzkoUfhU6.W.tScfhOLEtR5uNc9qpQ685emtERx3dZ7fmgXCy',
    providers: {
        citizenfx: {
            id: '123456',
            identifier: 'fivem:123456',
            data: {},
        },
    },
    permissions: ['all_permissions'],
    ...overrides,
});

suite('StoredAdmin', () => {
    it('should construct from raw admin data', () => {
        const raw = makeMockRaw();
        const admin = new StoredAdmin(raw);
        expect(admin.name).toBe('testadmin');
        expect(admin.isMaster).toBe(true);
        expect(admin.passwordHash).toBe(raw.password_hash);
        expect(admin.isTempPassword).toBe(false);
        expect(admin.permissions).toEqual(['all_permissions']);
        expect(admin.totpEnabled).toBe(false);
    });

    it('should detect temporary password', () => {
        const raw = makeMockRaw({ password_temporary: true });
        const admin = new StoredAdmin(raw);
        expect(admin.isTempPassword).toBe(true);
    });

    it('should detect TOTP enabled', () => {
        const raw = makeMockRaw({ totp_secret: 'JBSWY3DPEHPK3PXP' });
        const admin = new StoredAdmin(raw);
        expect(admin.totpEnabled).toBe(true);
    });

    it('should not detect TOTP when secret is empty string', () => {
        const raw = makeMockRaw({ totp_secret: '' });
        const admin = new StoredAdmin(raw);
        expect(admin.totpEnabled).toBe(false);
    });

    it('should construct from another StoredAdmin (copy constructor)', () => {
        const original = new StoredAdmin(makeMockRaw());
        const copy = new StoredAdmin(original);
        expect(copy.name).toBe(original.name);
        expect(copy.isMaster).toBe(original.isMaster);
        expect(copy.passwordHash).toBe(original.passwordHash);
        expect(copy.permissions).toEqual(original.permissions);
    });

    it('should map master field correctly for non-master', () => {
        const raw = makeMockRaw({ master: false, permissions: ['players.ban', 'players.kick'] });
        const admin = new StoredAdmin(raw);
        expect(admin.isMaster).toBe(false);
        expect(admin.permissions).toEqual(['players.ban', 'players.kick']);
    });

    it('should preserve providers data', () => {
        const raw = makeMockRaw({
            providers: {
                citizenfx: { id: '999', identifier: 'fivem:999', data: { nameid: '/user/999' } },
                discord: { id: 'disc123', identifier: 'discord:disc123', data: {} },
            },
        });
        const admin = new StoredAdmin(raw);
        expect(admin.providers.citizenfx?.id).toBe('999');
        expect(admin.providers.discord?.id).toBe('disc123');
    });

    it('should create an AuthedAdmin via getAuthed()', () => {
        const admin = new StoredAdmin(makeMockRaw());
        const authed = admin.getAuthed('csrf-token-123');
        expect(authed).toBeInstanceOf(AuthedAdmin);
        expect(authed.csrfToken).toBe('csrf-token-123');
    });
});

suite('AuthedAdmin', () => {
    let storedAdmin: StoredAdmin;

    beforeEach(() => {
        storedAdmin = new StoredAdmin(makeMockRaw());
        vi.clearAllMocks();
    });

    it('should construct with CSRF token', () => {
        const authed = new AuthedAdmin(storedAdmin, 'my-csrf');
        expect(authed.csrfToken).toBe('my-csrf');
        expect(authed.name).toBe('testadmin');
    });

    it('should set profilePicture from cache', () => {
        (txCore.cacheStore.get as ReturnType<typeof vi.fn>).mockReturnValueOnce('https://cdn.example.com/avatar.png');
        const authed = new AuthedAdmin(storedAdmin, 'csrf');
        expect(authed.profilePicture).toBe('https://cdn.example.com/avatar.png');
    });

    it('should set profilePicture to undefined when cache miss', () => {
        (txCore.cacheStore.get as ReturnType<typeof vi.fn>).mockReturnValueOnce(undefined);
        const authed = new AuthedAdmin(storedAdmin, 'csrf');
        expect(authed.profilePicture).toBeUndefined();
    });

    suite('hasPermission', () => {
        it('should grant master admin all permissions', () => {
            const authed = new AuthedAdmin(storedAdmin, 'csrf');
            expect(authed.hasPermission('players.ban')).toBe(true);
            expect(authed.hasPermission('anything.else')).toBe(true);
        });

        it('should grant master permission only to master', () => {
            const authed = new AuthedAdmin(storedAdmin, 'csrf');
            expect(authed.hasPermission('master')).toBe(true);

            const nonMaster = new StoredAdmin(makeMockRaw({ master: false, permissions: ['all_permissions'] }));
            const authed2 = new AuthedAdmin(nonMaster, 'csrf');
            expect(authed2.hasPermission('master')).toBe(false);
        });

        it('should grant all_permissions holder all perms except master', () => {
            const admin = new StoredAdmin(makeMockRaw({ master: false, permissions: ['all_permissions'] }));
            const authed = new AuthedAdmin(admin, 'csrf');
            expect(authed.hasPermission('players.ban')).toBe(true);
            expect(authed.hasPermission('master')).toBe(false);
        });

        it('should deny permissions not in list for non-master', () => {
            const admin = new StoredAdmin(makeMockRaw({ master: false, permissions: ['players.ban'] }));
            const authed = new AuthedAdmin(admin, 'csrf');
            expect(authed.hasPermission('players.ban')).toBe(true);
            expect(authed.hasPermission('players.kick')).toBe(false);
            expect(authed.hasPermission('server.restart')).toBe(false);
        });
    });

    suite('testPermission', () => {
        it('should return true for granted permission', () => {
            const authed = new AuthedAdmin(storedAdmin, 'csrf');
            expect(authed.testPermission('players.ban', 'test')).toBe(true);
        });

        it('should return false for denied permission', () => {
            const admin = new StoredAdmin(makeMockRaw({ master: false, permissions: [] }));
            const authed = new AuthedAdmin(admin, 'csrf');
            expect(authed.testPermission('players.ban', 'test')).toBe(false);
        });
    });

    suite('logAction / logCommand', () => {
        it('should call logger.system.write for actions', () => {
            const authed = new AuthedAdmin(storedAdmin, 'csrf');
            authed.logAction('banned player');
            expect(txCore.logger.system.write).toHaveBeenCalledWith(
                'testadmin',
                'banned player',
                'action',
                expect.objectContaining({ actionId: undefined }),
            );
        });

        it('should call logger.system.write for commands', () => {
            const authed = new AuthedAdmin(storedAdmin, 'csrf');
            authed.logCommand('restart server');
            expect(txCore.logger.system.write).toHaveBeenCalledWith(
                'testadmin',
                'restart server',
                'command',
                expect.objectContaining({ actionId: undefined }),
            );
        });

        it('should normalize negative password revisions and still log actions', () => {
            const legacyAdmin = new StoredAdmin(
                makeMockRaw({
                    name: 'legacyadmin',
                    master: true,
                    password_revision: -1,
                }),
            );
            const authed = new AuthedAdmin(legacyAdmin, 'csrf');
            authed.logAction('banned player');
            authed.logCommand('restart server');
            expect(authed.passwordRevision).toBe(0);
            expect(txCore.logger.system.write).toHaveBeenCalledTimes(2);
        });
    });

    suite('getAuthData', () => {
        it('should return correct auth data for master admin', () => {
            const authed = new AuthedAdmin(storedAdmin, 'my-csrf');
            const data = authed.getAuthData();
            expect(data.name).toBe('testadmin');
            expect(data.permissions).toEqual(['all_permissions']);
            expect(data.isMaster).toBe(true);
            expect(data.isTempPassword).toBe(false);
            expect(data.csrfToken).toBe('my-csrf');
            expect(data.totpEnabled).toBe(false);
        });

        it('should return specific permissions for non-master admin', () => {
            const admin = new StoredAdmin(makeMockRaw({ master: false, permissions: ['players.ban', 'players.kick'] }));
            const authed = new AuthedAdmin(admin, 'csrf');
            const data = authed.getAuthData();
            expect(data.permissions).toEqual(['players.ban', 'players.kick']);
            expect(data.isMaster).toBe(false);
        });

        it('should default csrfToken to not_set when undefined', () => {
            const authed = new AuthedAdmin(storedAdmin);
            const data = authed.getAuthData();
            expect(data.csrfToken).toBe('not_set');
        });
    });
});
