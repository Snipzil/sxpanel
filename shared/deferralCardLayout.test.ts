import { describe, it, expect } from 'vitest';
import { applyDeferralTokensPreview, renderDeferralCardPreview } from './deferralCardRender';
import { DEFAULT_DEFERRAL_CARDS_CONFIG, resolveDeferralDiscordInvite } from './deferralCardTypes';
import { templateWithCanvas } from './deferralCardCanvas';

describe('deferralCardLayout', () => {
    it('applies built-in discordInvite in preview', () => {
        const out = applyDeferralTokensPreview('Join {discordInvite}', { discordInvite: 'https://discord.gg/x' }, []);
        expect(out).toContain('discord.gg/x');
    });

    it('resolveDeferralDiscordInvite prefers config field over legacy custom placeholder', () => {
        expect(
            resolveDeferralDiscordInvite({
                discordInvite: 'https://discord.gg/from-field',
                sharedCustomPlaceholders: [{ key: 'discordInvite', label: 'x', value: 'https://discord.gg/legacy' }],
            }),
        ).toBe('https://discord.gg/from-field');
        expect(
            resolveDeferralDiscordInvite({
                discordInvite: '',
                sharedCustomPlaceholders: [{ key: 'discordInvite', label: 'x', value: 'https://discord.gg/legacy' }],
            }),
        ).toBe('https://discord.gg/legacy');
    });

    it('renders visual layout blocks', () => {
        const html = renderDeferralCardPreview(DEFAULT_DEFERRAL_CARDS_CONFIG, {
            scenario: 'whitelist_pending',
            body: '',
            requestId: 'R42',
        });
        expect(html).toContain('R42');
        expect(html).toContain('You are not whitelisted to join this server.');
    });

    it('canvas HTML uses nowrap and max-content for labels (FiveM word-break fix)', () => {
        const base = DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios.ban_temporary;
        const template = templateWithCanvas(base, {
            width: 640,
            height: 220,
            elements: [
                { id: 'h1', type: 'heading', content: 'Banned', x: 0, y: 0, enabled: true, width: 72, height: 32 },
                {
                    id: 't1',
                    type: 'text',
                    content: '<strong>Expires:</strong> in 2 days',
                    x: 0,
                    y: 40,
                    enabled: true,
                    width: 64,
                    height: 24,
                },
            ],
        });
        const config = {
            ...DEFAULT_DEFERRAL_CARDS_CONFIG,
            scenarios: {
                ...DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios,
                ban_temporary: template,
            },
        };
        const html = renderDeferralCardPreview(config, {
            scenario: 'ban_temporary',
            title: 'Banned',
            body: '<strong>Reason:</strong> Example ban',
            banExpires: 'in 1 hour',
            banReason: 'Speed hack',
        });
        expect(html).toContain('Banned');
        expect(html).toContain('in 1 hour');
        expect(html).not.toContain('in 2 days');
        expect(html).toContain('white-space:nowrap');
        expect(html).toContain('width:max-content');
        expect(html).not.toContain('width:72px;height:32px');
    });
});
