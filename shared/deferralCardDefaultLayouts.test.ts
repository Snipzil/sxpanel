import { describe, it, expect } from 'vitest';
import {
    DEFERRAL_DEFAULT_CARD_LAYOUTS,
    isLegacyBlandDeferralTemplate,
    shouldResetToClassicDeferralTemplate,
    TXADMIN_DEFERRAL_TEMPLATE_FIELDS,
} from './deferralCardDefaultLayouts';
import {
    DEFAULT_DEFERRAL_CARDS_CONFIG,
    DEFAULT_DEFERRAL_CARD_TEMPLATES,
    DEFERRAL_SCENARIO_META,
    normalizeDeferralCardsConfig,
} from './deferralCardTypes';
import { buildDeferralCardHtml } from './deferralCardRender';
import { DEFERRAL_CARD_LOGO_PATH } from './deferralCardLogo';

describe('deferralCardDefaultLayouts', () => {
    it('ships txAdmin-style canvas layouts on all built-in defaults', () => {
        for (const { id } of DEFERRAL_SCENARIO_META) {
            const template = DEFAULT_DEFERRAL_CARD_TEMPLATES[id];
            expect(template.layout?.canvas?.elements?.length ?? 0).toBeGreaterThan(2);
            expect(template.title).toBe(TXADMIN_DEFERRAL_TEMPLATE_FIELDS[id].title);
        }
    });

    it('exposes txAdmin classic layouts without fancy status pills', () => {
        for (const { id } of DEFERRAL_SCENARIO_META) {
            const canvas = DEFERRAL_DEFAULT_CARD_LAYOUTS[id].canvas;
            const serialized = JSON.stringify(canvas?.elements ?? []);
            expect(serialized).not.toContain('border-radius:999px');
            expect(serialized).not.toMatch(/:badge$/);
        }
    });

    it('upgrades untouched bland legacy defaults on normalize', () => {
        const bland = {
            skin: { showLogo: true },
            sharedCustomPlaceholders: [],
            scenarios: {
                whitelist_pending: {
                    title: 'Not Whitelisted',
                    bodyTemplate: 'Please join {guildName} and request to be whitelisted.',
                    showRequestId: true,
                    showTierName: false,
                    customPlaceholders: [],
                },
            },
        };
        expect(shouldResetToClassicDeferralTemplate('whitelist_pending', bland.scenarios.whitelist_pending)).toBe(
            true,
        );
        const normalized = normalizeDeferralCardsConfig(bland);
        expect(normalized.scenarios.whitelist_pending.layout?.canvas?.elements?.length ?? 0).toBeGreaterThan(2);
        expect(normalized.scenarios.whitelist_pending.title).toBe(
            TXADMIN_DEFERRAL_TEMPLATE_FIELDS.whitelist_pending.title,
        );
    });

    it('preserves customized templates on normalize', () => {
        const custom = normalizeDeferralCardsConfig({
            ...DEFAULT_DEFERRAL_CARDS_CONFIG,
            scenarios: {
                ...DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios,
                whitelist_pending: {
                    title: 'Custom Title',
                    bodyTemplate: 'Custom body copy.',
                    showRequestId: false,
                    showTierName: true,
                    customPlaceholders: [],
                },
            },
        });
        expect(custom.scenarios.whitelist_pending.title).toBe('Custom Title');
        expect(custom.scenarios.whitelist_pending.bodyTemplate).toBe('Custom body copy.');
        expect(shouldResetToClassicDeferralTemplate('whitelist_pending', custom.scenarios.whitelist_pending)).toBe(
            false,
        );
    });

    it('renders txAdmin shell markup with fxPanel watermark', () => {
        const tpl = DEFAULT_DEFERRAL_CARD_TEMPLATES.whitelist_discord_member_denied;
        const html = buildDeferralCardHtml(
            tpl.title,
            'Please join Test Guild then try again.',
            true,
            DEFERRAL_CARD_LOGO_PATH,
        );
        expect(html).toContain('You are required to join our Discord server to connect.');
        expect(html).toContain('Please join Test Guild');
        expect(html).toContain('#80282B');
        expect(html).toContain('opacity:0.45');
        expect(html).toContain('width:88px');
        expect(html).not.toContain('border-radius:999px');
    });

    it('detects legacy bland templates', () => {
        expect(
            isLegacyBlandDeferralTemplate('ban_temporary', {
                title: 'Banned',
                bodyTemplate: '{customMessage}',
                showRequestId: false,
                showTierName: false,
                customPlaceholders: [],
            }),
        ).toBe(true);
    });
});
