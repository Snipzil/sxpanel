import { z } from 'zod';

export const QueueRuleSchema = z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    discordRoleIds: z.array(z.string()).default([]),
    /**
     * Higher values mean higher priority.
     * Best-priority-wins when matching multiple rules.
     */
    priority: z.number().int().default(0),
});
export type QueueRule = z.infer<typeof QueueRuleSchema>;

export const QueueSlotPoolSchema = z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    slots: z.number().int().nonnegative().default(0),
    /** fxPanel admins may use this pool when public slots are full. */
    staffCanAccess: z.boolean().default(false),
    /** Queue rule IDs whose Discord roles grant access to this pool. */
    ruleIds: z.array(z.string()).default([]),
});
export type QueueSlotPool = z.infer<typeof QueueSlotPoolSchema>;

export const QueueConfigSchema = z.object({
    enabled: z.boolean().default(false),
    rules: z.array(QueueRuleSchema).default([]),
    pools: z.array(QueueSlotPoolSchema).default([]),
    maxConcurrentDeferrals: z.number().int().min(1).max(500).default(100),
});
export type QueueConfig = z.infer<typeof QueueConfigSchema>;

export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
    enabled: false,
    rules: [],
    pools: [],
    maxConcurrentDeferrals: 100,
};

export type QueuePlayerAccessContext = {
    roleSet: Set<string>;
    isPanelAdmin: boolean;
};

/** Queue rules linked to a pool that the player matches (Discord roles). */
export function getMatchingRuleIdsForPool(pool: QueueSlotPool, rules: QueueRule[], roleSet: Set<string>): string[] {
    const ruleById = new Map(rules.map((r) => [r.id, r]));
    const matched: string[] = [];
    for (const ruleId of pool.ruleIds ?? []) {
        const rule = ruleById.get(ruleId);
        if (!rule?.discordRoleIds?.length) continue;
        if (rule.discordRoleIds.some((id) => roleSet.has(id))) {
            matched.push(ruleId);
        }
    }
    return matched;
}

export function playerCanAccessPool(pool: QueueSlotPool, rules: QueueRule[], ctx: QueuePlayerAccessContext): boolean {
    if (pool.staffCanAccess && ctx.isPanelAdmin) return true;
    return getMatchingRuleIdsForPool(pool, rules, ctx.roleSet).length > 0;
}

/** Pool IDs this player may use (config order). */
export function getPlayerEligiblePoolIds(
    pools: QueueSlotPool[],
    rules: QueueRule[],
    ctx: QueuePlayerAccessContext,
): string[] {
    return pools.filter((pool) => playerCanAccessPool(pool, rules, ctx)).map((p) => p.id);
}

/** First eligible pool in config order that still has free capacity. */
export function pickPoolWithCapacity(
    eligiblePoolIds: string[],
    pools: QueueSlotPool[],
    poolUsed: Record<string, number>,
): string | null {
    const eligible = new Set(eligiblePoolIds);
    for (const pool of pools) {
        if (!eligible.has(pool.id)) continue;
        const used = poolUsed[pool.id] ?? 0;
        if (used < pool.slots) return pool.id;
    }
    return null;
}

export function sumPoolSlots(pools: QueueSlotPool[]): number {
    return pools.reduce((sum, pool) => sum + (pool.slots > 0 ? pool.slots : 0), 0);
}

/**
 * Migrates legacy single-pool / per-rule reserved flags into `pools[]`.
 */
export function migrateQueueConfig(input: unknown): QueueConfig {
    const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    const {
        reservedAccess: _legacyAccess,
        reservedSlots: legacyReservedSlots,
        panelAdminsCanUseReserved: legacyPanelAdmins,
        ...rest
    } = raw;

    const parsed = QueueConfigSchema.safeParse(rest);
    let config: QueueConfig = parsed.success
        ? parsed.data
        : { ...DEFAULT_QUEUE_CONFIG, ...(rest as Partial<QueueConfig>) };

    config = {
        ...DEFAULT_QUEUE_CONFIG,
        ...config,
        rules: (config.rules ?? []).map((rule) => {
            const { canAccessReservedSlots: _drop, ...ruleRest } = rule as QueueRule & {
                canAccessReservedSlots?: boolean;
            };
            return QueueRuleSchema.parse(ruleRest);
        }),
        pools: Array.isArray(config.pools) ? config.pools : [],
    };

    if (config.pools.length > 0) {
        return config;
    }

    const reservedSlots = typeof legacyReservedSlots === 'number' && legacyReservedSlots > 0 ? legacyReservedSlots : 0;
    const panelAdmins = legacyPanelAdmins === true;
    const rulesWithReserved = config.rules.filter(
        (r) => (r as QueueRule & { canAccessReservedSlots?: boolean }).canAccessReservedSlots === true,
    );

    if (!reservedSlots && !panelAdmins && !rulesWithReserved.length) {
        return config;
    }

    const pools: QueueSlotPool[] = [];
    if (panelAdmins && reservedSlots > 0 && !rulesWithReserved.length) {
        pools.push({
            id: 'staff-pool',
            label: 'Staff',
            slots: reservedSlots,
            staffCanAccess: true,
            ruleIds: [],
        });
    } else if (reservedSlots > 0) {
        pools.push({
            id: 'reserved-pool',
            label: 'Reserved',
            slots: reservedSlots,
            staffCanAccess: panelAdmins,
            ruleIds: rulesWithReserved.map((r) => r.id),
        });
    }

    return { ...config, pools };
}
