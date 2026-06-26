import { expect, it, suite } from 'vitest';
import { buildDiscordCardMessageFromEmbed, discordMessageFlagIsComponentsV2 } from './componentsV2';
import { buildDiscordEmbedPreview } from './buildPreview';

suite('buildDiscordEmbedPreview', () => {
    it('builds a status card preview payload', () => {
        const result = buildDiscordEmbedPreview({
            variant: 'status',
            embedJson: JSON.stringify({
                title: '{{serverName}}',
                description: '{{configurableEmbedDescription}}',
                color: '{{statusColor}}',
                fields: [
                    {
                        name: '{{statusFieldLabel}}',
                        value: '```\n{{statusString}}\n```',
                        inline: true,
                    },
                ],
            }),
            embedConfigJson: JSON.stringify({
                onlineColor: '#0BA70B',
                onlineString: 'Online',
                buttons: [
                    {
                        label: 'Connect',
                        url: '{{serverJoinUrl}}',
                    },
                ],
            }),
            health: 'online',
        });

        expect(result.error).toBeUndefined();
        expect(result.payload?.flags).toBe(discordMessageFlagIsComponentsV2);
        expect(result.payload?.components?.[0]).toMatchObject({ type: 17 });

        const container = result.payload?.components?.[0] as { components?: { content?: string }[] };
        const text = (container.components ?? []).map((c) => String(c.content ?? '')).join('\n');
        expect(text).not.toMatch(/\{\{/);
        expect(text).toContain('Los Santos Preview RP');
        expect(text).toContain('Online');
    });

    it('expands player list columns in preview', () => {
        const result = buildDiscordEmbedPreview({
            variant: 'playerList',
            embedJson: JSON.stringify({
                title: 'Players',
                description: '{{playerListSummary}}',
                fields: [{ name: 'List', value: '{{playerListColumns}}' }],
            }),
            embedConfigJson: JSON.stringify({
                playerLineTemplate: '{{displayName}}',
                playerInlineTemplate: '{{displayName}}',
                playerColumnTemplate: '{{displayName}}',
                playerColumnCount: 3,
                playersPerColumn: 4,
                showPagerButtons: true,
                buttons: [],
            }),
            playerListPage: 1,
        });

        expect(result.error).toBeUndefined();
        const container = result.payload?.components?.[0] as { components?: { content?: string }[] };
        const textContents = (container.components ?? [])
            .filter((c) => c && 'content' in c)
            .map((c) => String(c.content));
        expect(textContents.some((c) => c.includes('Preview Player 1'))).toBe(true);
    });

    it('renders footer icon without markdown image syntax', () => {
        const payload = buildDiscordCardMessageFromEmbed({
            description: 'Test',
            footer: {
                icon_url: 'https://cdn.discordapp.com/emojis/1062339910654246964.webp?size=96&quality=lossless',
                text: 'fxPanel 0.4.0-Beta',
            },
        });

        const serialized = JSON.stringify(payload);
        expect(serialized).not.toContain('![](');
        expect(serialized).toContain('fxPanel 0.4.0-Beta');
        expect(serialized).toContain('1062339910654246964.webp');
    });

    it('uses a sample join URL when a button placeholder cannot resolve', () => {
        const result = buildDiscordEmbedPreview({
            variant: 'status',
            embedJson: JSON.stringify({ title: 'Test' }),
            embedConfigJson: JSON.stringify({
                onlineColor: '#0BA70B',
                buttons: [{ label: 'Bad', url: '{{unresolved}}' }],
            }),
        });

        expect(result.error).toBeUndefined();
        const row = result.payload?.components?.[0] as {
            components?: { type?: number; components?: { url?: string }[] }[];
        };
        const buttonUrl = row.components?.find((c) => c.type === 1)?.components?.[0]?.url;
        expect(buttonUrl).toBe('https://cfx.re/join/previewcfx123');
    });
});
