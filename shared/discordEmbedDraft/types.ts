import { z } from 'zod';

export const DiscordEmbedFieldDraftSchema = z.object({
    id: z.string().min(1),
    name: z.string().default(''),
    value: z.string().default(''),
    inline: z.boolean().optional(),
});
export type DiscordEmbedFieldDraft = z.infer<typeof DiscordEmbedFieldDraftSchema>;

export const DiscordLinkButtonDraftSchema = z.object({
    id: z.string().min(1),
    label: z.string().default(''),
    url: z.string().default(''),
    emoji: z.string().optional(),
});
export type DiscordLinkButtonDraft = z.infer<typeof DiscordLinkButtonDraftSchema>;

export const DiscordEmbedDraftSchema = z.object({
    title: z.string().optional(),
    url: z.string().optional(),
    description: z.string().optional(),
    color: z.string().optional(),
    thumbnailUrl: z.string().optional(),
    imageUrl: z.string().optional(),
    footerText: z.string().optional(),
    footerIconUrl: z.string().optional(),
    fields: z.array(DiscordEmbedFieldDraftSchema).default([]),
    extra: z.record(z.string(), z.unknown()).default({}),
});
export type DiscordEmbedDraft = z.infer<typeof DiscordEmbedDraftSchema>;

export const DiscordEmbedConfigDraftSchema = z.object({
    onlineColor: z.string().default('#0BA70B'),
    partialColor: z.string().default('#FFF100'),
    offlineColor: z.string().default('#A70B28'),
    onlineString: z.string().optional(),
    partialString: z.string().optional(),
    offlineString: z.string().optional(),
    playerLineTemplate: z.string().optional(),
    playerInlineTemplate: z.string().optional(),
    playerColumnTemplate: z.string().optional(),
    playerColumnCount: z.number().int().positive().optional(),
    playersPerColumn: z.number().int().positive().optional(),
    maxPlayersShown: z.number().int().positive().optional(),
    playerListSeparator: z.string().optional(),
    playerListInlineSeparator: z.string().optional(),
    showPagerButtons: z.boolean().optional(),
    pagerPrevLabel: z.string().optional(),
    pagerNextLabel: z.string().optional(),
    pagerPageLabelTemplate: z.string().optional(),
    emptyPlayerListString: z.string().optional(),
    buttons: z.array(DiscordLinkButtonDraftSchema).default([]),
    extra: z.record(z.string(), z.unknown()).default({}),
});
export type DiscordEmbedConfigDraft = z.infer<typeof DiscordEmbedConfigDraftSchema>;

export type DiscordEmbedEditorVariant = 'status' | 'playerList';

export const createDraftId = () => `draft_${Math.random().toString(36).slice(2, 10)}`;
