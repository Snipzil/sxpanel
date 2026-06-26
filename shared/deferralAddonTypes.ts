import { z } from 'zod';
import { DEFERRAL_BUILTIN_TOKEN_KEYS } from './deferralCardLayout';
import type { DeferralCardTemplate } from './deferralCardTypes';

export const DEFERRAL_ADDON_SCENARIO_KEY_REGEX = /^[a-z][a-z0-9_]{0,47}$/;

export const DeferralAddonScenarioKeySchema = z
    .string()
    .regex(DEFERRAL_ADDON_SCENARIO_KEY_REGEX, 'Scenario key must be lowercase alphanumeric + underscores');

export const DeferralAddonScenarioGroupSchema = z.enum(['ban', 'whitelist', 'queue', 'general', 'addon']);
export type DeferralAddonScenarioGroup = z.infer<typeof DeferralAddonScenarioGroupSchema>;

export const DeferralAddonTokenKeySchema = z
    .string()
    .min(1)
    .max(48)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Token key must start with a letter')
    .refine((key) => !(DEFERRAL_BUILTIN_TOKEN_KEYS as readonly string[]).includes(key), {
        message: 'Token key collides with a built-in deferral token',
    });

export const AddonDeferralScenarioManifestSchema = z.object({
    id: DeferralAddonScenarioKeySchema,
    label: z.string().min(1).max(64),
    description: z.string().max(256).default(''),
    group: DeferralAddonScenarioGroupSchema.default('addon'),
    defaultTemplate: z.unknown().optional(),
});

export const AddonDeferralTokenManifestSchema = z.object({
    key: DeferralAddonTokenKeySchema,
    label: z.string().min(1).max(64),
    sample: z.string().max(512).optional(),
});

export const AddonDeferralManifestSchema = z.object({
    scenarios: z.array(AddonDeferralScenarioManifestSchema).default([]),
    tokens: z.array(AddonDeferralTokenManifestSchema).default([]),
});

export type AddonDeferralManifest = z.infer<typeof AddonDeferralManifestSchema>;
export type DeferralAddonScenarioManifest = z.infer<typeof AddonDeferralScenarioManifestSchema>;
export type DeferralAddonTokenManifest = z.infer<typeof AddonDeferralTokenManifestSchema>;

export type DeferralAddonScenarioMeta = {
    id: string;
    addonId: string;
    scenarioKey: string;
    label: string;
    description: string;
    group: DeferralAddonScenarioGroup;
    source: 'manifest' | 'runtime';
};

export type DeferralAddonTokenMeta = {
    key: string;
    addonId: string;
    label: string;
    sample?: string;
    dynamic: true;
};

export type DeferralResolveTokensPlayerContext = {
    license?: string;
    playerName?: string;
    discordId?: string;
    identifiers?: string[];
};

export type DeferralResolveTokensContext = {
    scenarioId: string;
    tokens: string[];
    player: DeferralResolveTokensPlayerContext;
};

export type PendingAddonDeferral = {
    addonId: string;
    scenarioId: string;
    customMessage?: string;
    playerName?: string;
    expiresAt: number;
};

const ADDON_SCENARIO_ID_REGEX = /^([a-z0-9][a-z0-9-]{1,62}[a-z0-9]):([a-z][a-z0-9_]{0,47})$/;

export function buildAddonDeferralScenarioId(addonId: string, scenarioKey: string): string {
    return `${addonId}:${scenarioKey}`;
}

export function parseAddonDeferralScenarioId(scenarioId: string): { addonId: string; scenarioKey: string } | null {
    const match = ADDON_SCENARIO_ID_REGEX.exec(scenarioId);
    if (!match) return null;
    return { addonId: match[1], scenarioKey: match[2] };
}

export function isAddonDeferralScenarioId(scenarioId: string): boolean {
    return parseAddonDeferralScenarioId(scenarioId) !== null;
}

export function normalizeAddonDeferralScenarios(input: unknown): Record<string, DeferralCardTemplate> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const out: Record<string, DeferralCardTemplate> = {};
    for (const [id, tpl] of Object.entries(input as Record<string, unknown>)) {
        if (!isAddonDeferralScenarioId(id)) continue;
        if (!tpl || typeof tpl !== 'object') continue;
        out[id] = tpl as DeferralCardTemplate;
    }
    return out;
}

export type DeferralAddonMetaResponse = {
    scenarios: DeferralAddonScenarioMeta[];
    tokens: DeferralAddonTokenMeta[];
    installedAddonIds: string[];
};
