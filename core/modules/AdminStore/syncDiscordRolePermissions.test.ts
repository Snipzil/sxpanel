import { suite, it, expect, vi, beforeEach } from 'vitest';
import AdminStore from './index';
import { getDiscordRoleSyncData, type RawAdminType } from './adminClasses';

const makeAdmin = (): RawAdminType => ({
    $schema: 1,
    name: 'testadmin',
    master: false,
    password_hash: '$2b$11$K3HwDzkoUfhU6.W.tScfhOLEtR5uNc9qpQ685emtERx3dZ7fmgXCy',
    providers: {
        discord: {
            id: '123456789012345678',
            identifier: 'discord:123456789012345678',
            data: {},
        },
    },
    permissions: ['players.warn'],
});

const makeStore = () => {
    const store = Object.create(AdminStore.prototype) as AdminStore & {
        admins: RawAdminType[];
        writeAdminsFile: ReturnType<typeof vi.fn>;
        refreshOnlineAdmins: ReturnType<typeof vi.fn>;
    };

    store.admins = [makeAdmin()];
    store.writeAdminsFile = vi.fn(async () => true);
    store.refreshOnlineAdmins = vi.fn(async () => {});
    return store;
};

suite('AdminStore.syncAdminDiscordRolePermissions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('persists synced Discord role permissions for a linked admin', async () => {
        const store = makeStore();

        await store.syncAdminDiscordRolePermissions('123456789012345678', {
            permissions: ['players.kick', 'menu.viewids'],
            presetIds: ['custom:supporter'],
            roleIds: ['role-moderator'],
        });

        expect(getDiscordRoleSyncData(store.admins[0].providers)).toEqual({
            permissions: ['players.kick', 'menu.viewids'],
            presetIds: ['custom:supporter'],
            roleIds: ['role-moderator'],
            syncedAt: expect.any(Number),
        });
        expect(store.admins[0].permissions).toEqual(['players.warn', 'players.kick', 'menu.viewids']);
        expect(store.writeAdminsFile).toHaveBeenCalledTimes(1);
        expect(store.refreshOnlineAdmins).toHaveBeenCalledTimes(1);
    });

    it('clears synced Discord role permissions when sync data is removed', async () => {
        const store = makeStore();
        store.admins[0].permissions = ['players.warn', 'players.kick'];
        store.admins[0].providers.discord!.data.fxpanelRoleSync = {
            permissions: ['players.kick'],
            presetIds: ['custom:supporter'],
            roleIds: ['role-moderator'],
            syncedAt: Date.now(),
        };

        await store.syncAdminDiscordRolePermissions('123456789012345678', false);

        expect(getDiscordRoleSyncData(store.admins[0].providers)).toBe(false);
        expect(store.admins[0].permissions).toEqual(['players.warn']);
        expect(store.writeAdminsFile).toHaveBeenCalledTimes(1);
        expect(store.refreshOnlineAdmins).toHaveBeenCalledTimes(1);
    });

    it('replaces previously synced permissions without dropping manual permissions', async () => {
        const store = makeStore();
        store.admins[0].permissions = ['players.warn', 'players.kick'];
        store.admins[0].providers.discord!.data.fxpanelRoleSync = {
            permissions: ['players.kick'],
            presetIds: ['custom:supporter'],
            roleIds: ['role-moderator'],
            syncedAt: Date.now() - 1000,
        };

        await store.syncAdminDiscordRolePermissions('123456789012345678', {
            permissions: ['menu.viewids'],
            presetIds: ['custom:viewer'],
            roleIds: ['role-viewer'],
        });

        expect(getDiscordRoleSyncData(store.admins[0].providers)).toEqual({
            permissions: ['menu.viewids'],
            presetIds: ['custom:viewer'],
            roleIds: ['role-viewer'],
            syncedAt: expect.any(Number),
        });
        expect(store.admins[0].permissions).toEqual(['players.warn', 'menu.viewids']);
    });

    it('preserves synced role permissions when editing a linked admin', async () => {
        const store = makeStore();
        store.admins[0].permissions = ['players.warn', 'players.kick'];
        store.admins[0].providers.discord!.data.fxpanelRoleSync = {
            permissions: ['players.kick'],
            presetIds: ['custom:supporter'],
            roleIds: ['role-moderator'],
            syncedAt: Date.now() - 1000,
        };

        await store.editAdmin(
            'testadmin',
            null,
            undefined,
            {
                id: '123456789012345678',
                identifier: 'discord:123456789012345678',
            },
            ['players.warn', 'players.kick', 'console.view'],
        );

        expect(getDiscordRoleSyncData(store.admins[0].providers)).toEqual({
            permissions: ['players.kick'],
            presetIds: ['custom:supporter'],
            roleIds: ['role-moderator'],
            syncedAt: expect.any(Number),
        });
        expect(store.admins[0].permissions).toEqual(['players.warn', 'console.view', 'players.kick']);
    });

    it('does not rewrite admins.json when the sync data is unchanged', async () => {
        const store = makeStore();
        store.admins[0].permissions = ['players.warn', 'players.kick'];
        store.admins[0].providers.discord!.data.fxpanelRoleSync = {
            permissions: ['players.kick'],
            presetIds: ['custom:supporter'],
            roleIds: ['role-moderator'],
            syncedAt: Date.now() - 1000,
        };

        const changed = await store.syncAdminDiscordRolePermissions('123456789012345678', {
            permissions: ['players.kick'],
            presetIds: ['custom:supporter'],
            roleIds: ['role-moderator'],
        });

        expect(changed).toBe(false);
        expect(store.writeAdminsFile).not.toHaveBeenCalled();
        expect(store.refreshOnlineAdmins).not.toHaveBeenCalled();
    });
});