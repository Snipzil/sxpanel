import { z } from 'zod';
import { typeDefinedConfig } from './utils';
import { SYM_FIXER_DEFAULT } from '@lib/symbols';

const customTagSchema = z.object({
    id: z
        .string()
        .min(1)
        .max(32)
        .regex(/^[a-z0-9_]+$/),
    label: z.string().min(1).max(24),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    priority: z.number().int().min(1).max(999),
    enabled: z.boolean().default(true),
});
export type CustomTagConfig = z.infer<typeof customTagSchema>;

const reportsEnabled = typeDefinedConfig({
    name: 'Reports Enabled',
    default: true,
    validator: z.boolean(),
    fixer: SYM_FIXER_DEFAULT,
});

const ticketCategories = typeDefinedConfig({
    name: 'Ticket Categories',
    default: ['Player Report', 'Bug Report', 'Question', 'Other'] as string[],
    validator: z.array(z.string().min(1).max(64)).min(1).max(20),
    fixer: SYM_FIXER_DEFAULT,
});

const ticketCategoryDescriptions = typeDefinedConfig({
    name: 'Ticket Category Descriptions',
    default: {
        'Player Report': 'Report a player for rule violations.',
        'Bug Report': 'Report a bug or server issue.',
        Question: 'Ask a question to staff.',
        Other: 'Anything else.',
    } as Record<string, string>,
    validator: z.record(z.string().min(1).max(128)),
    fixer: SYM_FIXER_DEFAULT,
});

const ticketPriorityEnabled = typeDefinedConfig({
    name: 'Ticket Priority Enabled',
    default: false,
    validator: z.boolean(),
    fixer: SYM_FIXER_DEFAULT,
});

const ticketFeedbackEnabled = typeDefinedConfig({
    name: 'Ticket Feedback Enabled',
    default: true,
    validator: z.boolean(),
    fixer: SYM_FIXER_DEFAULT,
});

const ticketRetentionDays = typeDefinedConfig({
    name: 'Ticket Retention Days',
    default: 30,
    validator: z.number().int().min(1).max(365),
    fixer: SYM_FIXER_DEFAULT,
});

const menuEnabled = typeDefinedConfig({
    name: 'Menu Enabled',
    default: true,
    validator: z.boolean(),
    fixer: SYM_FIXER_DEFAULT,
});

const menuAlignRight = typeDefinedConfig({
    name: 'Align Menu Right',
    default: false,
    validator: z.boolean(),
    fixer: SYM_FIXER_DEFAULT,
});

const menuPageKey = typeDefinedConfig({
    name: 'Menu Page Switch Key',
    default: 'Tab',
    validator: z.string().min(1),
    fixer: SYM_FIXER_DEFAULT,
});

const playerModePtfx = typeDefinedConfig({
    name: 'Player Mode Change Effect',
    default: true,
    validator: z.boolean(),
    fixer: SYM_FIXER_DEFAULT,
});

const hideAdminInPunishments = typeDefinedConfig({
    name: 'Hide Admin Name In Punishments',
    default: true,
    validator: z.boolean(),
    fixer: SYM_FIXER_DEFAULT,
});

const hideAdminInMessages = typeDefinedConfig({
    name: 'Hide Admin Name In Messages',
    default: false,
    validator: z.boolean(),
    fixer: SYM_FIXER_DEFAULT,
});

const hideDefaultAnnouncement = typeDefinedConfig({
    name: 'Hide Announcement Notifications',
    default: false,
    validator: z.boolean(),
    fixer: SYM_FIXER_DEFAULT,
});

const hideDefaultDirectMessage = typeDefinedConfig({
    name: 'Hide Direct Message Notification',
    default: false,
    validator: z.boolean(),
    fixer: SYM_FIXER_DEFAULT,
});

const hideDefaultWarning = typeDefinedConfig({
    name: 'Hide Warning Notification',
    default: false,
    validator: z.boolean(),
    fixer: SYM_FIXER_DEFAULT,
});

const hideDefaultScheduledRestartWarning = typeDefinedConfig({
    name: 'Hide Scheduled Restart Warnings',
    default: false,
    validator: z.boolean(),
    fixer: SYM_FIXER_DEFAULT,
});

const newplayerThreshold = typeDefinedConfig({
    name: 'New Player Tag Threshold (minutes)',
    default: 240,
    validator: z.number().int().min(0),
    fixer: SYM_FIXER_DEFAULT,
});

const customTags = typeDefinedConfig({
    name: 'Custom Player Tags',
    default: [] as CustomTagConfig[],
    validator: z.array(customTagSchema).max(20),
    fixer: SYM_FIXER_DEFAULT,
});

export default {
    reportsEnabled,
    ticketCategories,
    ticketCategoryDescriptions,
    ticketPriorityEnabled,
    ticketFeedbackEnabled,
    ticketRetentionDays,
    menuEnabled,
    menuAlignRight,
    menuPageKey,
    playerModePtfx,
    hideAdminInPunishments,
    hideAdminInMessages,
    hideDefaultAnnouncement,
    hideDefaultDirectMessage,
    hideDefaultWarning,
    hideDefaultScheduledRestartWarning,
    newplayerThreshold,
    customTags,
} as const;
