import { z } from 'zod';
import { typeDefinedConfig } from './utils';
import { SYM_FIXER_DEFAULT } from '@lib/symbols';
import {
    DEFAULT_WHITELIST_WORKFLOW,
    WHITELIST_DEFAULT_WORKFLOW_ID,
    DeferralCardsConfigSchema,
    DEFAULT_DEFERRAL_CARDS_CONFIG,
    normalizeDeferralCardsConfig,
    WhitelistDeferralCardSchema,
    WhitelistFormSchema,
    WhitelistScheduleSchema,
    WhitelistWebhookSchema,
    WhitelistWorkflowSchema,
    workflowFromLegacyMode,
    type LegacyWhitelistMode,
} from '@shared/whitelistTypes';

const defaultDeferralCard = {
    title: 'Not Whitelisted',
    bodyTemplate: 'Please join http://discord.gg/example and request to be whitelisted.',
    showRequestId: true,
    showTierName: false,
};

const defaultSchedule = {
    enabled: false,
    timezone: 'UTC',
    windows: [],
    closedMessage: 'Whitelist applications are currently closed.',
};

const enabled = typeDefinedConfig({
    name: 'Whitelist Enabled',
    default: false,
    validator: z.boolean(),
    fixer: SYM_FIXER_DEFAULT,
});

const workflows = typeDefinedConfig({
    name: 'Whitelist Workflows',
    default: [DEFAULT_WHITELIST_WORKFLOW],
    validator: z.array(WhitelistWorkflowSchema).min(1),
    fixer: (input: unknown) => {
        const raw = Array.isArray(input) ? input : [];
        const coerced = raw.map((item) => {
            if (!item || typeof item !== 'object') return item;
            const wf = item as Record<string, unknown>;
            if (wf.type === 'application_form') {
                const { formId: _formId, ...rest } = wf;
                return { ...rest, type: 'manual_review' };
            }
            return item;
        });
        const parsed = z.array(WhitelistWorkflowSchema).safeParse(coerced);
        if (parsed.success && parsed.data.length) return parsed.data;
        return [DEFAULT_WHITELIST_WORKFLOW];
    },
});

const activeWorkflowId = typeDefinedConfig({
    name: 'Active Whitelist Workflow',
    default: WHITELIST_DEFAULT_WORKFLOW_ID,
    validator: z.string().min(1),
    fixer: SYM_FIXER_DEFAULT,
});

const forms = typeDefinedConfig({
    name: 'Whitelist Application Forms',
    default: [],
    validator: z.array(WhitelistFormSchema),
    fixer: (input: unknown) => {
        const parsed = z.array(WhitelistFormSchema).safeParse(input);
        return parsed.success ? parsed.data : [];
    },
});

const deferralCard = typeDefinedConfig({
    name: 'Whitelist Deferral Card (legacy)',
    default: defaultDeferralCard,
    validator: WhitelistDeferralCardSchema,
    fixer: (input: unknown) => {
        const parsed = WhitelistDeferralCardSchema.safeParse(input);
        if (parsed.success) return parsed.data;
        return defaultDeferralCard;
    },
});

const deferralCards = typeDefinedConfig({
    name: 'Connection Deferral Cards',
    default: DEFAULT_DEFERRAL_CARDS_CONFIG,
    validator: DeferralCardsConfigSchema,
    fixer: (input: unknown) => normalizeDeferralCardsConfig(input),
});

const schedule = typeDefinedConfig({
    name: 'Whitelist Application Schedule',
    default: defaultSchedule,
    validator: WhitelistScheduleSchema,
    fixer: (input: unknown) => {
        const parsed = WhitelistScheduleSchema.safeParse(input);
        if (parsed.success) return parsed.data;
        return defaultSchedule;
    },
});

const webhooks = typeDefinedConfig({
    name: 'Whitelist Webhooks',
    default: [],
    validator: z.array(WhitelistWebhookSchema),
    fixer: (input: unknown) => {
        const parsed = z.array(WhitelistWebhookSchema).safeParse(input);
        return parsed.success ? parsed.data : [];
    },
});

/** @deprecated Mirrors `enabled` on save; runtime uses `whitelist.enabled` for the padlock. */
const appearInServerBrowser = typeDefinedConfig({
    name: 'Show Allowlist Icon In Server Browser',
    default: false,
    validator: z.boolean(),
    fixer: SYM_FIXER_DEFAULT,
});

const serverBrowserInstructions = typeDefinedConfig({
    name: 'Server Browser Allowlist Instructions',
    default: '',
    validator: z.string().max(512),
    fixer: (input: unknown) => {
        const text = typeof input === 'string' ? input.trim() : '';
        return text.slice(0, 512);
    },
});

export const migrateLegacyWhitelistConfig = (legacy: {
    mode?: LegacyWhitelistMode;
    rejectionMessage?: string;
    discordRoles?: string[];
}) => {
    const mode = (legacy.mode ?? 'disabled') as LegacyWhitelistMode;
    const { enabled: wlEnabled, workflow } = workflowFromLegacyMode(mode, legacy.discordRoles ?? []);
    const bodyTemplate =
        typeof legacy.rejectionMessage === 'string' && legacy.rejectionMessage.length
            ? legacy.rejectionMessage
            : defaultDeferralCard.bodyTemplate;
    const instructions =
        typeof legacy.rejectionMessage === 'string' && legacy.rejectionMessage.length
            ? legacy.rejectionMessage.slice(0, 512)
            : '';

    return {
        enabled: wlEnabled,
        workflows: [workflow],
        activeWorkflowId: workflow.id,
        forms: [],
        deferralCard: { ...defaultDeferralCard, bodyTemplate },
        deferralCards: normalizeDeferralCardsConfig(undefined, { ...defaultDeferralCard, bodyTemplate }),
        schedule: defaultSchedule,
        webhooks: [],
        appearInServerBrowser: wlEnabled,
        serverBrowserInstructions: instructions,
    };
};

export default {
    enabled,
    workflows,
    activeWorkflowId,
    forms,
    deferralCard,
    deferralCards,
    schedule,
    webhooks,
    appearInServerBrowser,
    serverBrowserInstructions,
} as const;
