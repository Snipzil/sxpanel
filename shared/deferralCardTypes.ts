import { z } from 'zod';
import {
    DeferralCardLayoutSchema,
    DeferralCustomPlaceholderSchema,
    normalizeCustomPlaceholders,
} from './deferralCardLayoutCore';
import { shouldResetToClassicDeferralTemplate, DEFERRAL_DEFAULT_CARD_LAYOUTS, TXADMIN_DEFERRAL_TEMPLATE_FIELDS } from './deferralCardDefaultLayouts';
import { normalizeAddonDeferralScenarios } from './deferralAddonTypes';

/** Single deferral card template (title, body, display toggles). */
export const DeferralCardTemplateSchema = z.object({
    title: z.string().default('Access Denied'),
    bodyTemplate: z.string().default(''),
    showRequestId: z.boolean().default(true),
    showTierName: z.boolean().default(false),
    /** Per-scenario watermark logo; when unset, falls back to config skin.showLogo. */
    showLogo: z.boolean().optional(),
    /** Visual block editor layout; legacy fields stay in sync via syncLegacyFieldsFromLayout. */
    layout: DeferralCardLayoutSchema.optional(),
    /** Per-scenario custom static tokens (built-ins like `{discordInvite}` live on config). */
    customPlaceholders: z.array(DeferralCustomPlaceholderSchema).default([]),
});
export type DeferralCardTemplate = z.infer<typeof DeferralCardTemplateSchema>;

/** @deprecated Use DeferralCardTemplate — kept for whitelist config migration. */
export const WhitelistDeferralCardSchema = DeferralCardTemplateSchema;
export type WhitelistDeferralCard = DeferralCardTemplate;

export const DeferralScenarioIdSchema = z.enum([
    'ban_temporary',
    'ban_permanent',
    'whitelist_pending',
    'whitelist_schedule_closed',
    'whitelist_admin_denied',
    'whitelist_admin_insufficient_ids',
    'whitelist_discord_member_denied',
    'whitelist_discord_member_insufficient_ids',
    'whitelist_discord_roles_not_member',
    'whitelist_discord_roles_no_roles',
    'whitelist_discord_roles_insufficient_ids',
    'whitelist_insufficient_license',
    'whitelist_error',
    'connection_queue',
    'access_denied',
]);
export type DeferralScenarioId = z.infer<typeof DeferralScenarioIdSchema>;

/** Panel static asset (SVG) — deferral cards use {@link DEFERRAL_CARD_WATERMARK_PATH} in-game. */
export { DEFERRAL_CARD_LOGO_PATH, DEFERRAL_CARD_WATERMARK_PATH } from './deferralCardLogo';

export {
    DEFERRAL_WATERMARK_INSET_PX,
    DEFERRAL_WATERMARK_MAX_WIDTH_PX,
    DEFERRAL_WATERMARK_MAX_HEIGHT_PX,
    DEFERRAL_WATERMARK_OPACITY,
} from './deferralCardWatermark';

/** Public raster assets for custom deferral images (FiveM cannot load data: URIs). */
export function deferralCardAssetPath(scenarioId: string, elementId: string, ext?: 'png' | 'gif'): string {
    const base = `/deferral-card-assets/${encodeURIComponent(scenarioId)}/${encodeURIComponent(elementId)}`;
    return ext ? `${base}.${ext}` : base;
}

export const DeferralCardsSkinSchema = z.object({
    showLogo: z.boolean().default(true),
});
export type DeferralCardsSkin = z.infer<typeof DeferralCardsSkinSchema>;

export const DEFERRAL_DEFAULT_DISCORD_INVITE = 'https://discord.gg/example';

export const DeferralAddonScenariosSchema = z.record(z.string(), DeferralCardTemplateSchema).default({});

export const DeferralCardsConfigSchema = z.object({
    skin: DeferralCardsSkinSchema.default({ showLogo: true }),
    /** Invite link substituted for `{discordInvite}` in all deferral cards. */
    discordInvite: z.string().default(DEFERRAL_DEFAULT_DISCORD_INVITE),
    /** Shared across all scenarios; synced to each scenario on save from the Deferral Cards settings tab. */
    sharedCustomPlaceholders: z.array(DeferralCustomPlaceholderSchema).default([]),
    scenarios: z.record(DeferralScenarioIdSchema, DeferralCardTemplateSchema),
    /** Addon-owned scenarios keyed as `{addonId}:{scenarioKey}`. */
    addonScenarios: DeferralAddonScenariosSchema.optional(),
});

/** Resolves `{discordInvite}` from config (migrates legacy shared placeholder key `discordInvite`). */
export function resolveDeferralDiscordInvite(
    config: Pick<DeferralCardsConfig, 'discordInvite' | 'sharedCustomPlaceholders'>,
): string {
    const direct = typeof config.discordInvite === 'string' ? config.discordInvite.trim() : '';
    if (direct) return direct;
    const legacy = config.sharedCustomPlaceholders?.find((p) => p.key === 'discordInvite')?.value?.trim();
    if (legacy) return legacy;
    return DEFERRAL_DEFAULT_DISCORD_INVITE;
}
export type DeferralCardsConfig = z.infer<typeof DeferralCardsConfigSchema>;

export type DeferralScenarioMeta = {
    id: DeferralScenarioId;
    label: string;
    description: string;
    group: 'ban' | 'whitelist' | 'queue' | 'general';
};

export const DEFERRAL_SCENARIO_META: DeferralScenarioMeta[] = [
    {
        id: 'ban_temporary',
        label: 'Ban — temporary',
        description: 'Shown when the player has an active timed ban.',
        group: 'ban',
    },
    {
        id: 'ban_permanent',
        label: 'Ban — permanent',
        description: 'Shown when the player has a permanent ban.',
        group: 'ban',
    },
    {
        id: 'whitelist_pending',
        label: 'Whitelist — pending approval',
        description: 'Manual review: player is not on the list; includes request ID when enabled.',
        group: 'whitelist',
    },
    {
        id: 'whitelist_schedule_closed',
        label: 'Whitelist — applications closed',
        description: 'Join attempted outside configured application windows.',
        group: 'whitelist',
    },
    {
        id: 'whitelist_admin_denied',
        label: 'Whitelist — admin-only denied',
        description: 'Maintenance mode: player is not a panel administrator.',
        group: 'whitelist',
    },
    {
        id: 'whitelist_admin_insufficient_ids',
        label: 'Whitelist — admin-only missing IDs',
        description: 'Maintenance mode: missing license or Discord identifier.',
        group: 'whitelist',
    },
    {
        id: 'whitelist_discord_member_denied',
        label: 'Whitelist — not in Discord',
        description: 'Discord member workflow: user is not in the guild.',
        group: 'whitelist',
    },
    {
        id: 'whitelist_discord_member_insufficient_ids',
        label: 'Whitelist — Discord member missing ID',
        description: 'Discord member workflow: no discord: identifier.',
        group: 'whitelist',
    },
    {
        id: 'whitelist_discord_roles_not_member',
        label: 'Whitelist — roles: not in guild',
        description: 'Discord roles workflow: user is not in the guild.',
        group: 'whitelist',
    },
    {
        id: 'whitelist_discord_roles_no_roles',
        label: 'Whitelist — roles: missing role',
        description: 'Discord roles workflow: member lacks a required role.',
        group: 'whitelist',
    },
    {
        id: 'whitelist_discord_roles_insufficient_ids',
        label: 'Whitelist — roles: missing ID',
        description: 'Discord roles workflow: no discord: identifier.',
        group: 'whitelist',
    },
    {
        id: 'whitelist_insufficient_license',
        label: 'Whitelist — missing license',
        description: 'Manual review: no license identifier on connect.',
        group: 'whitelist',
    },
    {
        id: 'whitelist_error',
        label: 'Whitelist — validation error',
        description: 'Discord or internal validation failed while checking whitelist.',
        group: 'whitelist',
    },
    {
        id: 'connection_queue',
        label: 'Connection queue',
        description: 'Placeholder for server queue / deferral messaging (hook up from your queue resource).',
        group: 'queue',
    },
    {
        id: 'access_denied',
        label: 'Access denied (generic)',
        description: 'Fallback card when no specific scenario is matched.',
        group: 'general',
    },
];

/** Resolves whether the fxPanel watermark logo is shown for a scenario card. */
export function resolveDeferralScenarioShowLogo(template: DeferralCardTemplate, skin: DeferralCardsSkin): boolean {
    if (template.showLogo === false) return false;
    if (template.showLogo === true) return true;
    return skin.showLogo !== false;
}

/** Applies shared placeholders to every scenario template (for save + in-game render). */
export function applySharedPlaceholdersToDeferralConfig(config: DeferralCardsConfig): DeferralCardsConfig {
    const shared = normalizeCustomPlaceholders(config.sharedCustomPlaceholders ?? []);
    const scenarios = { ...config.scenarios };
    for (const { id } of DEFERRAL_SCENARIO_META) {
        scenarios[id] = {
            ...scenarios[id],
            customPlaceholders: shared,
        };
    }
    return {
        ...config,
        sharedCustomPlaceholders: shared,
        scenarios,
    };
}

const scenarioDefaults = (partial: Partial<DeferralCardTemplate>): DeferralCardTemplate => {
    const { customPlaceholders: partialPlaceholders, ...rest } = partial;
    return {
        title: 'Access Denied',
        bodyTemplate: '',
        showRequestId: true,
        showTierName: false,
        customPlaceholders: normalizeCustomPlaceholders(partialPlaceholders),
        ...rest,
    };
};

function buildDefaultDeferralTemplate(scenarioId: DeferralScenarioId): DeferralCardTemplate {
    const fields = TXADMIN_DEFERRAL_TEMPLATE_FIELDS[scenarioId];
    return {
        title: fields.title,
        bodyTemplate: fields.bodyTemplate,
        showRequestId: fields.showRequestId,
        showTierName: fields.showTierName,
        customPlaceholders: [],
        layout: DEFERRAL_DEFAULT_CARD_LAYOUTS[scenarioId],
    };
}

export const DEFAULT_DEFERRAL_CARD_TEMPLATES: Record<DeferralScenarioId, DeferralCardTemplate> = {
    ban_temporary: buildDefaultDeferralTemplate('ban_temporary'),
    ban_permanent: buildDefaultDeferralTemplate('ban_permanent'),
    whitelist_pending: buildDefaultDeferralTemplate('whitelist_pending'),
    whitelist_schedule_closed: buildDefaultDeferralTemplate('whitelist_schedule_closed'),
    whitelist_admin_denied: buildDefaultDeferralTemplate('whitelist_admin_denied'),
    whitelist_admin_insufficient_ids: buildDefaultDeferralTemplate('whitelist_admin_insufficient_ids'),
    whitelist_discord_member_denied: buildDefaultDeferralTemplate('whitelist_discord_member_denied'),
    whitelist_discord_member_insufficient_ids: buildDefaultDeferralTemplate('whitelist_discord_member_insufficient_ids'),
    whitelist_discord_roles_not_member: buildDefaultDeferralTemplate('whitelist_discord_roles_not_member'),
    whitelist_discord_roles_no_roles: buildDefaultDeferralTemplate('whitelist_discord_roles_no_roles'),
    whitelist_discord_roles_insufficient_ids: buildDefaultDeferralTemplate('whitelist_discord_roles_insufficient_ids'),
    whitelist_insufficient_license: buildDefaultDeferralTemplate('whitelist_insufficient_license'),
    whitelist_error: buildDefaultDeferralTemplate('whitelist_error'),
    connection_queue: buildDefaultDeferralTemplate('connection_queue'),
    access_denied: buildDefaultDeferralTemplate('access_denied'),
};

export const DEFAULT_DEFERRAL_CARDS_CONFIG: DeferralCardsConfig = {
    skin: { showLogo: true },
    discordInvite: DEFERRAL_DEFAULT_DISCORD_INVITE,
    sharedCustomPlaceholders: [],
    scenarios: DEFAULT_DEFERRAL_CARD_TEMPLATES,
    addonScenarios: {},
};

/**
 * Merges stored config with defaults for every known scenario.
 */
export function normalizeDeferralCardsConfig(
    input: unknown,
    legacySingleCard?: DeferralCardTemplate,
): DeferralCardsConfig {
    const parsed = DeferralCardsConfigSchema.safeParse(input);
    const base = parsed.success
        ? parsed.data
        : {
              skin: { showLogo: true },
              sharedCustomPlaceholders: [],
              scenarios: {} as Record<DeferralScenarioId, DeferralCardTemplate>,
          };

    let sharedCustomPlaceholders = normalizeCustomPlaceholders(base.sharedCustomPlaceholders ?? []);
    if (sharedCustomPlaceholders.length === 0) {
        sharedCustomPlaceholders = normalizeCustomPlaceholders(
            base.scenarios?.whitelist_pending?.customPlaceholders ?? [],
        );
    }

    const baseInvite = (base as Partial<DeferralCardsConfig>).discordInvite;
    let discordInvite = typeof baseInvite === 'string' && baseInvite.trim() ? baseInvite.trim() : '';
    if (!discordInvite) {
        const legacyInvite = sharedCustomPlaceholders.find((p) => p.key === 'discordInvite')?.value?.trim();
        if (legacyInvite) discordInvite = legacyInvite;
    }
    if (!discordInvite) {
        discordInvite = DEFERRAL_DEFAULT_DISCORD_INVITE;
    }

    const scenarios = { ...DEFAULT_DEFERRAL_CARD_TEMPLATES };
    for (const { id } of DEFERRAL_SCENARIO_META) {
        if (base.scenarios[id]) {
            scenarios[id] = {
                ...scenarios[id],
                ...base.scenarios[id],
                customPlaceholders: normalizeCustomPlaceholders(
                    base.scenarios[id].customPlaceholders ?? scenarios[id].customPlaceholders,
                ),
            };
        }
    }

    if (legacySingleCard) {
        scenarios.whitelist_pending = {
            ...scenarios.whitelist_pending,
            ...legacySingleCard,
        };
    }

    // Upgrade untouched legacy bland or fancy shipped defaults to txAdmin-style presets.
    for (const { id } of DEFERRAL_SCENARIO_META) {
        if (shouldResetToClassicDeferralTemplate(id, scenarios[id])) {
            scenarios[id] = { ...DEFAULT_DEFERRAL_CARD_TEMPLATES[id] };
        }
    }

    const addonScenarios = normalizeAddonDeferralScenarios(
        parsed.success
            ? (parsed.data as DeferralCardsConfig).addonScenarios
            : (input as DeferralCardsConfig)?.addonScenarios,
    );

    return applySharedPlaceholdersToDeferralConfig({
        skin: { ...base.skin, showLogo: base.skin?.showLogo !== false },
        discordInvite,
        sharedCustomPlaceholders,
        scenarios,
        addonScenarios,
    });
}

/** Any scenario id — built-in enum or addon namespaced id. */
export type DeferralAnyScenarioId = DeferralScenarioId | (string & {});
