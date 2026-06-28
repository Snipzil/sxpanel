import { describe, it, expect } from 'vitest';
import { resolveDeferralElementContent, BAN_STUDIO_PREVIEW_SNIPPETS } from './deferralCardBan';
import { renderDeferralCardPreview, applyDeferralTokensPreview } from './deferralCardRender';
import { DEFAULT_DEFERRAL_CARDS_CONFIG } from './deferralCardTypes';
import { templateWithCanvas } from './deferralCardCanvas';
import { getDefaultDeferralCardLayout } from './deferralCardDefaultLayouts';

describe('deferralCardBan', () => {
    it('replaces studio preview copy with live ban tokens', () => {
        const out = resolveDeferralElementContent(BAN_STUDIO_PREVIEW_SNIPPETS.expiresLine, {
            banExpires: 'in 1 hour',
        });
        expect(out).toBe('<strong>Your ban will expire in:</strong> in 1 hour <br>');
        expect(out).not.toContain('2 days');
    });

    it('renders divider as div border (not hr)', () => {
        const base = DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios.ban_temporary;
        const template = templateWithCanvas(base, {
            width: 520,
            height: 120,
            elements: [{ id: 'd1', type: 'divider', x: 0, y: 40, enabled: true, width: 480, height: 12 }],
        });
        const config = {
            ...DEFAULT_DEFERRAL_CARDS_CONFIG,
            scenarios: { ...DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios, ban_temporary: template },
        };
        const html = renderDeferralCardPreview(config, { scenario: 'ban_temporary' });
        expect(html).toContain('border-top:1px solid rgba(255,255,255,0.14)');
        expect(html).not.toContain('<hr');
    });

    it('shows ban ID on request_id canvas element when requestId is absent', () => {
        const base = DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios.ban_temporary;
        const template = templateWithCanvas(base, {
            width: 520,
            height: 160,
            elements: [{ id: 'rid', type: 'request_id', x: 0, y: 0, enabled: true }],
        });
        const config = {
            ...DEFAULT_DEFERRAL_CARDS_CONFIG,
            scenarios: { ...DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios, ban_temporary: template },
        };
        const html = renderDeferralCardPreview(config, {
            scenario: 'ban_temporary',
            banId: 'BAN-42',
        });
        expect(html).toContain('Ban ID');
        expect(html).toContain('BAN-42');
        expect(html).toContain('letter-spacing: 2px');
        expect(html).not.toContain('<codeid>');
    });

    it('renders ban_reason and ban_expires preset blocks', () => {
        const base = DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios.ban_temporary;
        const template = templateWithCanvas(base, {
            width: 520,
            height: 180,
            elements: [
                { id: 'exp', type: 'ban_expires', x: 0, y: 0, enabled: true, style: { fontSize: 16 } },
                { id: 'rsn', type: 'ban_reason', x: 0, y: 32, width: 480, enabled: true, style: { fontSize: 16 } },
            ],
        });
        const config = {
            ...DEFAULT_DEFERRAL_CARDS_CONFIG,
            scenarios: { ...DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios, ban_temporary: template },
        };
        const html = renderDeferralCardPreview(config, {
            scenario: 'ban_temporary',
            banReason: 'Speed hacking',
            banExpires: 'in 3 days',
        });
        expect(html).toContain('Speed hacking');
        expect(html).toContain('in 3 days');
        expect(html).toContain('<strong>Reason:</strong>');
        expect(html).toContain('<strong>Expires:</strong>');
    });

    it('hides ban_expires when token is absent (permanent ban)', () => {
        const base = DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios.ban_permanent;
        const template = templateWithCanvas(base, {
            width: 520,
            height: 120,
            elements: [{ id: 'exp', type: 'ban_expires', x: 0, y: 0, enabled: true }],
        });
        const config = {
            ...DEFAULT_DEFERRAL_CARDS_CONFIG,
            scenarios: { ...DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios, ban_permanent: template },
        };
        const html = renderDeferralCardPreview(config, {
            scenario: 'ban_permanent',
            banReason: 'Permanent',
        });
        expect(html).not.toContain('<strong>Expires:</strong>');
    });

    it('renders canvas ban fields and GIF custom images via asset URL in preview', () => {
        const gif = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        const base = DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios.ban_temporary;
        const template = templateWithCanvas(base, {
            width: 520,
            height: 220,
            elements: [
                {
                    id: 'img1',
                    type: 'custom_image',
                    content: gif,
                    x: 0,
                    y: 0,
                    enabled: true,
                    width: 48,
                    height: 48,
                },
                {
                    id: 't1',
                    type: 'text',
                    content: '<strong>Reason:</strong> Example ban',
                    x: 0,
                    y: 56,
                    enabled: true,
                },
                { id: 'bid', type: 'ban_id', x: 0, y: 88, enabled: true },
            ],
        });
        const config = {
            ...DEFAULT_DEFERRAL_CARDS_CONFIG,
            scenarios: { ...DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios, ban_temporary: template },
        };
        const html = renderDeferralCardPreview(
            config,
            {
                scenario: 'ban_temporary',
                title: 'Banned',
                banReason: 'Cheating',
                banId: 'BAN-99',
                assetBaseUrl: 'https://panel.example.com',
            },
            'https://panel.example.com/logo.svg',
        );
        expect(html).toContain('Cheating');
        expect(html).not.toContain('Example ban');
        expect(html).toContain('BAN-99');
        expect(html).toContain('letter-spacing: 2px');
        expect(html).toContain('https://panel.example.com/deferral-card-assets/ban_temporary/img1.gif');
        expect(html).not.toContain('data:image/gif;base64,');
        expect(html).not.toMatch(/<div style="[^"]*position:absolute[^"]*"><img style="[^"]*position:absolute/);
    });

    it('expands card height and wraps long ban reason text', () => {
        const base = DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios.ban_temporary;
        const template = templateWithCanvas(base, {
            width: 640,
            height: 220,
            elements: [
                { id: 'h', type: 'heading', content: 'Banned', x: 0, y: 0, enabled: true },
                {
                    id: 'reason',
                    type: 'text',
                    content: '<strong>Reason:</strong> Example ban',
                    x: 0,
                    y: 36,
                    enabled: true,
                },
            ],
        });
        const config = {
            ...DEFAULT_DEFERRAL_CARDS_CONFIG,
            scenarios: { ...DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios, ban_temporary: template },
        };
        const longReason = `${'Cheating '.repeat(80)}`.trim();
        const html = renderDeferralCardPreview(config, {
            scenario: 'ban_temporary',
            banReason: longReason,
        });
        expect(html).toContain('pre-wrap');
        expect(html).toContain('min-height:180px');
        expect(html).toContain(longReason.slice(0, 20));
    });

    it('builds connection queue adaptive card JSON', async () => {
        const { buildConnectionQueueAdaptiveCard } = await import('./deferralCardAdaptive');
        const template = {
            ...DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios.connection_queue,
            layout: getDefaultDeferralCardLayout('connection_queue'),
        };
        const json = buildConnectionQueueAdaptiveCard(
            template,
            {
                serverName: 'TestServer',
                playerName: 'snipz',
                queuePosition: '3',
                queueSize: '12',
                queueEta: '00:11',
                customMessage: 'You are in queue.',
                body: 'You are in queue.',
            },
            applyDeferralTokensPreview,
        );
        const card = JSON.parse(json) as {
            type: string;
            body: { text?: string; columns?: { items?: { text?: string }[] }[] }[];
        };
        expect(card.type).toBe('AdaptiveCard');
        const text = JSON.stringify(card.body);
        expect(text).toContain('Connection Queue');
        expect(text).toContain('You are in queue.');
    });
});
