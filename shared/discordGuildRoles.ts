import { z } from 'zod';

export const DiscordGuildRoleOptionSchema = z.object({
    id: z.string().min(1),
    name: z.string(),
    color: z.string().nullable(),
    position: z.number().int(),
});

export type DiscordGuildRoleOption = z.infer<typeof DiscordGuildRoleOptionSchema>;

export const DiscordGuildRolesRespSchema = z.object({
    roles: z.array(DiscordGuildRoleOptionSchema),
});

export type DiscordGuildRolesResp = z.infer<typeof DiscordGuildRolesRespSchema>;
