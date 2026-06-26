import { z } from 'zod';

export const WHITELIST_DEFAULT_WORKFLOW_ID = 'default';

export const WhitelistWorkflowTypeSchema = z.enum([
    'disabled',
    'auto_admin',
    'auto_discord_member',
    'auto_discord_role',
    'manual_review',
    /** fxPanel does not enforce joins; use for third-party allowlists + server browser padlock. */
    'external_whitelist',
]);
export type WhitelistWorkflowType = z.infer<typeof WhitelistWorkflowTypeSchema>;

export const WhitelistWorkflowSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: WhitelistWorkflowTypeSchema,
    discordRoleIds: z.array(z.string()).optional(),
    formId: z.string().optional(),
    discordReviewChannelId: z.string().optional(),
});
export type WhitelistWorkflow = z.infer<typeof WhitelistWorkflowSchema>;

export const WhitelistFormQuestionSchema = z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    required: z.boolean().default(true),
    type: z.enum(['text', 'textarea']).default('text'),
});
export type WhitelistFormQuestion = z.infer<typeof WhitelistFormQuestionSchema>;

export const WhitelistFormSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    questions: z.array(WhitelistFormQuestionSchema),
});
export type WhitelistForm = z.infer<typeof WhitelistFormSchema>;

export { WhitelistDeferralCardSchema, type WhitelistDeferralCard } from './deferralCardTypes';
export {
    DeferralCardsConfigSchema,
    type DeferralCardsConfig,
    type DeferralCardTemplate,
    type DeferralScenarioId,
    DEFAULT_DEFERRAL_CARDS_CONFIG,
    DEFERRAL_SCENARIO_META,
    normalizeDeferralCardsConfig,
} from './deferralCardTypes';

/** FiveM/RedM server browser allowlist padlock + instructions (sv_* convars). */
export const WhitelistServerBrowserSchema = z.object({
    appearInServerBrowser: z.boolean().default(false),
    serverBrowserInstructions: z.string().max(512).default(''),
});
export type WhitelistServerBrowser = z.infer<typeof WhitelistServerBrowserSchema>;

export const WhitelistScheduleWindowSchema = z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(0).max(23),
});
export type WhitelistScheduleWindow = z.infer<typeof WhitelistScheduleWindowSchema>;

export const WhitelistScheduleSchema = z.object({
    enabled: z.boolean().default(false),
    timezone: z.string().default('UTC'),
    windows: z.array(WhitelistScheduleWindowSchema).default([]),
    closedMessage: z.string().default('Whitelist applications are currently closed.'),
});
export type WhitelistSchedule = z.infer<typeof WhitelistScheduleSchema>;

export const WhitelistWebhookSchema = z.object({
    id: z.string().min(1),
    url: z.string().url(),
    events: z.array(z.string()).default([]),
    enabled: z.boolean().default(true),
});
export type WhitelistWebhook = z.infer<typeof WhitelistWebhookSchema>;

export const WhitelistApplicationStatusSchema = z.enum(['pending', 'approved', 'denied', 'withdrawn']);
export type WhitelistApplicationStatus = z.infer<typeof WhitelistApplicationStatusSchema>;

export const WhitelistEntrySourceSchema = z.enum(['manual', 'auto', 'application']);
export type WhitelistEntrySource = z.infer<typeof WhitelistEntrySourceSchema>;

export const WhitelistEventTypeSchema = z.enum([
    'application.created',
    'application.approved',
    'application.denied',
    'application.withdrawn',
    'entry.granted',
    'entry.revoked',
    'entry.consumed',
]);
export type WhitelistEventType = z.infer<typeof WhitelistEventTypeSchema>;

export type LegacyWhitelistMode = 'disabled' | 'adminOnly' | 'approvedLicense' | 'discordMember' | 'discordRoles';

export const DEFAULT_WHITELIST_WORKFLOW: WhitelistWorkflow = {
    id: WHITELIST_DEFAULT_WORKFLOW_ID,
    name: 'Manual Review',
    type: 'manual_review',
};

export function workflowFromLegacyMode(
    mode: LegacyWhitelistMode,
    discordRoles: string[] = [],
): { enabled: boolean; workflow: WhitelistWorkflow } {
    if (mode === 'disabled') {
        return {
            enabled: false,
            workflow: { ...DEFAULT_WHITELIST_WORKFLOW, type: 'disabled' },
        };
    }
    if (mode === 'adminOnly') {
        return {
            enabled: true,
            workflow: {
                ...DEFAULT_WHITELIST_WORKFLOW,
                id: WHITELIST_DEFAULT_WORKFLOW_ID,
                name: 'Admin Only',
                type: 'auto_admin',
            },
        };
    }
    if (mode === 'discordMember') {
        return {
            enabled: true,
            workflow: {
                ...DEFAULT_WHITELIST_WORKFLOW,
                id: WHITELIST_DEFAULT_WORKFLOW_ID,
                name: 'Discord Member',
                type: 'auto_discord_member',
            },
        };
    }
    if (mode === 'discordRoles') {
        return {
            enabled: true,
            workflow: {
                ...DEFAULT_WHITELIST_WORKFLOW,
                id: WHITELIST_DEFAULT_WORKFLOW_ID,
                name: 'Discord Roles',
                type: 'auto_discord_role',
                discordRoleIds: discordRoles,
            },
        };
    }
    return {
        enabled: true,
        workflow: { ...DEFAULT_WHITELIST_WORKFLOW, type: 'manual_review' },
    };
}
