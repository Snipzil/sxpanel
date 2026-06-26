import type { DeferralCardTemplate } from '@shared/deferralCardTypes';
import {
    buildAddonDeferralScenarioId,
    parseAddonDeferralScenarioId,
    type DeferralAddonScenarioMeta,
    type DeferralAddonTokenMeta,
    type DeferralResolveTokensContext,
    type PendingAddonDeferral,
    type AddonDeferralManifest,
} from '@shared/deferralAddonTypes';
import { syncLegacyFieldsFromLayout } from '@shared/deferralCardLayout';
import type { AddonDeferralReadyDescriptor } from '@shared/addonTypes';

const PENDING_DEFERRAL_TTL_MS = 120_000;
const DEFERRAL_RESOLVE_TIMEOUT_MS = 2_000;

export type RegisteredDeferralScenario = {
    addonId: string;
    scenarioKey: string;
    label: string;
    description: string;
    group: DeferralAddonScenarioMeta['group'];
    defaultTemplate?: DeferralCardTemplate;
    source: 'manifest' | 'runtime';
};

export type RegisteredDeferralToken = {
    addonId: string;
    key: string;
    label: string;
    sample?: string;
};

export class AddonDeferralRegistry {
    private readonly scenarios = new Map<string, RegisteredDeferralScenario>();
    private readonly tokens = new Map<string, RegisteredDeferralToken>();
    private readonly pendingDeferrals = new Map<string, PendingAddonDeferral>();

    clearAddon(addonId: string): void {
        for (const [id, row] of this.scenarios) {
            if (row.addonId === addonId) this.scenarios.delete(id);
        }
        for (const key of [...this.tokens.keys()]) {
            if (key.startsWith(`${addonId}:`)) this.tokens.delete(key);
        }
        for (const [license, row] of this.pendingDeferrals) {
            if (row.addonId === addonId) this.pendingDeferrals.delete(license);
        }
    }

    registerFromManifest(addonId: string, manifest?: AddonDeferralManifest): void {
        if (!manifest) return;
        for (const row of manifest.scenarios) {
            const scenarioId = buildAddonDeferralScenarioId(addonId, row.id);
            let defaultTemplate: DeferralCardTemplate | undefined;
            if (row.defaultTemplate && typeof row.defaultTemplate === 'object') {
                defaultTemplate = syncLegacyFieldsFromLayout(row.defaultTemplate as DeferralCardTemplate);
            }
            this.scenarios.set(scenarioId, {
                addonId,
                scenarioKey: row.id,
                label: row.label,
                description: row.description ?? '',
                group: row.group ?? 'addon',
                defaultTemplate,
                source: 'manifest',
            });
        }
        for (const row of manifest.tokens) {
            this.tokens.set(`${addonId}:${row.key}`, {
                addonId,
                key: row.key,
                label: row.label,
                sample: row.sample,
            });
        }
    }

    registerRuntime(addonId: string, payload?: AddonDeferralReadyDescriptor): void {
        if (!payload) return;
        for (const row of payload.scenarios) {
            const parsed = parseAddonDeferralScenarioId(row.id);
            const scenarioKey = parsed?.scenarioKey ?? row.id;
            const scenarioId = buildAddonDeferralScenarioId(addonId, scenarioKey);
            const existing = this.scenarios.get(scenarioId);
            this.scenarios.set(scenarioId, {
                addonId,
                scenarioKey,
                label: row.label,
                description: row.description ?? existing?.description ?? '',
                group: (row.group as RegisteredDeferralScenario['group']) ?? existing?.group ?? 'addon',
                defaultTemplate: existing?.defaultTemplate,
                source: 'runtime',
            });
        }
        for (const key of payload.tokens) {
            if (!this.tokens.has(`${addonId}:${key}`)) {
                this.tokens.set(`${addonId}:${key}`, { addonId, key, label: key });
            }
        }
    }

    setPendingDeferral(row: Omit<PendingAddonDeferral, 'expiresAt'>): void {
        this.pendingDeferrals.set(row.license, {
            ...row,
            expiresAt: Date.now() + PENDING_DEFERRAL_TTL_MS,
        });
    }

    consumePendingDeferral(license: string | undefined): PendingAddonDeferral | null {
        if (!license) return null;
        const row = this.pendingDeferrals.get(license);
        if (!row) return null;
        this.pendingDeferrals.delete(license);
        if (Date.now() > row.expiresAt) return null;
        return row;
    }

    getScenario(scenarioId: string): RegisteredDeferralScenario | undefined {
        return this.scenarios.get(scenarioId);
    }

    getDefaultTemplate(scenarioId: string): DeferralCardTemplate | undefined {
        return this.scenarios.get(scenarioId)?.defaultTemplate;
    }

    listScenarioMeta(): DeferralAddonScenarioMeta[] {
        return [...this.scenarios.values()].map((row) => ({
            id: buildAddonDeferralScenarioId(row.addonId, row.scenarioKey),
            addonId: row.addonId,
            scenarioKey: row.scenarioKey,
            label: row.label,
            description: row.description,
            group: row.group,
            source: row.source,
        }));
    }

    listTokenMeta(): DeferralAddonTokenMeta[] {
        return [...this.tokens.values()].map((row) => ({
            key: row.key,
            addonId: row.addonId,
            label: row.label,
            sample: row.sample,
            dynamic: true as const,
        }));
    }

    resolveAddonIdForScenario(scenarioId: string): string | null {
        return parseAddonDeferralScenarioId(scenarioId)?.addonId ?? null;
    }

    tokensForAddon(addonId: string): string[] {
        return [...this.tokens.values()].filter((t) => t.addonId === addonId).map((t) => t.key);
    }

    getResolveTimeoutMs(): number {
        return DEFERRAL_RESOLVE_TIMEOUT_MS;
    }

    buildResolveContext(
        scenarioId: string,
        tokenKeys: string[],
        player: DeferralResolveTokensContext['player'],
    ): DeferralResolveTokensContext {
        return { scenarioId, tokens: tokenKeys, player };
    }
}
