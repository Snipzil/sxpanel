import { createHash } from 'node:crypto';

/** Optional detail fields for HTTP-reported roster rows (admin playerlist / map). */
export type ReportedPlayerSnapshot = {
    health?: number;
    x?: number;
    y?: number;
    vType?: number;
};

export type ReportedPlayerSnapshotInput = Partial<ReportedPlayerSnapshot>;

export type ResolvedReportedSnapshot = {
    health: number;
    vType: number;
    x?: number;
    y?: number;
};

/** Matches sv_playerlist.lua vTypeMap walking/automobile weighting. */
const DEFAULT_VTYPES = [0, 0, 0, 1, 1, 2, 3] as const;

const hashSeed = (id: number, seed: string): number => {
    const digest = createHash('sha256').update(`${seed}:${id}`).digest();
    return digest.readUInt32BE(0);
};

const clampHealth = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const clampCoord = (value: number) => Math.round(value);

const clampVType = (value: number) => Math.max(0, Math.min(8, Math.round(value)));

/**
 * Resolves health/vType in core; coords are left unset unless explicitly pushed
 * so the monitor resource can anchor rows near live player density.
 */
export const resolveReportedSnapshot = (
    id: number,
    _name: string,
    pushed?: ReportedPlayerSnapshotInput,
    seed = 'reported-detail',
): ResolvedReportedSnapshot => {
    const h = hashSeed(id, seed);

    const health =
        typeof pushed?.health === 'number' && Number.isFinite(pushed.health)
            ? clampHealth(pushed.health)
            : 68 + (h % 33);

    const vType =
        typeof pushed?.vType === 'number' && Number.isFinite(pushed.vType)
            ? clampVType(pushed.vType)
            : DEFAULT_VTYPES[h % DEFAULT_VTYPES.length];

    const result: ResolvedReportedSnapshot = { health, vType };

    const hasX = typeof pushed?.x === 'number' && Number.isFinite(pushed.x);
    const hasY = typeof pushed?.y === 'number' && Number.isFinite(pushed.y);
    if (hasX && hasY) {
        result.x = clampCoord(pushed!.x!);
        result.y = clampCoord(pushed!.y!);
    }

    return result;
};

export type SyntheticPlayerResourcePayload = {
    id: number;
    name: string;
    health: number;
    vType: number;
    x?: number;
    y?: number;
};

export type ResourceSyncPlayerInput = {
    id: number;
    name: string;
} & ReportedPlayerSnapshotInput;

/**
 * Builds the JSON array sent to txsv:updateSyntheticPlayers with resolved detail fields.
 */
export const buildResourceSyncPayload = (
    players: ResourceSyncPlayerInput[],
    seed: string,
): SyntheticPlayerResourcePayload[] =>
    players.map((player) => {
        const resolved = resolveReportedSnapshot(player.id, player.name, player, seed);
        const payload: SyntheticPlayerResourcePayload = {
            id: player.id,
            name: player.name,
            health: resolved.health,
            vType: resolved.vType,
        };
        if (resolved.x !== undefined && resolved.y !== undefined) {
            payload.x = resolved.x;
            payload.y = resolved.y;
        }
        return payload;
    });

/** Stable per-server-process seed for reported detail synthesis. */
export const getReportedDetailSeed = (): string => txCore.fxRunner?.child?.mutex ?? 'reported-detail';
