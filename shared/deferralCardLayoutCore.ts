import { z } from 'zod';
import type { DeferralCardTemplate } from './deferralCardTypes';
import { DeferralCardCanvasSchema } from './deferralCardCanvasSchema';
import { createDeferralBlockId } from './deferralCardIds';

/** Built-in dynamic tokens available in all deferral templates. */
export const DEFERRAL_BUILTIN_TOKEN_KEYS = [
    'requestId',
    'tierName',
    'customMessage',
    'guildName',
    'discordInvite',
    'serverName',
    'playerName',
    'queuePosition',
    'queueSize',
    'queueEta',
    'banReason',
    'banExpires',
    'banId',
    'banDate',
    'banAuthor',
] as const;

export type DeferralBuiltinTokenKey = (typeof DEFERRAL_BUILTIN_TOKEN_KEYS)[number];

export const DeferralCustomPlaceholderSchema = z.object({
    /** Token name without braces, e.g. `discordInvite` → `{discordInvite}` */
    key: z
        .string()
        .min(1)
        .max(48)
        .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Use letters, numbers, and underscores'),
    label: z.string().default(''),
    /** Static replacement at connect time (panel preview uses this value). */
    value: z.string().default(''),
});
export type DeferralCustomPlaceholder = z.infer<typeof DeferralCustomPlaceholderSchema>;

export const DeferralBlockTypeSchema = z.enum([
    'heading',
    'text',
    'paragraph',
    'rejection_message',
    'custom_text',
    'request_id',
    'tier_name',
    'spacer',
    'divider',
    'logo',
    'custom_image',
    'button',
    'ban_id',
    'ban_reason',
    'ban_expires',
]);
export type DeferralBlockType = z.infer<typeof DeferralBlockTypeSchema>;

export const DeferralLayoutBlockSchema = z.object({
    id: z.string().min(1),
    type: DeferralBlockTypeSchema,
    /** Text for heading/paragraph blocks; supports all tokens. */
    content: z.string().optional(),
    enabled: z.boolean().default(true),
});
export type DeferralLayoutBlock = z.infer<typeof DeferralLayoutBlockSchema>;

export const DeferralCardLayoutSchema = z.object({
    version: z.union([z.literal(1), z.literal(2)]).default(2),
    blocks: z.array(DeferralLayoutBlockSchema).default([]),
    /** Absolute-position canvas (visual studio). */
    canvas: DeferralCardCanvasSchema.optional(),
});
export type DeferralCardLayout = z.infer<typeof DeferralCardLayoutSchema>;

export const DEFERRAL_BLOCK_META: Record<
    DeferralBlockType,
    { label: string; description: string; defaultContent?: string }
> = {
    heading: { label: 'Title', description: 'Card heading (defaults to scenario title)', defaultContent: '' },
    text: {
        label: 'Text line',
        description: 'Single line (use one per sentence or field)',
        defaultContent: 'Your message here',
    },
    paragraph: {
        label: 'Paragraph',
        description: 'Rich text with tokens',
        defaultContent: 'Please join {guildName} and request to be whitelisted.',
    },
    rejection_message: {
        label: 'Rejection message',
        description: 'Shows the rejection message (the {customMessage} token)',
        defaultContent: '{customMessage}',
    },
    custom_text: {
        label: 'Custom text',
        description: 'Freeform text — write anything; supports placeholders and basic HTML',
        defaultContent: '',
    },
    request_id: { label: 'Request ID', description: 'Shows the player request ID when available' },
    ban_id: { label: 'Ban ID', description: 'Shows the active ban action ID' },
    ban_reason: {
        label: 'Ban reason',
        description: 'Shows the ban reason ({banReason}) when the player is banned',
    },
    ban_expires: {
        label: 'Ban expiry',
        description: 'Shows time until ban expires ({banExpires}); hidden for permanent bans',
    },
    tier_name: { label: 'Tier name', description: 'Shows whitelist tier when available' },
    spacer: { label: 'Spacer', description: 'Vertical gap' },
    divider: { label: 'Divider', description: 'Horizontal rule' },
    logo: { label: 'Watermark logo', description: 'fxPanel logo (respects global logo toggle)' },
    custom_image: {
        label: 'Custom image',
        description: 'Upload SVG, PNG, or GIF — shown on the deferral card',
        defaultContent: '',
    },
    button: {
        label: 'Button (link)',
        description: 'Clickable link styled as a button — opens in the player’s browser (http/https only)',
        defaultContent:
            '{"label":"Join Discord","url":"{discordInvite}","backgroundColor":"#5865F2","textColor":"#ffffff"}',
    },
};

export function normalizeCustomPlaceholders(input: unknown): DeferralCustomPlaceholder[] {
    const parsed = z.array(DeferralCustomPlaceholderSchema).safeParse(input);
    if (!parsed.success) return [];
    const seen = new Set<string>();
    const out: DeferralCustomPlaceholder[] = [];
    for (const row of parsed.data) {
        const key = row.key.trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({ key, label: row.label ?? key, value: row.value ?? '' });
    }
    return out;
}

export function templateHasVisualLayout(template: DeferralCardTemplate): boolean {
    return Boolean(template.layout?.canvas?.elements?.length || template.layout?.blocks?.length);
}

export { createDeferralBlockId } from './deferralCardIds';

export function createDefaultBlock(type: DeferralBlockType): DeferralLayoutBlock {
    const meta = DEFERRAL_BLOCK_META[type];
    return {
        id: createDeferralBlockId(),
        type,
        content: meta.defaultContent ?? '',
        enabled: true,
    };
}
