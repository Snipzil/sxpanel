import { dequal } from 'dequal';
import type { DeferralCardTemplate, DeferralCardsConfig, DeferralScenarioId } from './deferralCardTypes';
import { DEFERRAL_SCENARIO_META } from './deferralCardTypes';
import { isAddonDeferralScenarioId } from './deferralAddonTypes';
import { getDeferralTemplateOrDefault } from './deferralScenarioAccess';
import { getTemplateCanvas, normalizeCanvasRecord } from './deferralCardCanvas';
import { sanitizeDeferralCardTemplate } from './deferralCardCanvas';
import type { PrepareDeferralCardsActiveStudio } from './deferralCardRender';
import { prepareDeferralCardsForSave } from './deferralCardRender';

/** Stable snapshot for studio dirty checks (layout canvas + legacy toggles). */
export function deferralScenarioStudioSnapshot(template: DeferralCardTemplate) {
    const safe = sanitizeDeferralCardTemplate(template);
    const canvas = normalizeCanvasRecord(getTemplateCanvas(safe));
    return {
        title: safe.title,
        bodyTemplate: safe.bodyTemplate,
        showRequestId: safe.showRequestId,
        showTierName: safe.showTierName,
        showLogo: safe.showLogo,
        canvas,
    };
}

export function isDeferralScenarioDirty(working: DeferralCardTemplate, saved: DeferralCardTemplate): boolean {
    return !dequal(deferralScenarioStudioSnapshot(working), deferralScenarioStudioSnapshot(saved));
}

export function listDirtyDeferralScenarioIds(
    working: DeferralCardsConfig,
    saved: DeferralCardsConfig,
): (DeferralScenarioId | string)[] {
    const core = DEFERRAL_SCENARIO_META.filter(({ id }) =>
        isDeferralScenarioDirty(working.scenarios[id], saved.scenarios[id]),
    ).map(({ id }) => id);
    const addonIds = new Set([
        ...Object.keys(working.addonScenarios ?? {}),
        ...Object.keys(saved.addonScenarios ?? {}),
    ]);
    const addon = [...addonIds].filter((id) => {
        if (!isAddonDeferralScenarioId(id)) return false;
        return isDeferralScenarioDirty(
            getDeferralTemplateOrDefault(working, id),
            getDeferralTemplateOrDefault(saved, id),
        );
    });
    return [...core, ...addon];
}

/**
 * Builds a full deferralCards payload that updates only the active scenario on the server baseline.
 * Other scenarios stay as last saved — in-memory edits to them are not persisted.
 */
export function buildDeferralCardsSavePayload(
    savedBaseline: DeferralCardsConfig,
    working: DeferralCardsConfig,
    active: PrepareDeferralCardsActiveStudio,
): DeferralCardsConfig {
    return prepareDeferralCardsForSave(
        {
            ...savedBaseline,
            skin: working.skin,
            discordInvite: working.discordInvite,
            sharedCustomPlaceholders: working.sharedCustomPlaceholders,
        },
        active,
        { syncScenarioIds: [active.scenarioId] },
    );
}

/** After saving one scenario, merge payload with any still-dirty unsaved scenarios from working copy. */
export function mergeDeferralCardsAfterScenarioSave(
    payload: DeferralCardsConfig,
    working: DeferralCardsConfig,
    savedBefore: DeferralCardsConfig,
    savedScenarioId: DeferralScenarioId | string,
): DeferralCardsConfig {
    const scenarios = { ...payload.scenarios };
    const addonScenarios = { ...(payload.addonScenarios ?? {}) };
    for (const { id } of DEFERRAL_SCENARIO_META) {
        if (id === savedScenarioId) continue;
        if (isDeferralScenarioDirty(working.scenarios[id], savedBefore.scenarios[id])) {
            scenarios[id] = working.scenarios[id];
        }
    }
    for (const id of listDirtyDeferralScenarioIds(working, savedBefore)) {
        if (id === savedScenarioId || !isAddonDeferralScenarioId(id)) continue;
        const tpl = working.addonScenarios?.[id];
        if (tpl) addonScenarios[id] = tpl;
    }
    return { ...payload, scenarios, addonScenarios };
}
