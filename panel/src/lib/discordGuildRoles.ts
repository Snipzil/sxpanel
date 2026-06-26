import type { DiscordGuildRoleOption, DiscordGuildRolesResp } from '@shared/discordGuildRoles';
import type { GenericApiErrorResp } from '@shared/genericApiTypes';

type GuildRolesCache = {
    fetchedAt: number;
    roles: DiscordGuildRoleOption[];
    error: string | null;
};

let guildRolesCache: GuildRolesCache | null = null;
let inflightFetch: Promise<GuildRolesCache> | null = null;

const CACHE_TTL_MS = 60_000;

type AuthedFetcher = <Resp = unknown>(fetchUrl: string) => Promise<Resp>;

export const fetchDiscordGuildRoles = async (
    authedFetcher: AuthedFetcher,
    forceRefresh = false,
): Promise<GuildRolesCache> => {
    const now = Date.now();
    if (!forceRefresh && guildRolesCache && now - guildRolesCache.fetchedAt < CACHE_TTL_MS) {
        return guildRolesCache;
    }

    if (!forceRefresh && inflightFetch) {
        return inflightFetch;
    }

    inflightFetch = (async () => {
        try {
            const query = forceRefresh ? '?refresh=true' : '';
            const data = await authedFetcher<DiscordGuildRolesResp | GenericApiErrorResp>(
                `/discord/guild-roles${query}`,
            );
            if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
                guildRolesCache = { fetchedAt: Date.now(), roles: [], error: data.error };
                return guildRolesCache;
            }

            guildRolesCache = {
                fetchedAt: Date.now(),
                roles: Array.isArray((data as DiscordGuildRolesResp).roles)
                    ? (data as DiscordGuildRolesResp).roles
                    : [],
                error: null,
            };
            return guildRolesCache;
        } catch (error) {
            guildRolesCache = {
                fetchedAt: Date.now(),
                roles: [],
                error: error instanceof Error ? error.message : String(error),
            };
            return guildRolesCache;
        } finally {
            inflightFetch = null;
        }
    })();

    return inflightFetch;
};

export const clearDiscordGuildRolesCache = () => {
    guildRolesCache = null;
    inflightFetch = null;
};
