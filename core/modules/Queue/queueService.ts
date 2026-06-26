import { randomUUID } from 'node:crypto';
import consoleFactory from '@lib/console';
import { parsePlayerIds } from '@lib/player/idUtils';
import type { QueueRule, QueueSlotPool } from '@shared/queueTypes';
import {
    getPlayerEligiblePoolIds,
    pickPoolWithCapacity,
    sumPoolSlots,
    type QueuePlayerAccessContext,
} from '@shared/queueTypes';
import { renderDeferralQueueAdaptiveCard } from '@modules/Whitelist/deferralCard';

const console = consoleFactory('QueueService');

type QueueEntry = {
    id: string;
    joinedAt: number;
    lastSeenAt: number;
    playerName: string;
    priority: number;
    eligiblePoolIds: string[];
    /** Last adaptive card JSON sent to FiveM — skip presentCard when unchanged. */
    lastAdaptiveCard?: string;
};

type QueueSnapshot = {
    enabled: boolean;
    maxConcurrentDeferrals: number;
    rules: QueueRule[];
    pools: QueueSlotPool[];
};

const queue = new Map<string, QueueEntry>();

const cleanupStaleEntries = () => {
    const now = Date.now();
    for (const [id, entry] of queue.entries()) {
        if (now - entry.lastSeenAt > 10 * 60_000) {
            queue.delete(id);
        }
    }
};

const getMaxClients = () => {
    const cached = txCore.cacheStore.get('fxsRuntime:maxClients');
    if (typeof cached === 'number' && Number.isFinite(cached) && cached > 0) return cached;
    if (typeof cached === 'string' && /^\d+$/.test(cached)) {
        const parsed = Number.parseInt(cached, 10);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return 32;
};

const getQueueSnapshot = (): QueueSnapshot => {
    const cfg = txConfig.queue;
    return {
        enabled: cfg.enabled === true,
        maxConcurrentDeferrals: typeof cfg.maxConcurrentDeferrals === 'number' ? cfg.maxConcurrentDeferrals : 100,
        rules: Array.isArray(cfg.rules) ? cfg.rules : [],
        pools: Array.isArray(cfg.pools) ? cfg.pools : [],
    };
};

const resolveDiscordRoles = async (discordId: string) => {
    if (!txCore.discordBot?.isClientReady) return [] as string[];
    try {
        const res = await txCore.discordBot.resolveMemberRoles(discordId);
        if (!res?.isMember || !Array.isArray(res.memberRoles)) return [] as string[];
        return res.memberRoles.filter((v): v is string => typeof v === 'string' && v.length > 0);
    } catch (error) {
        console.verbose.warn(
            `Failed to resolve Discord roles: ${error instanceof Error ? error.message : String(error)}`,
        );
        return [] as string[];
    }
};

const buildAccessContext = async (playerIds: unknown): Promise<QueuePlayerAccessContext & { roleSet: Set<string> }> => {
    const { validIdsObject, validIdsArray } = parsePlayerIds(Array.isArray(playerIds) ? playerIds : []);
    const discordId = validIdsObject.discord;
    const memberRoles = discordId ? await resolveDiscordRoles(discordId) : [];
    return {
        roleSet: new Set(memberRoles),
        isPanelAdmin: Boolean(txCore.adminStore.getAdminByIdentifiers(validIdsArray)),
    };
};

const computeBestPriority = (rules: QueueRule[], roleSet: Set<string>) => {
    let bestPriority = 0;
    for (const rule of rules) {
        if (!rule.discordRoleIds?.length) continue;
        if (!rule.discordRoleIds.some((roleId) => roleSet.has(roleId))) continue;
        if (typeof rule.priority === 'number' && rule.priority > bestPriority) {
            bestPriority = rule.priority;
        }
    }
    return bestPriority;
};

const computePlayerQueueMeta = async (playerIds: unknown) => {
    const snapshot = getQueueSnapshot();
    const rules = snapshot.rules;
    const pools = snapshot.pools;

    if (!snapshot.enabled) {
        return { snapshot, priority: 0, eligiblePoolIds: [] as string[] };
    }

    const ctx = await buildAccessContext(playerIds);
    const priority = rules.length ? computeBestPriority(rules, ctx.roleSet) : 0;
    const eligiblePoolIds = pools.length ? getPlayerEligiblePoolIds(pools, rules, ctx) : [];

    return { snapshot, priority, eligiblePoolIds };
};

/** Assign each connected player to one pool (first eligible in config order) for occupancy. */
const countOnlinePoolUsage = async (snapshot: QueueSnapshot): Promise<Record<string, number>> => {
    const counts: Record<string, number> = {};
    for (const pool of snapshot.pools) {
        counts[pool.id] = 0;
    }

    const players = txCore.fxPlayerlist.getPlayerList();
    for (const player of players) {
        if (!player?.ids?.length) continue;
        const ctx = await buildAccessContext(player.ids);
        const eligible = getPlayerEligiblePoolIds(snapshot.pools, snapshot.rules, ctx);
        if (!eligible.length) continue;

        const assigned = pickPoolWithCapacity(eligible, snapshot.pools, counts);
        if (assigned) {
            counts[assigned] = (counts[assigned] ?? 0) + 1;
        }
    }

    return counts;
};

type AdmissionContext = {
    snapshot: QueueSnapshot;
    maxClients: number;
    publicSlots: number;
    onlineCount: number;
    poolUsed: Record<string, number>;
};

const buildAdmissionContext = async (): Promise<AdmissionContext> => {
    const snapshot = getQueueSnapshot();
    const maxClients = getMaxClients();
    const reservedTotal = sumPoolSlots(snapshot.pools);
    const publicSlots = Math.max(0, maxClients - reservedTotal);
    const onlineCount = txCore.fxPlayerlist.onlineCount;
    const poolUsed = snapshot.pools.length ? await countOnlinePoolUsage(snapshot) : {};

    return {
        snapshot,
        maxClients,
        publicSlots,
        onlineCount,
        poolUsed,
    };
};

const sortEntries = (entries: QueueEntry[]) => {
    return entries.sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return a.joinedAt - b.joinedAt;
    });
};

const entryHasPoolCapacity = (entry: QueueEntry, ctx: AdmissionContext) => {
    return pickPoolWithCapacity(entry.eligiblePoolIds, ctx.snapshot.pools, ctx.poolUsed) !== null;
};

const selectNextEligible = (entries: QueueEntry[], ctx: AdmissionContext) => {
    if (ctx.onlineCount >= ctx.maxClients) {
        return null;
    }

    const publicOpen = ctx.onlineCount < ctx.publicSlots;
    const eligible = publicOpen
        ? entries
        : entries.filter((e) => e.eligiblePoolIds.length > 0 && entryHasPoolCapacity(e, ctx));

    if (!eligible.length) {
        return null;
    }

    return sortEntries([...eligible])[0] ?? null;
};

export const queueJoin = async (input: { playerName: unknown; playerIds: unknown }) => {
    cleanupStaleEntries();

    const snapshot = getQueueSnapshot();
    if (!snapshot.enabled) {
        return { status: 'disabled' as const };
    }

    if (queue.size >= snapshot.maxConcurrentDeferrals) {
        return { status: 'bypass' as const };
    }

    const playerName = typeof input.playerName === 'string' ? input.playerName : 'Unknown';
    const meta = await computePlayerQueueMeta(input.playerIds);

    const id = randomUUID();
    const now = Date.now();
    queue.set(id, {
        id,
        joinedAt: now,
        lastSeenAt: now,
        playerName,
        priority: meta.priority,
        eligiblePoolIds: meta.eligiblePoolIds,
    });

    const polled = await queuePoll({ id });
    if (polled.status === 'wait') {
        return { ...polled, id };
    }
    if (polled.status === 'allow') {
        return { ...polled, id };
    }
    return polled;
};

export const queueLeave = (input: { id: unknown }) => {
    const id = typeof input.id === 'string' ? input.id : '';
    if (!id.length) return { ok: false as const };
    return { ok: queue.delete(id) };
};

export const queuePoll = async (input: { id: unknown }) => {
    cleanupStaleEntries();
    const id = typeof input.id === 'string' ? input.id : '';
    const entry = id ? queue.get(id) : undefined;
    if (!entry) {
        return { status: 'not_found' as const };
    }

    entry.lastSeenAt = Date.now();

    const ctx = await buildAdmissionContext();
    if (!ctx.snapshot.enabled) {
        queue.delete(entry.id);
        return { status: 'allow' as const };
    }

    const entries = [...queue.values()];
    const next = selectNextEligible(entries, ctx);

    if (next?.id === entry.id) {
        queue.delete(entry.id);
        return { status: 'allow' as const };
    }

    const publicOpen = ctx.onlineCount < ctx.publicSlots;
    const visibleEntries = publicOpen
        ? entries
        : entries.filter((e) => e.eligiblePoolIds.length > 0 && entryHasPoolCapacity(e, ctx));
    const sorted = sortEntries([...visibleEntries]);
    const idx = sorted.findIndex((e) => e.id === entry.id);
    const position = idx >= 0 ? idx + 1 : null;

    const adaptiveCard = await renderDeferralQueueAdaptiveCard({
        scenario: 'connection_queue',
        playerName: entry.playerName,
        queuePosition: position,
        queueSize: sorted.length,
        queueEta: '',
        body: '',
    });

    const cardChanged = adaptiveCard !== entry.lastAdaptiveCard;
    if (cardChanged) {
        entry.lastAdaptiveCard = adaptiveCard;
    }

    return {
        status: 'wait' as const,
        position,
        size: sorted.length,
        pollAfterMs: 5000,
        ...(cardChanged ? { adaptiveCard } : {}),
    };
};
