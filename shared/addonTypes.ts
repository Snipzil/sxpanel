import { z } from 'zod';

//============================================
// Addon Permissions (hoisted for manifest schema)
//============================================

/**
 * Enforceable addon permissions.
 *
 * SECURITY NOTE: Addon processes run as full Node.js processes via child_process.fork(),
 * so any permission that depends purely on the addon's *own* behaviour (e.g. outbound HTTP,
 * filesystem, spawning children) cannot be meaningfully gated here. Only permissions that
 * are enforced server-side in the core (on IPC boundaries) are listed here so that the
 * approval UI cannot advertise gates that do not exist.
 *
 * - `storage`       — gates the addon's KV storage IPC ops
 * - `players.read`  — gates read access to player data and player events
 * - `players.write` — gates the players.addTag / removeTag API calls
 * - `ws.push`       — gates server → client WebSocket push events
 *
 * Approval of an addon still implies full trust: an approved addon is equivalent to code
 * running inside the txAdmin host process for purposes that are not on an IPC boundary.
 */
export const ADDON_PERMISSIONS = ['storage', 'players.read', 'players.write', 'ws.push'] as const;

export type AddonPermission = (typeof ADDON_PERMISSIONS)[number];
const AddonPermissionSchema = z.enum(ADDON_PERMISSIONS);

//============================================
// Addon Manifest Schema
//============================================

const addonIdRegex = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

export const AddonPageSchema = z.object({
    path: z.string().min(1),
    title: z.string().min(1).max(64),
    icon: z.string().optional(),
    sidebar: z.boolean().default(false),
    sidebarGroup: z.string().max(32).optional(),
    permission: z.string().optional(),
    component: z.string().min(1),
});

export const AddonWidgetSchema = z.object({
    slot: z
        .string()
        .min(1)
        .max(128)
        .regex(
            /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/,
            'Slot must be dot-separated lowercase segments (e.g. "dashboard.main", "settings.tab.discord")',
        ),
    component: z.string().min(1),
    title: z.string().min(1).max(64),
    defaultSize: z.enum(['full', 'half', 'quarter']).default('half'),
    permission: z.string().optional(),
});

export const AddonNuiPageSchema = z.object({
    id: z.string().min(1),
    title: z.string().min(1).max(64),
    icon: z.string().optional(),
    component: z.string().min(1),
    permission: z.string().optional(),
});

const isSafeAddonRelativePath = (value: string) => {
    if (/^[a-zA-Z]:[\\/]/.test(value)) return false;
    if (value.startsWith('/') || value.startsWith('\\')) return false;

    return !value.split(/[\\/]+/).some((segment) => segment === '..');
};

const addonRelativePathSchema = z
    .string()
    .trim()
    .min(1)
    .refine((value) => isSafeAddonRelativePath(value), {
        message: 'Path must be addon-relative and must not escape the addon directory',
    });

export const AddonDiscordRateLimitSchema = z.object({
    max: z.number().int().min(1).max(1000),
    windowMs: z.number().int().min(1_000).max(3_600_000),
});

export const AddonDiscordBotSchema = z
    .object({
        commands: addonRelativePathSchema.optional(),
        events: addonRelativePathSchema.optional(),
        rateLimit: AddonDiscordRateLimitSchema.optional(),
    })
    .refine((value) => value.commands || value.events, {
        message: 'discordBot must declare at least one of commands or events',
    });

export const AddonManifestSchema = z.object({
    // Identity
    id: z.string().regex(addonIdRegex, 'Addon ID must be 3-64 chars, lowercase alphanumeric + hyphens'),
    name: z.string().min(1).max(64),
    description: z.string().max(256),
    version: z
        .string()
        .regex(
            /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[0-9]*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|[0-9]*[a-zA-Z-][0-9a-zA-Z-]*))*)?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/,
            'Version must be semver',
        ),
    author: z.string().min(1).max(64),
    homepage: z.string().url().optional(),
    license: z.string().optional(),

    // Compatibility
    fxpanel: z.object({
        minVersion: z.string(),
        maxVersion: z.string().optional(),
    }),

    // Addon dependencies (other addon IDs that must be running)
    dependencies: z.array(z.string().regex(addonIdRegex)).default([]),

    // Permissions
    permissions: z.object({
        required: z.array(AddonPermissionSchema).default([]),
        optional: z.array(AddonPermissionSchema).default([]),
    }),

    // Custom admin permissions this addon registers
    adminPermissions: z
        .array(
            z.object({
                id: z
                    .string()
                    .min(1)
                    .max(64)
                    .regex(
                        /^[a-z][a-z0-9._-]*$/,
                        'Permission ID must be lowercase alphanumeric with dots, hyphens, or underscores',
                    ),
                label: z.string().min(1).max(64),
                description: z.string().max(256),
            }),
        )
        .default([]),

    // Entry points
    server: z
        .object({
            entry: z.string(),
        })
        .optional(),

    panel: z
        .object({
            entry: z.string(),
            styles: z.string().optional(),
            pages: z.array(AddonPageSchema).default([]),
            widgets: z.array(AddonWidgetSchema).default([]),
            settingsComponent: z.string().optional(),
        })
        .optional(),

    nui: z
        .object({
            entry: z.string(),
            styles: z.string().optional(),
            pages: z.array(AddonNuiPageSchema).default([]),
        })
        .optional(),

    discordBot: AddonDiscordBotSchema.optional(),

    resource: z
        .object({
            server_scripts: z.array(z.string()).default([]),
            client_scripts: z.array(z.string()).default([]),
        })
        .optional(),

    // Public route support (unauthenticated HTTP)
    publicRoutes: z.boolean().default(false),
    publicServer: z
        .object({
            defaultPort: z.number().int().min(1).max(65535),
        })
        .optional(),
});

export type AddonManifest = z.infer<typeof AddonManifestSchema>;

//============================================
// Addon State
//============================================

export const ADDON_STATES = [
    'discovered',
    'validating',
    'approved',
    'starting',
    'running',
    'stopping',
    'stopped',
    'invalid',
    'failed',
    'crashed',
] as const;

export type AddonState = (typeof ADDON_STATES)[number];

//============================================
// Addon Config (addon-config.json)
//============================================

export const AddonApprovalSchema = z.object({
    granted: z.array(AddonPermissionSchema),
    approvedAt: z.string(),
    approvedBy: z.string(),
});

export const AddonConfigSchema = z.object({
    enabled: z.boolean().default(true),
    maxAddons: z.number().int().min(1).max(100).default(20),
    maxStorageMb: z.number().min(1).max(100).default(10),
    processTimeoutMs: z.number().int().min(1000).max(60000).default(10000),
    publicServerPort: z.number().int().min(0).max(65535).default(0),
    approved: z.record(z.string(), AddonApprovalSchema).default({}),
    disabled: z.array(z.string()).default([]),
});

export type AddonConfig = z.infer<typeof AddonConfigSchema>;
export type AddonApproval = z.infer<typeof AddonApprovalSchema>;

//============================================
// IPC Protocol
//============================================

export interface AddonIpcMessage {
    type: string;
    id?: string;
    payload: unknown;
}

// Route descriptor sent by addon on ready
export interface AddonRouteDescriptor {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    path: string;
}

// Core → Addon messages
export type CoreToAddonMessage =
    | { type: 'init'; payload: { addonId: string; permissions: string[] } }
    | { type: 'shutdown'; payload: Record<string, never> }
    | {
          type: 'http-request';
          id: string;
          payload: {
              method: string;
              path: string;
              headers: Record<string, string>;
              body: unknown;
              admin: { name: string; permissions: string[] };
          };
      }
    | {
          type: 'public-request';
          id: string;
          payload: { method: string; path: string; headers: Record<string, string>; body: unknown };
      }
    | { type: 'event'; payload: { event: string; data: unknown } }
    | { type: 'storage-response'; id: string; payload: { data: unknown; error?: string } }
    | { type: 'api-call-response'; id: string; payload: { data: unknown; error?: string } }
    | { type: 'ws-subscribe'; payload: { sessionId: string } }
    | { type: 'ws-unsubscribe'; payload: { sessionId: string } };

// Addon → Core messages
export type AddonToCoreMessage =
    | { type: 'ready'; payload: { routes: AddonRouteDescriptor[]; publicRoutes?: AddonRouteDescriptor[] } }
    | {
          type: 'http-response';
          id: string;
          payload: { status: number; headers?: Record<string, string>; body: unknown };
      }
    | {
          type: 'storage-request';
          id: string;
          payload: { op: 'get' | 'set' | 'delete' | 'list'; key?: string; value?: unknown };
      }
    | { type: 'api-call'; id: string; payload: { method: string; args: unknown[] } }
    | { type: 'ws-push'; payload: { event: string; data: unknown } }
    | { type: 'log'; payload: { level: 'info' | 'warn' | 'error'; message: string } }
    | { type: 'error'; payload: { message: string; stack?: string } };

//============================================
// Panel Manifest API Response
//============================================

export interface AddonPanelDescriptor {
    id: string;
    name: string;
    version: string;
    fxpanelMinVersion: string;
    entryUrl: string;
    stylesUrl: string | null;
    pages: z.infer<typeof AddonPageSchema>[];
    widgets: z.infer<typeof AddonWidgetSchema>[];
    settingsComponent: string | null;
}

export interface AddonNuiDescriptor {
    id: string;
    name: string;
    version: string;
    entryUrl: string;
    stylesUrl: string | null;
    pages: z.infer<typeof AddonNuiPageSchema>[];
}

export interface AddonDiscordBotDescriptor {
    id: string;
    name: string;
    commandsPath: string | null;
    eventsPath: string | null;
    rateLimit: z.infer<typeof AddonDiscordRateLimitSchema> | null;
}

export interface AddonListItem {
    id: string;
    name: string;
    description: string;
    version: string;
    author: string;
    state: AddonState;
    /** Optional human-readable reason for invalid/failed/crashed states. */
    lastError?: string;
    /** True when the addon was previously approved but now requires new permissions. */
    needsReapproval: boolean;
    /** True when the addon exports a settings component. */
    hasSettings: boolean;
    /** Other addon IDs this addon depends on. */
    dependencies: string[];
    permissions: {
        required: string[];
        optional: string[];
        granted: string[];
    };
}
