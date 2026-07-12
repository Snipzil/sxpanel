import { describe, it, expect } from 'vitest';
import { renderDeferralCardPreview } from './deferralCardRender';
import { DEFAULT_DEFERRAL_CARDS_CONFIG } from './deferralCardTypes';
import {
    applyCanvasCenterSnap,
    defaultCanvasForScenario,
    ensureUniqueCanvasElementIds,
    finalizeCanvasElementsForSave,
    loadStudioCanvasElements,
    resolveDeferralLogoPlacement,
    sanitizeDeferralCardTemplate,
    splitMultilineElements,
    templateWithCanvas,
} from './deferralCardCanvas';

const withScenario = (
    scenarioId: string,
    template: (typeof DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios)[keyof typeof DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios],
) => ({
    ...DEFAULT_DEFERRAL_CARDS_CONFIG,
    scenarios: {
        ...DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios,
        [scenarioId]: template,
    },
});

describe('deferralCardCanvas', () => {
    it('renders canvas-positioned HTML at default wide 640×220', () => {
        const canvas = defaultCanvasForScenario('whitelist_pending');
        const template = templateWithCanvas(DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios.whitelist_pending, canvas);
        const config = {
            ...DEFAULT_DEFERRAL_CARDS_CONFIG,
            scenarios: {
                ...DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios,
                whitelist_pending: template,
            },
        };
        const html = renderDeferralCardPreview(config, {
            scenario: 'whitelist_pending',
            body: '',
            requestId: 'R777',
        });
        expect(html).toContain('#80282B');
        expect(html).toContain('min-height:');
        expect(html).toContain('position:absolute');
        expect(html).toContain('R777');
        expect(html).toContain('You are not whitelisted');
    });

    it('splits multiline body into separate text elements', () => {
        const body = '<strong>Expires:</strong> in 2 days<br><strong>Reason:</strong> Example ban';
        const elements = loadStudioCanvasElements(
            DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios.ban_temporary,
            'ban_temporary',
            body,
        );
        const textLines = elements.filter((e) => e.type === 'text');
        expect(textLines.length).toBeGreaterThanOrEqual(2);
        expect(
            splitMultilineElements([{ id: 'a', type: 'paragraph', content: body, x: 0, y: 0, enabled: true }]),
        ).toHaveLength(2);
    });

    it('expands card height for long rejection message element', () => {
        const base = DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios.whitelist_admin_denied;
        const template = templateWithCanvas(base, {
            width: 640,
            height: 220,
            elements: [
                { id: 'h', type: 'heading', content: 'Rejected', x: 0, y: 0, enabled: true },
                { id: 'rej', type: 'rejection_message', x: 0, y: 40, enabled: true },
            ],
        });
        const config = {
            ...DEFAULT_DEFERRAL_CARDS_CONFIG,
            scenarios: {
                ...DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios,
                whitelist_admin_denied: template,
            },
        };
        const longBody = `${'Your application was denied because '.repeat(30)}`.trim();
        const html = renderDeferralCardPreview(config, {
            scenario: 'whitelist_admin_denied',
            body: longBody,
        });
        expect(html).toContain('pre-wrap');
        expect(html).toContain('min-height:');
        expect(html).toContain(longBody.slice(0, 40));
    });

    it('snaps element center to canvas center axes within threshold', () => {
        const canvasW = 600;
        const canvasH = 180;
        const elW = 120;
        const elH = 40;
        const centeredX = Math.round(canvasW / 2 - elW / 2);
        const centeredY = Math.round(canvasH / 2 - elH / 2);

        const near = applyCanvasCenterSnap(centeredX + 5, centeredY - 3, elW, elH, canvasW, canvasH);
        expect(near).toEqual({
            x: centeredX,
            y: centeredY,
            showVerticalGuide: true,
            showHorizontalGuide: true,
        });

        const far = applyCanvasCenterSnap(centeredX + 20, centeredY, elW, elH, canvasW, canvasH);
        expect(far).toEqual({
            x: centeredX + 20,
            y: centeredY,
            showVerticalGuide: false,
            showHorizontalGuide: true,
        });
    });

    it('resolves legacy x:0 logo rows to explicit bottom-right placement', () => {
        const placed = resolveDeferralLogoPlacement({ x: 0, y: 160, width: 180, height: 48 }, 600, 180);
        expect(placed).toEqual({ x: 405, y: 117, width: 180, height: 48 });
    });

    it('assigns unique ids when legacy layouts contain duplicates', () => {
        const duped = ensureUniqueCanvasElementIds([
            { id: 'banT:status:f0l', type: 'custom_text', x: 0, y: 48, content: 'Status', enabled: true },
            { id: 'banT:status:f0l', type: 'custom_text', x: 0, y: 66, content: 'Permanent', enabled: true },
        ]);
        expect(duped[0].id).toBe('banT:status:f0l');
        expect(duped[1].id).toBe('banT:status:f0l_2');
    });

    it('renders a ban_temporary card with player-facing ban reason, expiry, and id', () => {
        const canvas = defaultCanvasForScenario('ban_temporary');
        const template = templateWithCanvas(DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios.ban_temporary, canvas);
        const config = withScenario('ban_temporary', template);
        const html = renderDeferralCardPreview(config, {
            scenario: 'ban_temporary',
            body: '',
            banReason: 'Repeated cheating',
            banExpires: 'in 7 days',
            banId: 'B9999',
        });
        expect(html).toContain('<strong>Ban Reason:</strong>');
        expect(html).toContain('Repeated cheating');
        expect(html).toContain('<strong>Your ban will expire in:</strong>');
        expect(html).toContain('in 7 days');
        expect(html).toContain('<strong>Ban ID:</strong>');
        expect(html).toContain('B9999');
    });

    it('renders a ban_permanent card with player-facing ban details', () => {
        const canvas = defaultCanvasForScenario('ban_permanent');
        const template = templateWithCanvas(DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios.ban_permanent, canvas);
        const html = renderDeferralCardPreview(withScenario('ban_permanent', template), {
            scenario: 'ban_permanent',
            body: '',
            banReason: 'Terms of Service violation',
            banId: 'B4242',
        });
        expect(html).toContain('<strong>Ban Reason:</strong>');
        expect(html).toContain('Terms of Service violation');
        expect(html).toContain('<strong>Ban ID:</strong>');
        expect(html).toContain('B4242');
    });

    it('round-trips heading and body into player-facing rendered HTML', () => {
        const base = DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios.whitelist_pending;
        const template = templateWithCanvas(base, {
            width: 640,
            height: 220,
            elements: [
                { id: 'h', type: 'heading', content: 'Welcome Player', x: 0, y: 0, enabled: true },
                { id: 't', type: 'text', content: 'Please wait to be verified', x: 0, y: 40, enabled: true },
            ],
        });
        expect(template.title).toBe('Welcome Player');
        expect(template.bodyTemplate).toContain('Please wait to be verified');
        const html = renderDeferralCardPreview(withScenario('whitelist_pending', template), {
            scenario: 'whitelist_pending',
            body: '',
        });
        expect(html).toContain('Welcome Player');
        expect(html).toContain('Please wait to be verified');
    });

    it('drops invalid block and canvas element types so the rendered card stays valid', () => {
        const out = sanitizeDeferralCardTemplate({
            id: 'x',
            title: 'T',
            bodyTemplate: 'B',
            layout: {
                version: 2,
                blocks: [
                    { id: 'b1', type: 'not_real', content: 'x', enabled: true },
                    { id: 'b2', type: 'heading', content: 'OK', enabled: true },
                ],
                canvas: {
                    width: 640,
                    height: 220,
                    elements: [
                        { id: 'c1', type: 'bogus', x: 0, y: 0, enabled: true },
                        { id: 'c2', type: 'heading', content: 'Hi', x: 0, y: 0, enabled: true },
                    ],
                },
            },
        } as never);
        expect(out.layout?.blocks.map((b) => b.type)).toEqual(['heading']);
        expect(out.layout?.canvas?.elements.map((e) => e.type)).toEqual(['heading']);
    });

    it('finalizes button content before saving so the player-facing label is consistent', () => {
        const finalized = finalizeCanvasElementsForSave([
            {
                id: 'b',
                type: 'button',
                content: '{"label":"Join","url":"{discordInvite}","backgroundColor":"not-a-color","textColor":"#fff"}',
                x: 0,
                y: 0,
                enabled: true,
            },
        ]);
        const parsed = JSON.parse(finalized[0].content!);
        expect(parsed.label).toBe('Join');
        expect(parsed.backgroundColor).toBe('#5865F2');
        expect(parsed.textColor).toBe('#fff');
    });
});
