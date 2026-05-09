import { beforeEach, suite, it, expect, vi } from 'vitest';
import SaveSettingsConfigs from './saveConfigs';
import { createMockCtx } from '../../testing/routeTestUtils';

vi.mock('@core/globalData', () => ({
    txEnv: {
        isWindows: true,
    },
}));

suite('settings/saveConfigs', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        vi.stubGlobal('txConfig', {
            discordBot: {
                enabled: true,
                token: 'discord-bot-token',
                guild: '123456789012345678',
                warningsChannel: null,
                logGuildOverride: null,
                embedJson: '{"embeds":[]}',
                embedConfigJson: '{}',
                playerListEmbedJson: '{"embeds":[]}',
                playerListEmbedConfigJson: '{}',
            },
        });

        vi.stubGlobal('txCore', {
            configStore: {
                saveConfigs: vi.fn(() => ({
                    hasMatch: vi.fn(() => false),
                })),
                getStoredConfig: vi.fn(() => ({})),
                getChangelog: vi.fn(() => []),
            },
            discordBot: {
                attemptBotReset: vi.fn(async () => 'Discord bot restarted.'),
            },
            webServer: {
                webSocket: {
                    pushRefresh: vi.fn(),
                },
            },
        });
    });

    it('should preserve the current bot state when saving discord log routes', async () => {
        const warningsChannel = '987654321098765432';
        const { ctx, sentData } = createMockCtx({
            permissions: ['settings.write'],
            params: { card: 'discord-bot' },
            body: {
                resetKeys: [],
                changes: {
                    discordBot: {
                        logRoutes: [
                            {
                                key: 'system.action',
                                enabled: true,
                                channelId: '999999999999999999',
                                useEntryFilter: false,
                                entryFilter: [],
                            },
                        ],
                        warningsChannel,
                        logGuildOverride: null,
                    },
                },
            },
        });

        await SaveSettingsConfigs(ctx);

        expect((globalThis as any).txCore.discordBot.attemptBotReset).toHaveBeenCalledWith({
            enabled: true,
            token: 'discord-bot-token',
            guild: '123456789012345678',
            warningsChannel,
        });
        expect((globalThis as any).txCore.configStore.saveConfigs).toHaveBeenCalledWith(
            {
                discordBot: {
                    logRoutes: [
                        {
                            key: 'system.action',
                            enabled: true,
                            channelId: '999999999999999999',
                            useEntryFilter: false,
                            entryFilter: [],
                        },
                    ],
                    warningsChannel,
                    logGuildOverride: null,
                },
            },
            'testadmin',
        );
        expect(sentData[0]).toMatchObject({
            type: 'success',
            title: 'FXServer Settings Saved!',
        });
    });
});