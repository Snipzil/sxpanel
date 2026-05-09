import { beforeEach, expect, it, suite, vi } from 'vitest';
import AdminManagerList from './list';

suite('AdminManagerList', () => {
    beforeEach(() => {
        vi.stubGlobal('txCore', {
            fxPlayerlist: {
                getPlayerList: () => [],
            },
            adminStore: {
                getRawAdminsList: () => [
                    {
                        name: 'DiscordAdmin',
                        master: false,
                        providers: {
                            discord: {
                                id: '123456789012345678',
                                identifier: 'discord:123456789012345678',
                            },
                        },
                        permissions: ['players.warn'],
                    },
                    {
                        name: 'OtherAdmin',
                        master: false,
                        providers: {},
                        permissions: ['console.view'],
                    },
                ],
            },
        });
    });

    it('returns live effective permissions for the current admin without changing stored permissions', async () => {
        const send = vi.fn();
        const ctx = {
            admin: {
                name: 'DiscordAdmin',
                permissions: ['players.warn', 'players.kick', 'menu.viewids'],
                testPermission: vi.fn(() => true),
            },
            send,
        } as any;

        await AdminManagerList(ctx);

        expect(send).toHaveBeenCalledOnce();

        const response = send.mock.calls[0][0];
        expect(response.admins).toEqual([
            {
                name: 'DiscordAdmin',
                isMaster: false,
                hasCitizenFx: false,
                citizenfxId: '',
                hasDiscord: true,
                discordId: '123456789012345678',
                permissions: ['players.warn'],
                effectivePermissions: ['players.warn', 'players.kick', 'menu.viewids'],
                isYou: true,
                isOnline: false,
            },
            {
                name: 'OtherAdmin',
                isMaster: false,
                hasCitizenFx: false,
                citizenfxId: '',
                hasDiscord: false,
                discordId: '',
                permissions: ['console.view'],
                isYou: false,
                isOnline: false,
            },
        ]);
    });
});