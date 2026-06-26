import { describe, it, expect } from 'vitest';
import { DEFAULT_DEFERRAL_CARDS_CONFIG, normalizeDeferralCardsConfig } from './deferralCardTypes';
import { exportDeferralScenario, exportDeferralCardsFull, importDeferralCardFile } from './deferralCardExport';
import { layoutFromLegacyTemplate } from './deferralCardLayout';
import { templateHasVisualLayout } from './deferralCardLayout';
import { getTemplateCanvas, loadStudioCanvasElements, templateWithCanvas } from './deferralCardCanvas';
describe('deferralCardExport', () => {
    it('exports and imports a single scenario', () => {
        const withLayout = {
            ...DEFAULT_DEFERRAL_CARDS_CONFIG,
            scenarios: {
                ...DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios,
                whitelist_pending: {
                    ...DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios.whitelist_pending,
                    layout: layoutFromLegacyTemplate(DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios.whitelist_pending),
                    customPlaceholders: [{ key: 'discordInvite', label: 'Invite', value: 'discord.gg/test' }],
                },
            },
        };
        const file = exportDeferralScenario(withLayout, 'whitelist_pending');
        const result = importDeferralCardFile(DEFAULT_DEFERRAL_CARDS_CONFIG, file);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.importedScenarios).toEqual(['whitelist_pending']);
        expect(templateHasVisualLayout(result.config.scenarios.whitelist_pending)).toBe(true);
        expect(result.config.scenarios.whitelist_pending.customPlaceholders[0]?.key).toBe('discordInvite');
    });

    it('exports and imports canvas layout from studio state', () => {
        const scenarioId = 'connection_queue' as const;
        const baseTpl = DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios[scenarioId];
        const canvas = getTemplateCanvas(baseTpl);
        const studioTpl = templateWithCanvas(baseTpl, {
            ...canvas,
            elements: canvas.elements.map((el, i) => (i === 0 ? { ...el, x: el.x + 40, y: el.y + 12 } : el)),
        });
        const config = {
            ...DEFAULT_DEFERRAL_CARDS_CONFIG,
            scenarios: {
                ...DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios,
                [scenarioId]: studioTpl,
            },
        };

        const file = exportDeferralScenario(config, scenarioId);
        expect(file.template).toBeTruthy();
        expect(
            (file.template as { layout?: { canvas?: { elements?: unknown[] } } }).layout?.canvas?.elements?.length,
        ).toBeGreaterThan(0);

        const result = importDeferralCardFile(DEFAULT_DEFERRAL_CARDS_CONFIG, file);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const importedTpl = result.config.scenarios[scenarioId];
        const before = getTemplateCanvas(studioTpl).elements;
        const after = getTemplateCanvas(importedTpl).elements;
        expect(after[0]?.x).toBe(before[0]?.x);
        expect(after[0]?.y).toBe(before[0]?.y);
    });

    it('exports full config with canvas layouts', () => {
        const file = exportDeferralCardsFull(DEFAULT_DEFERRAL_CARDS_CONFIG);
        const result = importDeferralCardFile(DEFAULT_DEFERRAL_CARDS_CONFIG, file);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.importedScenarios.length).toBeGreaterThan(0);
    });

    it('exports and imports v2 addon scenarios when addon is installed', () => {
        const withAddon = normalizeDeferralCardsConfig({
            ...DEFAULT_DEFERRAL_CARDS_CONFIG,
            addonScenarios: {
                'demo-addon:denied': {
                    title: 'Denied',
                    bodyTemplate: '{shiftNote}',
                    showRequestId: false,
                    showTierName: false,
                },
            },
        });
        const file = exportDeferralCardsFull(withAddon);
        expect(file.fxPanelDeferralCard).toBe(2);
        const result = importDeferralCardFile(DEFAULT_DEFERRAL_CARDS_CONFIG, file, {
            installedAddonIds: ['demo-addon'],
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.importedAddonScenarios).toContain('demo-addon:denied');
        expect(result.config.addonScenarios?.['demo-addon:denied']?.title).toBe('Denied');
    });

    it('skips addon-only import when addon is not installed', () => {
        const file = exportDeferralScenario(
            normalizeDeferralCardsConfig({
                ...DEFAULT_DEFERRAL_CARDS_CONFIG,
                addonScenarios: {
                    'missing-addon:denied': {
                        title: 'X',
                        bodyTemplate: 'y',
                        showRequestId: false,
                        showTierName: false,
                    },
                },
            }),
            'missing-addon:denied',
        );
        const result = importDeferralCardFile(DEFAULT_DEFERRAL_CARDS_CONFIG, file, {
            installedAddonIds: [],
        });
        expect(result.ok).toBe(false);
    });
});
