import { describe, it, expect } from 'vitest';
import { DEFAULT_DEFERRAL_CARDS_CONFIG } from './deferralCardTypes';
import {
    buildDeferralCardsSavePayload,
    isDeferralScenarioDirty,
    mergeDeferralCardsAfterScenarioSave,
} from './deferralCardDirty';
import { patchDeferralScenario } from './deferralCardRender';
import { getTemplateCanvas, templateWithCanvas } from './deferralCardCanvas';

describe('deferralCardDirty', () => {
    it('detects canvas edits as dirty', () => {
        const saved = DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios.whitelist_pending;
        const canvas = getTemplateCanvas(saved);
        const working = templateWithCanvas(saved, {
            ...canvas,
            elements: canvas.elements.map((el) => (el.type === 'heading' ? { ...el, content: 'Changed title' } : el)),
        });
        expect(isDeferralScenarioDirty(working, saved)).toBe(true);
    });

    it('save payload keeps other scenarios on server baseline', () => {
        const saved = DEFAULT_DEFERRAL_CARDS_CONFIG;
        const dirtyOther = patchDeferralScenario(saved, 'access_denied', {
            ...saved.scenarios.access_denied,
            title: 'Local only',
        });
        const activeTpl = saved.scenarios.ban_temporary;
        const canvas = templateWithCanvas(activeTpl, {
            width: 640,
            height: 280,
            elements: [{ id: 'h', type: 'heading', content: 'Banned', x: 0, y: 0, enabled: true }],
        });
        const payload = buildDeferralCardsSavePayload(saved, dirtyOther, {
            scenarioId: 'ban_temporary',
            baseTemplate: canvas,
            canvas: { width: 640, height: 280, elements: canvas.layout!.canvas!.elements },
        });
        expect(payload.scenarios.access_denied.title).toBe(saved.scenarios.access_denied.title);
        expect(payload.scenarios.ban_temporary.layout?.canvas?.elements?.length).toBeGreaterThan(0);
    });

    it('merge after save preserves dirty scenarios in working copy', () => {
        const saved = DEFAULT_DEFERRAL_CARDS_CONFIG;
        const denied = saved.scenarios.access_denied;
        const deniedCanvas = getTemplateCanvas(denied);
        const working = patchDeferralScenario(saved, 'access_denied', {
            ...templateWithCanvas(denied, {
                ...deniedCanvas,
                elements: deniedCanvas.elements.map((el) =>
                    el.type === 'heading' ? { ...el, content: 'Still dirty' } : el,
                ),
            }),
        });
        const payload = buildDeferralCardsSavePayload(saved, working, {
            scenarioId: 'ban_temporary',
            baseTemplate: working.scenarios.ban_temporary,
            canvas: { width: 640, height: 280, elements: [] },
        });
        const merged = mergeDeferralCardsAfterScenarioSave(payload, working, saved, 'ban_temporary');
        const mergedHeading = getTemplateCanvas(merged.scenarios.access_denied).elements.find(
            (e) => e.type === 'heading',
        );
        expect(mergedHeading?.content).toBe('Still dirty');
    });
});
