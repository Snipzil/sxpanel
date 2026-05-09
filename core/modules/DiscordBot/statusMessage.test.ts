import { beforeEach, expect, it, suite, vi } from 'vitest';
import { FxMonitorHealth } from '@shared/enums';
import { discordMessageFlagIsComponentsV2 } from './componentsV2';

type GeneratePlayerListMessageType = typeof import('./statusMessage').generatePlayerListMessage;

const buildPlayers = (count: number) => {
    return Array.from({ length: count }, (_, index) => ({
        netid: index + 1,
        displayName: `Player ${index + 1}`,
        pureName: `Player ${index + 1}`,
        license: `license:${index + 1}`,
        playTimeMinutes: index + 5,
        sessionTimeSeconds: (index + 1) * 60,
        tags: [],
    }));
};

suite('generatePlayerListMessage', () => {
    let generatePlayerListMessage: GeneratePlayerListMessageType;

    beforeEach(async () => {
        vi.resetModules();
        vi.stubGlobal('txConfig', {
            general: {
                serverName: 'Example Server',
            },
            discordBot: {
                embedJson: '{}',
                embedConfigJson: '{}',
                playerListEmbedJson: '{}',
                playerListEmbedConfigJson: '{}',
            },
        });
        vi.stubGlobal('txCore', {
            cacheStore: {
                get: vi.fn((key: string) => {
                    if (key === 'fxsRuntime:cfxId') return 'abc123';
                    if (key === 'fxsRuntime:maxClients') return 128;
                    return undefined;
                }),
            },
            fxMonitor: {
                status: {
                    uptime: 3_600_000,
                    health: FxMonitorHealth.ONLINE,
                },
            },
            fxPlayerlist: {
                onlineCount: 65,
                joinLeaveTally: {
                    joined: 4,
                    left: 2,
                },
                getPlayerList: vi.fn(() => buildPlayers(65)),
            },
            fxRunner: {
                child: {
                    netEndpoint: '127.0.0.1:30120',
                },
            },
            fxScheduler: {
                getStatus: vi.fn(() => ({
                    nextRelativeMs: null,
                    nextSkip: false,
                    nextIsTemp: false,
                })),
            },
        });

        ({ generatePlayerListMessage } = await import('./statusMessage'));
    });

    it('renders page-aware player columns with pager buttons', () => {
        const payload = generatePlayerListMessage(
            JSON.stringify({
                title: 'Players',
                description: '{{playerListSummary}}\n{{playerListPageSummary}}',
                fields: [
                    {
                        name: '> PLAYER LIST',
                        value: '{{playerList}}',
                    },
                ],
            }),
            JSON.stringify({
                onlineString: 'Online',
                onlineColor: '#0BA70B',
                partialString: 'Partial',
                partialColor: '#FFF100',
                offlineString: 'Offline',
                offlineColor: '#A70B28',
                emptyPlayerListString: 'No players online.',
                playerLineTemplate: '{{displayName}}',
                playerInlineTemplate: '{{displayName}}',
                playerColumnTemplate: '{{displayName}}',
                playerColumnCount: 3,
                playersPerColumn: 10,
                showPagerButtons: true,
                pagerPageLabelTemplate: 'Page {{playerListPage}}/{{playerListTotalPages}}',
                buttons: [],
            }),
            { page: 2 },
        );

        const container = payload.components?.[0] as Record<string, unknown>;
        const containerComponents = container.components as {
            type: number;
            content?: string;
            components?: Record<string, unknown>[];
        }[];
        const textContents = containerComponents
            .filter((component) => component.type === 10)
            .map((component) => String(component.content));
        const actionRow = containerComponents.find((component) => component.type === 1) as {
            components: Record<string, unknown>[];
        };

        expect(payload.flags).toBe(discordMessageFlagIsComponentsV2);
        expect(payload.embeds).toBeUndefined();
        expect(container.type).toBe(17);
        expect(containerComponents[0]?.type).toBe(10);
        expect(textContents.some((content) => content.includes('## Players'))).toBe(true);
        expect(textContents.some((content) => content.includes('65 players online'))).toBe(true);
        expect(textContents.some((content) => content.includes('Page 2/3'))).toBe(true);
        expect(textContents.some((content) => content.includes('Player 31'))).toBe(true);
        expect(textContents.some((content) => content.includes('Player 40'))).toBe(true);
        expect(textContents.some((content) => content.includes('Player 41'))).toBe(true);
        expect(textContents.some((content) => content.includes('Player 50'))).toBe(true);
        expect(textContents.some((content) => content.includes('Player 51'))).toBe(true);
        expect(textContents.some((content) => content.includes('Player 60'))).toBe(true);

        expect(actionRow.components).toEqual([
            expect.objectContaining({
                custom_id: 'fxpanel:playerList:page:1',
                disabled: false,
                label: 'Prev',
            }),
            expect.objectContaining({
                disabled: true,
                label: 'Page 2/3',
            }),
            expect.objectContaining({
                custom_id: 'fxpanel:playerList:page:3',
                disabled: false,
                label: 'Next',
            }),
        ]);
    });

    it('does not render unsupported markdown links in the player-list card header', () => {
        const payload = generatePlayerListMessage(
            JSON.stringify({
                title: 'Players',
                url: '{{serverBrowserUrl}}',
                description: '{{playerListSummary}}',
                thumbnail: {
                    url: 'https://example.com/thumb.png',
                },
                fields: [
                    {
                        name: 'PLAYER LIST',
                        value: '{{playerListColumns}}',
                    },
                ],
            }),
            JSON.stringify({
                onlineString: 'Online',
                onlineColor: '#0BA70B',
                partialString: 'Partial',
                partialColor: '#FFF100',
                offlineString: 'Offline',
                offlineColor: '#A70B28',
                emptyPlayerListString: 'No players online.',
                playerLineTemplate: '{{displayName}}',
                playerInlineTemplate: '{{displayName}}',
                playerColumnTemplate: '{{displayName}}',
                playerColumnCount: 3,
                playersPerColumn: 10,
                buttons: [
                    {
                        label: 'Server Page',
                        url: '{{serverBrowserUrl}}',
                    },
                ],
            }),
            { page: 1 },
        );

        const container = payload.components?.[0] as Record<string, unknown>;
        const containerComponents = container.components as {
            type: number;
            content?: string;
            components?: Array<{
                type: number;
                content?: string;
            }>;
        }[];
        const textContents = containerComponents.flatMap((component) => {
            if (component.type === 10) {
                return [String(component.content)];
            }

            if (component.type === 9 && Array.isArray(component.components)) {
                return component.components
                    .filter((childComponent) => childComponent.type === 10)
                    .map((childComponent) => String(childComponent.content));
            }

            return [];
        });

        expect(textContents.some((content) => content.includes('## Players'))).toBe(true);
        expect(textContents.some((content) => content.includes('[Players]('))).toBe(false);
        expect(textContents.some((content) => content.includes('servers.fivem.net/servers/detail/'))).toBe(false);
    });
});