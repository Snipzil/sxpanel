import type { PlayerTag, TagDefinition } from '@shared/socketioTypes';
import { AUTO_TAG_DEFINITIONS } from '@shared/socketioTypes';
import { nearestHudColorIndex } from '@shared/hudColors';
import type { CustomTagConfig } from '@modules/ConfigStore/schema/gameFeatures';
import { ServerPlayer, type BasePlayer } from './playerClasses';

type CustomTagWithDiscord = CustomTagConfig & { discordRoleIds?: string[] };

const AUTO_TAG_IDS = new Set(AUTO_TAG_DEFINITIONS.map((t) => t.id));

const getConfiguredCustomTags = (): CustomTagWithDiscord[] => {
    return (txConfig.gameFeatures.customTags ?? []) as CustomTagWithDiscord[];
};

/**
 * Normalizes a tag id for storage and lookup (lowercase, valid characters only).
 */
export const normalizePlayerTagId = (rawTagId: string): string => {
    return rawTagId
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '');
};

/**
 * Returns custom tag ids that can be assigned manually (excludes auto tags and empty ids).
 */
export const getAssignableCustomTagIds = (): Set<string> => {
    const discordManaged = getDiscordManagedTagIds();
    const ids = new Set<string>();
    for (const tag of getConfiguredCustomTags()) {
        if (!tag.id || AUTO_TAG_IDS.has(tag.id) || discordManaged.has(tag.id)) continue;
        ids.add(tag.id);
    }
    return ids;
};

/**
 * Returns custom tag ids managed by Discord role mappings.
 */
export const getDiscordManagedTagIds = (): Set<string> => {
    const ids = new Set<string>();
    for (const tag of getConfiguredCustomTags()) {
        if (!tag.id || !tag.discordRoleIds?.length) continue;
        ids.add(tag.id);
    }
    return ids;
};

/**
 * Returns whether any custom tag is mapped to Discord roles.
 */
export const hasDiscordManagedTagMappings = (): boolean => {
    return getDiscordManagedTagIds().size > 0;
};

/**
 * Resolves configured custom tags from a player's Discord role ids.
 */
export const resolveDiscordRoleTags = (memberRoles: string[]): string[] => {
    const roleSet = new Set(memberRoles);
    const tags: string[] = [];
    for (const tag of getConfiguredCustomTags()) {
        if (!tag.id || !tag.discordRoleIds?.length) continue;
        if (tag.discordRoleIds.some((roleId) => roleSet.has(roleId))) {
            tags.push(tag.id);
        }
    }
    return tags;
};

/**
 * Returns true when any configured tag mapping references one of the changed role ids.
 */
export const discordTagMappingsTouchRoles = (changedRoleIds: string[]): boolean => {
    const changed = new Set(changedRoleIds);
    for (const tag of getConfiguredCustomTags()) {
        if (!tag.discordRoleIds?.length) continue;
        if (tag.discordRoleIds.some((roleId) => changed.has(roleId))) return true;
    }
    return false;
};

const arraysEqual = (a: string[], b: string[]) => {
    if (a.length !== b.length) return false;
    return a.every((value, index) => value === b[index]);
};

/**
 * Syncs discord-managed tags for a player while preserving manually assigned tags.
 * Pass null for memberRoles when Discord lookup is unavailable (no changes applied).
 */
export const syncPlayerDiscordTags = (player: BasePlayer, memberRoles: string[] | null): boolean => {
    if (memberRoles === null) return false;

    const discordManaged = getDiscordManagedTagIds();
    const dbData = player.getDbData();
    const current = dbData?.customTags ?? [];
    const manualTags = current.filter((tagId) => !discordManaged.has(tagId));
    const updated = [...manualTags, ...resolveDiscordRoleTags(memberRoles)];

    if (arraysEqual(current, updated)) return false;

    player.mutateDbData({ customTags: updated });
    return true;
};

/**
 * Refreshes discord-managed tags for a connected player using the Discord bot.
 */
export const refreshPlayerDiscordTags = async (player: BasePlayer): Promise<boolean> => {
    const discordId = player
        .getAllIdentifiers()
        .find((id) => id.startsWith('discord:'))
        ?.slice('discord:'.length);
    if (!discordId) return false;

    try {
        const lookup = await txCore.discordBot.resolveMemberRoles(discordId);
        const memberRoles = lookup.isMember === true && Array.isArray(lookup.memberRoles) ? lookup.memberRoles : [];
        return syncPlayerDiscordTags(player, memberRoles);
    } catch {
        return syncPlayerDiscordTags(player, null);
    }
};

/**
 * Adds or removes a manually assignable custom tag for a connected player.
 */
export const applyPlayerTagChange = (netId: number, rawTagId: string, enabled: boolean): void => {
    const tagId = normalizePlayerTagId(rawTagId);
    if (!tagId.length) throw new Error('invalid tag id');

    if (!getAssignableCustomTagIds().has(tagId)) {
        throw new Error(`unknown custom tag id: ${tagId}`);
    }
    if (getDiscordManagedTagIds().has(tagId)) {
        throw new Error(`tag '${tagId}' is managed by Discord roles`);
    }

    const player = txCore.fxPlayerlist.getPlayerById(netId);
    if (!(player instanceof ServerPlayer) || !player.isRegistered) {
        throw new Error(`player netid ${netId} not found or not registered`);
    }

    player.setCustomTag(tagId, enabled);

    if (player.isConnected) {
        txCore.fxPlayerlist.syncPlayerTags(netId);
    }
};

/**
 * Returns the merged list of auto + custom tag definitions, sorted by priority.
 */
export const getTagDefinitions = (): TagDefinition[] => {
    const customMap = new Map<string, TagDefinition>();
    for (const t of getConfiguredCustomTags()) {
        customMap.set(t.id, {
            id: t.id,
            label: t.label,
            color: t.color,
            priority: t.priority,
            enabled: t.enabled ?? true,
            ...(t.prefix !== undefined ? { prefix: t.prefix } : {}),
            ...(t.discordRoleIds?.length ? { discordRoleIds: t.discordRoleIds } : {}),
        });
    }
    const merged: TagDefinition[] = [];
    for (const auto of AUTO_TAG_DEFINITIONS) {
        const override = customMap.get(auto.id);
        merged.push(override ? { ...auto, ...override } : auto);
        customMap.delete(auto.id);
    }
    for (const custom of customMap.values()) {
        merged.push(custom);
    }
    return merged
        .sort((a, b) => a.priority - b.priority)
        .map((def) => ({ ...def, hudColor: nearestHudColorIndex(def.color) }));
};

/**
 * Returns the set of enabled auto-tag IDs from the current config.
 * Auto-tags are enabled by default unless explicitly disabled via customTags config.
 */
export const getDisabledAutoTagIds = (): Set<string> => {
    const disabled = new Set<string>();
    for (const t of txConfig.gameFeatures.customTags ?? []) {
        if (AUTO_TAG_DEFINITIONS.some((a) => a.id === t.id) && t.enabled === false) {
            disabled.add(t.id);
        }
    }
    return disabled;
};

/**
 * Returns the set of valid custom tag IDs from the current config.
 */
export const getValidCustomTagIds = (): Set<string> => {
    return new Set(
        getConfiguredCustomTags()
            .map((t) => t.id)
            .filter(Boolean),
    );
};

/**
 * Computes auto-assigned tags for a connected ServerPlayer,
 * then appends any valid custom tags from the player's DB data.
 */
export const computePlayerTags = (player: ServerPlayer): PlayerTag[] => {
    const tags: PlayerTag[] = [];
    const disabledAutoTags = getDisabledAutoTagIds();
    const adminsIdentifiers = txCore.adminStore.getAdminsIdentifiers();
    if (!disabledAutoTags.has('staff') && player.ids.some((id) => adminsIdentifiers.includes(id))) {
        tags.push('staff');
    }

    const dbData = player.getDbData();
    if (!disabledAutoTags.has('newplayer') && dbData) {
        const threshold = txConfig.gameFeatures.newplayerThreshold;
        if (threshold > 0 && dbData.playTime < threshold) {
            tags.push('newplayer');
        }
    }

    const history = player.getHistory();
    const hasActiveSanction = history.some((a) => (a.type === 'ban' || a.type === 'warn') && !a.revocation);
    if (!disabledAutoTags.has('problematic') && hasActiveSanction) {
        tags.push('problematic');
    }

    //Append valid custom tags from DB
    if (dbData?.customTags?.length) {
        const validIds = getValidCustomTagIds();
        for (const ct of dbData.customTags) {
            if (validIds.has(ct)) {
                tags.push(ct);
            }
        }
    }

    return tags;
};

/**
 * Computes tags for any player (including offline/database-only players).
 */
export const computePlayerTagsGeneric = (player: BasePlayer): PlayerTag[] => {
    const tags: PlayerTag[] = [];
    const disabledAutoTags = getDisabledAutoTagIds();
    const adminsIdentifiers = txCore.adminStore.getAdminsIdentifiers();
    const allIds = player.getAllIdentifiers();
    if (!disabledAutoTags.has('staff') && allIds.some((id) => adminsIdentifiers.includes(id))) {
        tags.push('staff');
    }

    const dbData = player.getDbData();
    if (!disabledAutoTags.has('newplayer') && dbData) {
        const threshold = txConfig.gameFeatures.newplayerThreshold;
        if (threshold > 0 && dbData.playTime < threshold) {
            tags.push('newplayer');
        }
    }

    const history = player.getHistory();
    const hasActiveSanction = history.some((a) => (a.type === 'ban' || a.type === 'warn') && !a.revocation);
    if (!disabledAutoTags.has('problematic') && hasActiveSanction) {
        tags.push('problematic');
    }

    //Append valid custom tags from DB
    if (dbData?.customTags?.length) {
        const validIds = getValidCustomTagIds();
        for (const ct of dbData.customTags) {
            if (validIds.has(ct)) {
                tags.push(ct);
            }
        }
    }

    return tags;
};
