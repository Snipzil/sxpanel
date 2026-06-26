import { z } from 'zod';

//Player
export const DatabasePlayerSchema = z.object({
    license: z.string().min(1),
    ids: z.array(z.string()),
    hwids: z.array(z.string()),
    displayName: z.string(),
    pureName: z.string(),
    playTime: z.number().nonnegative(),
    tsLastConnection: z.number(),
    tsJoined: z.number(),
    tsWhitelisted: z.number().optional(),
    notes: z
        .object({
            text: z.string(),
            lastAdmin: z.string().nullable(),
            tsLastEdit: z.number().nullable(),
        })
        .optional(),
    nameHistory: z.array(z.string()).optional(),
    sessionHistory: z.array(z.tuple([z.string(), z.number()])).optional(),
    customTags: z.array(z.string()).optional(),
});

//Actions
const DatabaseActionBaseSchema = z.object({
    id: z.string().min(1),
    ids: z.array(z.string()),
    playerName: z.union([z.string(), z.literal(false)]),
    reason: z.string(),
    author: z.string(),
    timestamp: z.number(),
    revocation: z
        .object({
            timestamp: z.number(),
            author: z.string(),
        })
        .optional(),
});
export const DatabaseActionSchema = z.discriminatedUnion('type', [
    DatabaseActionBaseSchema.extend({
        type: z.literal('ban'),
        hwids: z.array(z.string()).optional(),
        expiration: z.union([z.number(), z.literal(false)]),
    }),
    DatabaseActionBaseSchema.extend({
        type: z.literal('warn'),
        acked: z.boolean(),
    }),
    DatabaseActionBaseSchema.extend({
        type: z.literal('kick'),
    }),
]);

//Whitelist
import {
    WhitelistApplicationStatusSchema,
    WhitelistEntrySourceSchema,
    WhitelistEventTypeSchema,
} from '@shared/whitelistTypes';

export const DatabaseWhitelistEntrySchema = z.object({
    identifier: z.string().min(1),
    tsGranted: z.number(),
    grantedBy: z.string(),
    source: WhitelistEntrySourceSchema,
    playerName: z.string(),
    playerAvatar: z.string().nullable(),
    license: z.string().optional(),
    tsFirstConnect: z.number().optional(),
});

export const DatabaseWhitelistApplicationSchema = z.object({
    id: z.string().min(1),
    license: z.string().min(1),
    status: WhitelistApplicationStatusSchema,
    workflowId: z.string().min(1),
    answers: z.record(z.string()).optional(),
    playerDisplayName: z.string(),
    playerPureName: z.string(),
    discordTag: z.string().optional(),
    discordAvatar: z.string().optional(),
    tsCreated: z.number(),
    tsLastAttempt: z.number(),
    tsDecided: z.number().optional(),
    decidedBy: z.string().optional(),
    discordThreadId: z.string().optional(),
});

export const DatabaseWhitelistEventSchema = z.object({
    id: z.string().min(1),
    type: WhitelistEventTypeSchema,
    ts: z.number(),
    license: z.string().optional(),
    applicationId: z.string().optional(),
    identifier: z.string().optional(),
    adminName: z.string().optional(),
    meta: z.record(z.unknown()).optional(),
});

/** @deprecated v8 compat */
export const DatabaseWhitelistApprovalSchema = z.object({
    identifier: z.string().min(1),
    playerName: z.string(),
    playerAvatar: z.string().nullable(),
    tsApproved: z.number(),
    approvedBy: z.string(),
});

/** @deprecated v8 compat */
export const DatabaseWhitelistRequestSchema = z.object({
    id: z.string().min(1),
    license: z.string().min(1),
    playerDisplayName: z.string(),
    playerPureName: z.string(),
    discordTag: z.string().optional(),
    discordAvatar: z.string().optional(),
    tsLastAttempt: z.number(),
});
