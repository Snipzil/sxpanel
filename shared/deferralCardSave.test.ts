import { describe, it, expect } from 'vitest';
import { DeferralCardsConfigSchema, DEFAULT_DEFERRAL_CARDS_CONFIG } from './deferralCardTypes';
import { prepareDeferralCardsForSave } from './deferralCardRender';
import { loadStudioCanvasElements, templateWithCanvas } from './deferralCardCanvas';
import { syncLegacyFieldsFromLayout } from './deferralCardLayout';

describe('prepareDeferralCardsForSave', () => {
    it('prepares studio canvas payload without throwing', () => {
        const body = '<strong>Expires:</strong> in 2 days<br><strong>Reason:</strong> Example ban';
        const scenarioId = 'ban_temporary';
        const base = DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios[scenarioId];
        const elements = loadStudioCanvasElements(base, scenarioId, body);
        const canvas = { width: 640, height: 220, elements };

        const payload = prepareDeferralCardsForSave(DEFAULT_DEFERRAL_CARDS_CONFIG, {
            scenarioId,
            baseTemplate: base,
            canvas,
        });

        const parsed = DeferralCardsConfigSchema.safeParse(payload);
        expect(parsed.success).toBe(true);
        expect(payload.scenarios[scenarioId].layout?.canvas?.elements?.length).toBeGreaterThan(0);
    });

    it('syncs every default scenario without throwing', () => {
        for (const id of Object.keys(DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios)) {
            expect(() =>
                syncLegacyFieldsFromLayout(
                    DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios[id as keyof typeof DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios],
                ),
            ).not.toThrow();
        }
    });

    it('handles corrupt stored shapes', () => {
        const corrupt = {
            ...DEFAULT_DEFERRAL_CARDS_CONFIG,
            scenarios: {
                ...DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios,
                ban_temporary: {
                    ...DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios.ban_temporary,
                    bodyTemplate: undefined as unknown as string,
                    title: undefined as unknown as string,
                    layout: {
                        version: 2 as const,
                        blocks: [
                            {
                                id: 'body',
                                type: 'paragraph' as const,
                                content: '<strong>A</strong><br><strong>B</strong>',
                                enabled: true,
                            },
                        ],
                        canvas: {
                            width: 640,
                            height: 220,
                            elements: [
                                {
                                    id: 'bad',
                                    type: 'paragraph' as const,
                                    content: '<strong>Expires:</strong> x<br><strong>Reason:</strong> y',
                                    x: 0,
                                    y: 0,
                                    enabled: true,
                                },
                                undefined as unknown as typeof DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios.ban_temporary,
                            ],
                        },
                    },
                },
                whitelist_pending: {
                    ...DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios.whitelist_pending,
                    layout: {
                        version: 2 as const,
                        blocks: [],
                        canvas: templateWithCanvas(DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios.whitelist_pending, {
                            width: 640,
                            height: 220,
                            elements: [],
                        }).layout?.canvas,
                    },
                },
            },
        };

        expect(() => prepareDeferralCardsForSave(corrupt as typeof DEFAULT_DEFERRAL_CARDS_CONFIG)).not.toThrow();
        const payload = prepareDeferralCardsForSave(corrupt as typeof DEFAULT_DEFERRAL_CARDS_CONFIG);
        expect(DeferralCardsConfigSchema.safeParse(payload).success).toBe(true);
    });

    it('coerces non-string bodyTemplate and element content', () => {
        const corrupt = {
            ...DEFAULT_DEFERRAL_CARDS_CONFIG,
            scenarios: {
                ...DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios,
                ban_temporary: {
                    ...DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios.ban_temporary,
                    bodyTemplate: undefined as unknown as string,
                    layout: {
                        version: 2 as const,
                        canvas: {
                            width: 640,
                            height: 220,
                            elements: [
                                {
                                    id: 'line1',
                                    type: 'text' as const,
                                    content: 12345 as unknown as string,
                                    x: 0,
                                    y: 0,
                                    enabled: true,
                                },
                                null,
                            ],
                        },
                    },
                },
            },
        };

        expect(() => prepareDeferralCardsForSave(corrupt as typeof DEFAULT_DEFERRAL_CARDS_CONFIG)).not.toThrow();
        const payload = prepareDeferralCardsForSave(corrupt as typeof DEFAULT_DEFERRAL_CARDS_CONFIG);
        expect(payload.scenarios.ban_temporary.bodyTemplate).toBeTruthy();
        expect(DeferralCardsConfigSchema.safeParse(payload).success).toBe(true);
    });
});
