import { suite, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@modules/AdminStore/permissionPresets', () => ({
    getAllPermissionPresets: () => [
        {
            id: 'custom:supporter',
            name: 'Supporter',
            permissions: [
                'console.view',
                'players.direct_message',
                'players.warn',
                'players.kick',
                'players.spectate',
                'menu.viewids',
            ],
        },
    ],
    resolvePermissionPresetIdsFromCatalog: (catalog: Array<{ id: string; name: string; permissions: string[] }>, presetIds: unknown) => {
        const normalizedPresetIds = typeof presetIds === 'string'
            ? [presetIds]
            : Array.isArray(presetIds)
              ? presetIds.filter((presetId): presetId is string => typeof presetId === 'string')
              : [];

        const matchedPresetIds = [] as string[];
        const matchedPresetNames = [] as string[];
        const grantedPermissions = new Set<string>();

        for (const presetId of normalizedPresetIds) {
            const preset = catalog.find((entry) => entry.id === presetId);
            if (!preset) continue;

            matchedPresetIds.push(preset.id);
            matchedPresetNames.push(preset.name);
            for (const permission of preset.permissions) {
                grantedPermissions.add(permission);
            }
        }

        return {
            presetIds: matchedPresetIds,
            presetNames: matchedPresetNames,
            permissions: [...grantedPermissions],
        };
    },
}));

import { checkRequestAuth, normalAuthLogic, nuiAuthLogic, resolveEffectiveAuthedAdmin } from './authLogic';
import { StoredAdmin } from '@modules/AdminStore/adminClasses';
import type { SessToolsType } from './middlewares/sessionMws';
import type { PassSessAuthType, CfxreSessAuthType } from './authLogic';

//Mock admin data
const mockAdminRaw = {
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
};
const storedAdmin = new StoredAdmin(mockAdminRaw);
const storedDiscordAdmin = new StoredAdmin({
    ...mockAdminRaw,
    master: false,
    permissions: ['players.warn'],
    providers: {
        ...mockAdminRaw.providers,
        discord: {
            id: '123456789012345678',
            identifier: 'discord:123456789012345678',
            data: {},
        },
    },
});

//Stub txCore globals for auth logic
const syncAdminDiscordRolePermissions = vi.fn(async () => true);

vi.stubGlobal('txCore', {
    adminStore: {
        getAdminByName: (name: string) => (name === 'testadmin' ? storedAdmin : null),
        getAdminByIdentifiers: (ids: string[]) => {
            if (ids.some((id) => id === 'fivem:123456')) return storedAdmin;
            return null;
        },
        syncAdminDiscordRolePermissions,
    },
    discordBot: {
        isClientReady: true,
        resolveMemberRoles: vi.fn(async () => ({ isMember: true, memberRoles: ['role-moderator'] })),
    },
    webServer: {
        luaComToken: 'test-lua-com-token',
    },
    cacheStore: {
        get: () => undefined,
    },
});
vi.stubGlobal('txConfig', {
    webServer: {
        disableNuiSourceCheck: false,
    },
    discordBot: {
        rolePermissions: [
            {
                id: 'mapping-1',
                label: 'Moderators',
                discordRoleIds: ['role-moderator'],
                permissionPresetId: 'custom:supporter',
            },
        ],
    },
});

const mockSessTools = (sessData?: any): SessToolsType => ({
    get: () => sessData,
    set: vi.fn(),
    destroy: vi.fn(),
});

suite('normalAuthLogic', () => {
    it('should fail with no session', () => {
        const result = normalAuthLogic(mockSessTools(undefined));
        expect(result.success).toBe(false);
    });

    it('should fail with empty session', () => {
        const result = normalAuthLogic(mockSessTools({}));
        expect(result.success).toBe(false);
    });

    it('should fail with invalid auth shape', () => {
        const result = normalAuthLogic(mockSessTools({ auth: { type: 'garbage' } }));
        expect(result.success).toBe(false);
    });

    it('should succeed with valid password session', () => {
        const sessAuth: PassSessAuthType = {
            type: 'password',
            username: 'testadmin',
            csrfToken: 'test-csrf-token',
            expiresAt: false,
            password_hash: mockAdminRaw.password_hash,
        };
        const result = normalAuthLogic(mockSessTools({ auth: sessAuth }));
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.admin.name).toBe('testadmin');
            expect(result.admin.csrfToken).toBe('test-csrf-token');
        }
    });

    it('should fail with wrong password hash', () => {
        const sessAuth: PassSessAuthType = {
            type: 'password',
            username: 'testadmin',
            csrfToken: 'test-csrf-token',
            expiresAt: false,
            password_hash: 'wrong-hash',
        };
        const result = normalAuthLogic(mockSessTools({ auth: sessAuth }));
        expect(result.success).toBe(false);
    });

    it('should succeed with valid cfxre session', () => {
        const sessAuth: CfxreSessAuthType = {
            type: 'cfxre',
            username: 'testadmin',
            csrfToken: 'test-csrf-token',
            expiresAt: Date.now() + 60_000,
            identifier: 'fivem:123456',
        };
        const result = normalAuthLogic(mockSessTools({ auth: sessAuth }));
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.admin.name).toBe('testadmin');
        }
    });

    it('should fail with expired cfxre session', () => {
        const sessAuth: CfxreSessAuthType = {
            type: 'cfxre',
            username: 'testadmin',
            csrfToken: 'test-csrf-token',
            expiresAt: Date.now() - 60_000,
            identifier: 'fivem:123456',
        };
        const result = normalAuthLogic(mockSessTools({ auth: sessAuth }));
        expect(result.success).toBe(false);
    });

    it('should fail with wrong cfxre identifier', () => {
        const sessAuth: CfxreSessAuthType = {
            type: 'cfxre',
            username: 'testadmin',
            csrfToken: 'test-csrf-token',
            expiresAt: Date.now() + 60_000,
            identifier: 'fivem:999999',
        };
        const result = normalAuthLogic(mockSessTools({ auth: sessAuth }));
        expect(result.success).toBe(false);
    });

    it('should fail when admin not found in store', () => {
        const sessAuth: PassSessAuthType = {
            type: 'password',
            username: 'nonexistent',
            csrfToken: 'test-csrf-token',
            expiresAt: false,
            password_hash: 'whatever',
        };
        const result = normalAuthLogic(mockSessTools({ auth: sessAuth }));
        expect(result.success).toBe(false);
    });
});

suite('nuiAuthLogic', () => {
    it('should fail with non-local request when source check enabled', () => {
        const result = nuiAuthLogic('8.8.8.8', false, {
            'x-txadmin-token': 'test-token',
            'x-txadmin-identifiers': 'license:abc123',
        });
        expect(result.success).toBe(false);
    });

    it('should fail with missing token header', () => {
        const result = nuiAuthLogic('127.0.0.1', true, {
            'x-txadmin-identifiers': 'license:abc123',
        });
        expect(result.success).toBe(false);
    });

    it('should fail with missing identifiers header', () => {
        const result = nuiAuthLogic('127.0.0.1', true, {
            'x-txadmin-token': 'test-lua-com-token',
        });
        expect(result.success).toBe(false);
    });

    it('should fail with wrong token', () => {
        const result = nuiAuthLogic('127.0.0.1', true, {
            'x-txadmin-token': 'wrong-token',
            'x-txadmin-identifiers': 'license:abc123',
        });
        expect(result.success).toBe(false);
    });

    it('should fail with empty identifiers', () => {
        const result = nuiAuthLogic('127.0.0.1', true, {
            'x-txadmin-token': 'test-lua-com-token',
            'x-txadmin-identifiers': '',
        });
        expect(result.success).toBe(false);
    });

    it('should succeed with valid token and matching identifiers', () => {
        const result = nuiAuthLogic('127.0.0.1', true, {
            'x-txadmin-token': 'test-lua-com-token',
            'x-txadmin-identifiers': 'fivem:123456',
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.admin.name).toBe('testadmin');
        }
    });

    it('should return nui_admin_not_found with valid token but no matching admin', () => {
        const result = nuiAuthLogic('127.0.0.1', true, {
            'x-txadmin-token': 'test-lua-com-token',
            'x-txadmin-identifiers': 'license:nomatch',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.rejectReason).toBe('nui_admin_not_found');
        }
    });
});

suite('checkRequestAuth', () => {
    it('should dispatch to nuiAuthLogic when x-txadmin-token is present', () => {
        const result = checkRequestAuth(
            { 'x-txadmin-token': 'test-lua-com-token', 'x-txadmin-identifiers': 'fivem:123456' },
            '127.0.0.1',
            true,
            mockSessTools(undefined),
        );
        expect(result.success).toBe(true);
    });

    it('should dispatch to normalAuthLogic when no x-txadmin-token', () => {
        const sessAuth: PassSessAuthType = {
            type: 'password',
            username: 'testadmin',
            csrfToken: 'test-csrf-token',
            expiresAt: false,
            password_hash: mockAdminRaw.password_hash,
        };
        const result = checkRequestAuth({}, '127.0.0.1', true, mockSessTools({ auth: sessAuth }));
        expect(result.success).toBe(true);
    });

    it('should fail normalAuthLogic path when no session', () => {
        const result = checkRequestAuth({}, '127.0.0.1', true, mockSessTools(undefined));
        expect(result.success).toBe(false);
    });
});

suite('resolveEffectiveAuthedAdmin', () => {
    beforeEach(() => {
        syncAdminDiscordRolePermissions.mockClear();
        (txCore.discordBot.resolveMemberRoles as ReturnType<typeof vi.fn>).mockResolvedValue({
            isMember: true,
            memberRoles: ['role-moderator'],
        });
    });

    it('should merge mapped Discord role permissions into linked admins', async () => {
        const authedAdmin = await resolveEffectiveAuthedAdmin(storedDiscordAdmin, 'csrf-token');

        expect(authedAdmin.permissions).toEqual([
            'players.warn',
            'console.view',
            'players.direct_message',
            'players.kick',
            'players.spectate',
            'menu.viewids',
        ]);
        expect(authedAdmin.isMaster).toBe(false);
        expect(authedAdmin.getAuthData().permissions).toEqual([
            'players.warn',
            'console.view',
            'players.direct_message',
            'players.kick',
            'players.spectate',
            'menu.viewids',
        ]);
        expect(syncAdminDiscordRolePermissions).toHaveBeenCalledWith('123456789012345678', {
            permissions: [
                'console.view',
                'players.direct_message',
                'players.warn',
                'players.kick',
                'players.spectate',
                'menu.viewids',
            ],
            presetIds: ['custom:supporter'],
            roleIds: ['role-moderator'],
        });
    });

    it('should fall back to stored permissions when the bot is unavailable', async () => {
        vi.stubGlobal('txCore', {
            ...txCore,
            discordBot: {
                isClientReady: false,
                resolveMemberRoles: vi.fn(async () => ({ isMember: false, memberRoles: [] })),
            },
        });

        const authedAdmin = await resolveEffectiveAuthedAdmin(storedDiscordAdmin, 'csrf-token');
        expect(authedAdmin.permissions).toEqual(['players.warn']);
    });

    it('should fall back to stored Discord role sync permissions when the bot is unavailable', async () => {
        vi.stubGlobal('txCore', {
            ...txCore,
            discordBot: {
                isClientReady: false,
                resolveMemberRoles: vi.fn(async () => ({ isMember: false, memberRoles: [] })),
            },
        });

        const storedSyncedAdmin = new StoredAdmin({
            ...mockAdminRaw,
            master: false,
            permissions: ['players.warn'],
            providers: {
                ...mockAdminRaw.providers,
                discord: {
                    id: '123456789012345678',
                    identifier: 'discord:123456789012345678',
                    data: {
                        fxpanelRoleSync: {
                            permissions: ['players.kick', 'menu.viewids'],
                            presetIds: ['custom:supporter'],
                            roleIds: ['role-moderator'],
                        },
                    },
                },
            },
        });

        const authedAdmin = await resolveEffectiveAuthedAdmin(storedSyncedAdmin, 'csrf-token');
        expect(authedAdmin.permissions).toEqual(['players.warn', 'players.kick', 'menu.viewids']);
    });
});
