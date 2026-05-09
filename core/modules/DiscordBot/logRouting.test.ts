import { suite, it, expect } from 'vitest';
import { discordMessageFlagIsComponentsV2 } from './componentsV2';
import {
    buildServerMenuDiscordPayload,
    buildSystemLogDiscordPayload,
} from './logRouting';
import { normalizeDiscordLogRoutes } from '@shared/discordLogRoutes';

suite('normalizeDiscordLogRoutes', () => {
    it('should drop invalid routes and normalize duplicated entries', () => {
        expect(
            normalizeDiscordLogRoutes([
                {
                    key: 'system.action',
                    enabled: true,
                    channelId: ' 123456789012345678 ',
                    useEntryFilter: false,
                    entryFilter: [],
                },
                {
                    key: 'system.action',
                    enabled: false,
                    channelId: '999',
                    useEntryFilter: false,
                    entryFilter: [],
                },
                {
                    key: 'invalid.route',
                    enabled: true,
                    channelId: '123456789012345678',
                    useEntryFilter: false,
                    entryFilter: [],
                },
            ]),
        ).toEqual([
            {
                key: 'system.action',
                enabled: true,
                channelId: '123456789012345678',
                useEntryFilter: false,
                entryFilter: [],
            },
        ]);
    });

    it('should normalize legacy command filters into generic entry filters', () => {
        expect(
            normalizeDiscordLogRoutes([
                {
                    key: 'server.menu',
                    enabled: true,
                    channelId: '123456789012345678',
                    useCommandFilter: true,
                    commandFilter: ['players.noclip', 'invalid.command', 'players.noclip'],
                },
            ]),
        ).toEqual([
            {
                key: 'server.menu',
                enabled: true,
                channelId: '123456789012345678',
                useEntryFilter: true,
                entryFilter: ['players.noclip'],
            },
        ]);
    });

    it('should expand legacy config save filters into per-key config entries', () => {
        const [route] = normalizeDiscordLogRoutes([
            {
                key: 'system.config',
                enabled: true,
                channelId: '123456789012345678',
                useEntryFilter: true,
                entryFilter: ['config.save', 'auth.2fa.disable'],
            },
        ]);

        expect(route).toEqual(
            expect.objectContaining({
                key: 'system.config',
                useEntryFilter: true,
                entryFilter: expect.arrayContaining([
                    'config.general.serverName',
                    'config.discordBot.enabled',
                    'config.logger.server',
                    'auth.2fa.disable',
                ]),
            }),
        );
        expect(route.entryFilter).not.toContain('config.save');
    });
});

suite('buildSystemLogDiscordPayload', () => {
    it('should build a Discord v2 card payload for enabled system log routes', () => {
        const payload = buildSystemLogDiscordPayload(
            [
                {
                    key: 'system.action',
                    enabled: true,
                    channelId: '123456789012345678',
                    useEntryFilter: false,
                    entryFilter: [],
                },
            ],
            {
                ts: 1_700_000_000_000,
                author: 'admin',
                category: 'action',
                actionId: 'player.warn',
                action: 'Enabled noclip from the panel.',
            },
        );

        if (!payload) {
            throw new Error('Expected a system log payload.');
        }

        const textContents = JSON.stringify(payload.components);

        expect(payload).toEqual({
            channelId: '123456789012345678',
            guildId: null,
            flags: discordMessageFlagIsComponentsV2,
            components: [
                expect.objectContaining({
                    type: 17,
                    components: expect.arrayContaining([
                        expect.objectContaining({ content: expect.stringContaining('Panel Action Logs') }),
                        expect.objectContaining({ content: expect.stringContaining('Enabled noclip from the panel.') }),
                    ]),
                }),
            ],
            allowedMentions: { parse: [] },
        });
        expect(textContents.match(/<t:1700000000:F>/g)?.length ?? 0).toBe(1);
    });
});

suite('buildServerMenuDiscordPayload', () => {
    it('should build a Discord v2 card payload with username, permission, location, and time fields', () => {
        const payload = buildServerMenuDiscordPayload(
            [
                {
                    key: 'server.menu',
                    enabled: true,
                    channelId: '123456789012345678',
                    useEntryFilter: true,
                    entryFilter: ['players.noclip'],
                },
            ],
            {
                type: 'MenuEvent',
                data: {
                    action: 'playerModeChanged',
                    commandId: 'players.noclip',
                    permissionId: 'players.noclip',
                    location: { x: 1.25, y: 2.5, z: 3.75 },
                    message: 'enabled noclip',
                },
            },
            {
                ts: 1_700_000_000_000,
                src: { id: '12', name: 'AdminUser' },
                msg: 'enabled noclip',
            },
        );

        if (!payload) {
            throw new Error('Expected a server menu log payload.');
        }

        const textContents = JSON.stringify(payload.components);

        expect(payload).toEqual({
            channelId: '123456789012345678',
            guildId: null,
            flags: discordMessageFlagIsComponentsV2,
            components: [
                expect.objectContaining({
                    type: 17,
                    components: expect.arrayContaining([
                        expect.objectContaining({ content: expect.stringContaining('Admin Command Logs') }),
                        expect.objectContaining({ content: expect.stringContaining('enabled noclip') }),
                        expect.objectContaining({ content: expect.stringContaining('Username') }),
                        expect.objectContaining({ content: expect.stringContaining('AdminUser') }),
                        expect.objectContaining({ content: expect.stringContaining('NoClip') }),
                        expect.objectContaining({ content: expect.stringContaining('X: 1.25, Y: 2.50, Z: 3.75') }),
                    ]),
                }),
            ],
            allowedMentions: { parse: [] },
        });
        expect(textContents.match(/<t:1700000000:F>/g)?.length ?? 0).toBe(1);
    });

    it('should skip menu logs that are not selected in the advanced command filter', () => {
        expect(
            buildServerMenuDiscordPayload(
                [
                    {
                        key: 'server.menu',
                        enabled: true,
                        channelId: '123456789012345678',
                        useEntryFilter: true,
                        entryFilter: ['players.godmode'],
                    },
                ],
                {
                    type: 'MenuEvent',
                    data: {
                        action: 'playerModeChanged',
                        commandId: 'players.noclip',
                        message: 'enabled noclip',
                    },
                },
                {
                    ts: 1_700_000_000_000,
                    src: { id: '12', name: 'AdminUser' },
                    msg: 'enabled noclip',
                },
            ),
        ).toBe(false);
    });

    it('should skip system logs that are not selected in the advanced entry filter', () => {
        expect(
            buildSystemLogDiscordPayload(
                [
                    {
                        key: 'system.action',
                        enabled: true,
                        channelId: '123456789012345678',
                        useEntryFilter: true,
                        entryFilter: ['ticket.create'],
                    },
                ],
                {
                    ts: 1_700_000_000_000,
                    author: 'admin',
                    category: 'action',
                    actionId: 'player.warn',
                    action: 'Warned a player.',
                },
            ),
        ).toBe(false);
    });
});