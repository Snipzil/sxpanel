import cleanPlayerName from '@shared/cleanPlayerName';
import { parsePlayerIds } from '@lib/player/idUtils';
import type { PlayerlistPlayerType, PlayerTag } from '@shared/socketioTypes';
import { z } from 'zod';

const httpPlayerSchema = z.object({
    id: z.coerce.number().int().positive(),
    name: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().min(1)),
    identifiers: z.array(z.string()).optional().default([]),
    health: z.coerce.number().finite().optional(),
    x: z.coerce.number().finite().optional(),
    y: z.coerce.number().finite().optional(),
    vType: z.coerce.number().int().min(0).max(8).optional(),
});

export type HttpPlayerJsonEntry = z.infer<typeof httpPlayerSchema>;

export type DisplayPlayerlistRow = PlayerlistPlayerType & {
    playTimeMinutes: number;
    sessionTimeSeconds: number;
};

type HttpPlayerTagContext = Pick<PlayerlistPlayerType, 'netid' | 'displayName' | 'pureName' | 'ids' | 'license'>;
export type ResolveHttpPlayerTags = (player: HttpPlayerTagContext, source: HttpPlayerJsonEntry) => PlayerTag[];

/**
 * Parses FXServer /players.json entries, ignoring invalid rows.
 */
export const parsePlayersJson = (body: unknown): HttpPlayerJsonEntry[] => {
    if (!Array.isArray(body)) return [];

    const players: HttpPlayerJsonEntry[] = [];
    for (const row of body) {
        const parsed = httpPlayerSchema.safeParse(row);
        if (parsed.success) {
            players.push(parsed.data);
            continue;
        }

        if (!row || typeof row !== 'object') continue;
        const fallback = row as Record<string, unknown>;
        const id = Number(fallback.id ?? fallback.ID ?? fallback.source);
        const name = fallback.name ?? fallback.Name;
        if (!Number.isFinite(id) || id <= 0 || typeof name !== 'string' || !name.trim().length) continue;
        const entry: HttpPlayerJsonEntry = {
            id,
            name: name.trim(),
            identifiers: Array.isArray(fallback.identifiers)
                ? fallback.identifiers.filter((v) => typeof v === 'string')
                : [],
        };
        if (typeof fallback.health === 'number' && Number.isFinite(fallback.health)) {
            entry.health = fallback.health;
        }
        if (typeof fallback.x === 'number' && Number.isFinite(fallback.x)) {
            entry.x = fallback.x;
        }
        if (typeof fallback.y === 'number' && Number.isFinite(fallback.y)) {
            entry.y = fallback.y;
        }
        if (typeof fallback.vType === 'number' && Number.isFinite(fallback.vType)) {
            entry.vType = fallback.vType;
        }
        players.push(entry);
    }
    return players;
};

/**
 * Maps a /players.json row into the panel playerlist shape.
 */
export const mapHttpPlayerToPlayerlistEntry = (
    player: HttpPlayerJsonEntry,
    resolveTags?: ResolveHttpPlayerTags,
): DisplayPlayerlistRow => {
    const { displayName, pureName } = cleanPlayerName(player.name);
    const { validIdsArray, validIdsObject } = parsePlayerIds(player.identifiers ?? []);
    const tagContext = {
        netid: player.id,
        displayName,
        pureName,
        ids: validIdsArray,
        license: validIdsObject.license,
    };

    return {
        ...tagContext,
        tags: resolveTags?.(tagContext, player) ?? [],
        playTimeMinutes: 0,
        sessionTimeSeconds: 0,
    };
};

/**
 * Merges HTTP-reported players into an FD3-backed playerlist.
 * FD3 entries win when a netid is already occupied by a connected player.
 */
export const mergeHttpPlayersIntoPlayerlist = (
    fd3Players: DisplayPlayerlistRow[],
    httpPlayers: HttpPlayerJsonEntry[],
    resolveTags?: ResolveHttpPlayerTags,
): DisplayPlayerlistRow[] => {
    if (!httpPlayers.length) return fd3Players;

    const occupiedNetids = new Set(fd3Players.map((player) => player.netid));
    const occupiedPureNames = new Set(fd3Players.map((player) => player.pureName));
    const merged = [...fd3Players];

    for (const httpPlayer of httpPlayers) {
        if (occupiedNetids.has(httpPlayer.id)) continue;

        const mapped = mapHttpPlayerToPlayerlistEntry(httpPlayer, resolveTags);
        if (occupiedPureNames.has(mapped.pureName)) continue;

        merged.push(mapped);
        occupiedNetids.add(httpPlayer.id);
        occupiedPureNames.add(mapped.pureName);
    }

    return merged;
};

/**
 * Uses HTTP-reported players as the roster source of truth, overlaying FD3 data for matching netids.
 */
export const buildHttpPrimaryPlayerlist = (
    fd3Players: DisplayPlayerlistRow[],
    httpPlayers: HttpPlayerJsonEntry[],
    resolveTags?: ResolveHttpPlayerTags,
): DisplayPlayerlistRow[] => {
    if (!httpPlayers.length) return fd3Players;

    const fd3ByNetid = new Map(fd3Players.map((player) => [player.netid, player]));
    const result: DisplayPlayerlistRow[] = [];
    const seenNetids = new Set<number>();

    for (const httpPlayer of httpPlayers) {
        const fd3Match = fd3ByNetid.get(httpPlayer.id);
        result.push(fd3Match ?? mapHttpPlayerToPlayerlistEntry(httpPlayer, resolveTags));
        seenNetids.add(httpPlayer.id);
    }

    for (const fd3Player of fd3Players) {
        if (!seenNetids.has(fd3Player.netid)) {
            result.push(fd3Player);
        }
    }

    return result;
};
