import { z } from 'zod';

const ENTRY_LABEL_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

export const telemetryGameNameSchema = z.enum(['fivem', 'redm']);

export const telemetryInventoryEntrySchema = z
    .object({
        name: z.string().regex(ENTRY_LABEL_REGEX),
        status: z.enum(['started', 'stopped']),
    })
    .strict();

export const telemetryInventorySchema = z
    .object({
        total: z.number().int().min(0).max(10_000),
        started: z.number().int().min(0).max(10_000),
        stopped: z.number().int().min(0).max(10_000),
        labels: z.array(z.string().regex(ENTRY_LABEL_REGEX)).max(200).optional(),
        entries: z.array(telemetryInventoryEntrySchema).max(200).optional(),
    })
    .strict();

export const telemetryServerSchema = z
    .object({
        os: z.string().max(32),
        name: z.string().max(128).optional(),
        playerSlots: z.number().int().min(0).max(2048),
        currentPlayers: z.number().int().min(0).max(2048),
        projectName: z.string().max(128).optional(),
        gameName: telemetryGameNameSchema.optional(),
        cfxId: z.string().max(64).optional(),
    })
    .strict();

export const telemetryStatsBlockSchema = z
    .object({
        totalUniquePlayers: z.number().int().min(0).max(1_000_000),
        totalPlayTimeSeconds: z.number().int().min(0).max(100_000_000_000),
    })
    .strict();

/** Owner-dashboard-only fields (not shown on public /stats). */
export const telemetryDashboardFeaturesSchema = z
    .object({
        discordBot: z.boolean(),
        banlist: z.boolean(),
        whitelist: z.boolean(),
        menuEnabled: z.boolean(),
    })
    .strict();

export const telemetryDashboardModerationSchema = z
    .object({
        bans: z.number().int().min(0).max(10_000_000),
        warns: z.number().int().min(0).max(10_000_000),
        kicks: z.number().int().min(0).max(10_000_000),
        whitelists: z.number().int().min(0).max(10_000_000),
    })
    .strict();

export const telemetryDashboardBlockSchema = z
    .object({
        fxsVersion: z.number().int().min(0).max(999999).optional(),
        locale: z.string().max(16).optional(),
        panelUptimeSeconds: z.number().int().min(0).max(100_000_000).optional(),
        panelUrl: z.string().url().max(512).optional(),
        adminCount: z.number().int().min(0).max(10_000).optional(),
        features: telemetryDashboardFeaturesSchema.optional(),
        moderation: telemetryDashboardModerationSchema.optional(),
    })
    .strict();

export const telemetryPostBodySchema = z
    .object({
        installId: z.string().max(64),
        version: z.string().max(32),
        timestamp: z.number().int().min(0),
        server: telemetryServerSchema,
        stats: telemetryStatsBlockSchema,
        inventory: telemetryInventorySchema.optional(),
        dashboard: telemetryDashboardBlockSchema.optional(),
    })
    .strict()
    .superRefine((data, ctx) => {
        if (data.server.currentPlayers > data.server.playerSlots) {
            ctx.addIssue({
                code: 'custom',
                message: 'currentPlayers exceeds playerSlots',
                path: ['server', 'currentPlayers'],
            });
        }
    });

export type TelemetryPostBody = z.infer<typeof telemetryPostBodySchema>;
export type TelemetryDashboardBlock = z.infer<typeof telemetryDashboardBlockSchema>;
export type TelemetryInventoryEntry = z.infer<typeof telemetryInventoryEntrySchema>;

export const telemetryStatsResponseSchema = z
    .object({
        success: z.literal(true),
    })
    .strict();

export type TelemetryStatsResponse = z.infer<typeof telemetryStatsResponseSchema>;

export const ENTRY_LABEL_PATTERN = ENTRY_LABEL_REGEX;
