import { z } from 'zod';
import type { DeferralCardsConfig, DeferralCardTemplate, DeferralScenarioId } from './deferralCardTypes';
import { DeferralCardsConfigSchema, DeferralScenarioIdSchema, normalizeDeferralCardsConfig } from './deferralCardTypes';
import { syncLegacyFieldsFromLayout } from './deferralCardLayout';
import { getTemplateCanvas, templateWithCanvas } from './deferralCardCanvas';
import { isAddonDeferralScenarioId } from './deferralAddonTypes';

export const DEFERRAL_CARD_EXPORT_VERSION = 1 as const;
export const DEFERRAL_CARD_EXPORT_VERSION_V2 = 2 as const;

const DeferralCardExportFileV1Schema = z.object({
    sxPanelDeferralCard: z.literal(DEFERRAL_CARD_EXPORT_VERSION),
    exportedAt: z.string().optional(),
    scenario: DeferralScenarioIdSchema.optional(),
    skin: DeferralCardsConfigSchema.shape.skin.optional(),
    discordInvite: DeferralCardsConfigSchema.shape.discordInvite.optional(),
    sharedCustomPlaceholders: DeferralCardsConfigSchema.shape.sharedCustomPlaceholders.optional(),
    template: z.unknown().optional(),
    scenarios: z.record(DeferralScenarioIdSchema, z.unknown()).optional(),
});

const DeferralCardExportAddonMetaSchema = z.record(
    z.string(),
    z.object({
        tokens: z.array(z.string()).optional(),
    }),
);

const DeferralCardExportFileV2Schema = z.object({
    sxPanelDeferralCard: z.literal(DEFERRAL_CARD_EXPORT_VERSION_V2),
    exportedAt: z.string().optional(),
    scenario: z.string().optional(),
    skin: DeferralCardsConfigSchema.shape.skin.optional(),
    discordInvite: DeferralCardsConfigSchema.shape.discordInvite.optional(),
    sharedCustomPlaceholders: DeferralCardsConfigSchema.shape.sharedCustomPlaceholders.optional(),
    template: z.unknown().optional(),
    scenarios: z.record(DeferralScenarioIdSchema, z.unknown()).optional(),
    addonScenarios: z.record(z.string(), z.unknown()).optional(),
    addonMeta: DeferralCardExportAddonMetaSchema.optional(),
});

export const DeferralCardExportFileSchema = z.union([DeferralCardExportFileV1Schema, DeferralCardExportFileV2Schema]);
export type DeferralCardExportFile = z.infer<typeof DeferralCardExportFileSchema>;

function exportVersion(
    config: DeferralCardsConfig,
): typeof DEFERRAL_CARD_EXPORT_VERSION | typeof DEFERRAL_CARD_EXPORT_VERSION_V2 {
    const addonCount = Object.keys(config.addonScenarios ?? {}).length;
    return addonCount > 0 ? DEFERRAL_CARD_EXPORT_VERSION_V2 : DEFERRAL_CARD_EXPORT_VERSION;
}

function buildAddonMeta(config: DeferralCardsConfig): Record<string, { tokens: string[] }> | undefined {
    const addonScenarios = config.addonScenarios ?? {};
    const meta: Record<string, { tokens: string[] }> = {};
    for (const scenarioId of Object.keys(addonScenarios)) {
        const parsed = scenarioId.split(':');
        if (parsed.length < 2) continue;
        const addonId = parsed[0];
        if (!meta[addonId]) meta[addonId] = { tokens: [] };
    }
    return Object.keys(meta).length ? meta : undefined;
}

export function exportDeferralScenario(
    config: DeferralCardsConfig,
    scenarioId: DeferralScenarioId | string,
): DeferralCardExportFile {
    const normalized = normalizeDeferralCardsConfig(config);
    const isAddon = isAddonDeferralScenarioId(scenarioId);
    const template = isAddon
        ? normalized.addonScenarios?.[scenarioId]
        : normalized.scenarios[scenarioId as DeferralScenarioId];
    if (!template) {
        throw new Error(`Unknown deferral scenario: ${scenarioId}`);
    }
    const version = isAddon ? DEFERRAL_CARD_EXPORT_VERSION_V2 : exportVersion(normalized);
    const base = {
        sxPanelDeferralCard: version,
        exportedAt: new Date().toISOString(),
        scenario: scenarioId,
        skin: normalized.skin,
        template: syncLegacyFieldsFromLayout(template),
    } as DeferralCardExportFile;
    if (version === DEFERRAL_CARD_EXPORT_VERSION_V2 && isAddon) {
        return { ...base, addonMeta: buildAddonMeta(normalized) } as DeferralCardExportFile;
    }
    return base;
}

export function exportDeferralCardsFull(config: DeferralCardsConfig): DeferralCardExportFile {
    const normalized = normalizeDeferralCardsConfig(config);
    const scenarios: Record<string, DeferralCardTemplate> = {};
    for (const [id, tpl] of Object.entries(normalized.scenarios)) {
        scenarios[id] = syncLegacyFieldsFromLayout(tpl);
    }
    const addonScenarios: Record<string, DeferralCardTemplate> = {};
    for (const [id, tpl] of Object.entries(normalized.addonScenarios ?? {})) {
        addonScenarios[id] = syncLegacyFieldsFromLayout(tpl);
    }
    const version = exportVersion(normalized);
    const base = {
        sxPanelDeferralCard: version,
        exportedAt: new Date().toISOString(),
        skin: normalized.skin,
        discordInvite: normalized.discordInvite,
        sharedCustomPlaceholders: normalized.sharedCustomPlaceholders,
        scenarios,
    } as DeferralCardExportFile;
    if (version === DEFERRAL_CARD_EXPORT_VERSION_V2) {
        return {
            ...base,
            addonScenarios,
            addonMeta: buildAddonMeta(normalized),
        } as DeferralCardExportFile;
    }
    return base;
}

export type ImportDeferralResult =
    | {
          ok: true;
          config: DeferralCardsConfig;
          importedScenarios: DeferralScenarioId[];
          importedAddonScenarios: string[];
          skippedAddonScenarios: string[];
      }
    | { ok: false; error: string };

function parseTemplate(raw: unknown): DeferralCardTemplate | null {
    const base = typeof raw === 'object' && raw !== null ? (raw as DeferralCardTemplate) : ({} as DeferralCardTemplate);
    const withCanvas = base.layout?.canvas ? templateWithCanvas(base, getTemplateCanvas(base)) : base;
    const synced = syncLegacyFieldsFromLayout(withCanvas);
    const hasCanvas = Boolean(synced.layout?.canvas?.elements?.length);
    if (!synced.title && !synced.bodyTemplate && !synced.layout?.blocks?.length && !hasCanvas) {
        return null;
    }
    return synced;
}

export type ImportDeferralOptions = {
    /** Addon IDs currently installed/running — addon scenarios import only when listed. */
    installedAddonIds?: string[];
};

function addonIdFromScenarioId(scenarioId: string): string | null {
    const idx = scenarioId.indexOf(':');
    if (idx <= 0) return null;
    return scenarioId.slice(0, idx);
}

/**
 * Merges an exported JSON file into the current deferral cards config.
 */
export function importDeferralCardFile(
    current: DeferralCardsConfig,
    raw: unknown,
    options: ImportDeferralOptions = {},
): ImportDeferralResult {
    const parsed = DeferralCardExportFileSchema.safeParse(raw);
    if (!parsed.success) {
        return { ok: false, error: 'Invalid deferral card file (missing sxPanelDeferralCard header).' };
    }
    const file = parsed.data;
    const base = normalizeDeferralCardsConfig(current);
    const installedList = options.installedAddonIds;
    const next: DeferralCardsConfig = {
        skin: { ...base.skin, ...file.skin },
        discordInvite: file.discordInvite ?? base.discordInvite,
        sharedCustomPlaceholders: file.sharedCustomPlaceholders ?? base.sharedCustomPlaceholders,
        scenarios: { ...base.scenarios },
        addonScenarios: { ...(base.addonScenarios ?? {}) },
    };
    const imported: DeferralScenarioId[] = [];
    const importedAddon: string[] = [];
    const skippedAddon: string[] = [];

    const importAddonScenario = (id: string, tplRaw: unknown) => {
        if (!isAddonDeferralScenarioId(id)) return;
        const addonId = addonIdFromScenarioId(id);
        if (installedList !== undefined && (!addonId || !installedList.includes(addonId))) {
            skippedAddon.push(id);
            return;
        }
        const tpl = parseTemplate(tplRaw);
        if (!tpl) return;
        next.addonScenarios![id] = tpl;
        importedAddon.push(id);
    };

    if (file.scenario && file.template) {
        const tpl = parseTemplate(file.template);
        if (!tpl) return { ok: false, error: 'Export file has no template data.' };
        if (isAddonDeferralScenarioId(file.scenario)) {
            const beforeSkip = skippedAddon.length;
            importAddonScenario(file.scenario, tpl);
            if (!importedAddon.length) {
                const addonId = addonIdFromScenarioId(file.scenario);
                return {
                    ok: false,
                    error:
                        skippedAddon.length > beforeSkip
                            ? `Addon "${addonId}" is not installed — cannot import scenario "${file.scenario}".`
                            : `Could not import addon scenario "${file.scenario}".`,
                };
            }
        } else {
            const scenarioParsed = DeferralScenarioIdSchema.safeParse(file.scenario);
            if (!scenarioParsed.success) {
                return { ok: false, error: `Unknown scenario: ${file.scenario}` };
            }
            next.scenarios[scenarioParsed.data] = tpl;
            imported.push(scenarioParsed.data);
        }
        return {
            ok: true,
            config: normalizeDeferralCardsConfig(next),
            importedScenarios: imported,
            importedAddonScenarios: importedAddon,
            skippedAddonScenarios: skippedAddon,
        };
    }

    if (file.scenarios && typeof file.scenarios === 'object') {
        for (const [id, tplRaw] of Object.entries(file.scenarios)) {
            const scenarioParsed = DeferralScenarioIdSchema.safeParse(id);
            if (!scenarioParsed.success) continue;
            const tpl = parseTemplate(tplRaw);
            if (!tpl) continue;
            next.scenarios[scenarioParsed.data] = tpl;
            imported.push(scenarioParsed.data);
        }
    }

    if ('addonScenarios' in file && file.addonScenarios && typeof file.addonScenarios === 'object') {
        for (const [id, tplRaw] of Object.entries(file.addonScenarios)) {
            importAddonScenario(id, tplRaw);
        }
    }

    if (!imported.length && !importedAddon.length) {
        return { ok: false, error: 'No valid scenarios found in export file.' };
    }

    return {
        ok: true,
        config: normalizeDeferralCardsConfig(next),
        importedScenarios: imported,
        importedAddonScenarios: importedAddon,
        skippedAddonScenarios: skippedAddon,
    };
}
