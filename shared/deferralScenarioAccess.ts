import type { DeferralCardTemplate, DeferralCardsConfig, DeferralScenarioId } from './deferralCardTypes';
import { DEFAULT_DEFERRAL_CARDS_CONFIG } from './deferralCardTypes';
import { isAddonDeferralScenarioId } from './deferralAddonTypes';

export function getDeferralTemplateFromConfig(
    config: DeferralCardsConfig,
    scenarioId: string,
): DeferralCardTemplate | undefined {
    if (isAddonDeferralScenarioId(scenarioId)) {
        return config.addonScenarios?.[scenarioId];
    }
    return config.scenarios[scenarioId as DeferralScenarioId];
}

export function getDeferralTemplateOrDefault(config: DeferralCardsConfig, scenarioId: string): DeferralCardTemplate {
    const direct = getDeferralTemplateFromConfig(config, scenarioId);
    if (direct) return direct;
    if (!isAddonDeferralScenarioId(scenarioId)) {
        return DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios[scenarioId as DeferralScenarioId];
    }
    return {
        title: 'Access Denied',
        bodyTemplate: '{customMessage}',
        showRequestId: false,
        showTierName: false,
        customPlaceholders: [],
    };
}
