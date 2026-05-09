import type { PlayerTag, TagDefinition } from '@shared/socketioTypes';
import { AUTO_TAG_DEFINITIONS } from '@shared/socketioTypes';
import type { ServerPlayer, BasePlayer } from './playerClasses';

/**
 * Returns the merged list of auto + custom tag definitions, sorted by priority.
 */
export const getTagDefinitions = (): TagDefinition[] => {
    const customMap = new Map<string, TagDefinition>();
    for (const t of txConfig.gameFeatures.customTags ?? []) {
        customMap.set(t.id, {
            id: t.id,
            label: t.label,
            color: t.color,
            priority: t.priority,
            enabled: t.enabled ?? true,
        });
    }
    const merged: TagDefinition[] = [];
    for (const auto of AUTO_TAG_DEFINITIONS) {
        merged.push(customMap.get(auto.id) ?? auto);
        customMap.delete(auto.id);
    }
    for (const custom of customMap.values()) {
        merged.push(custom);
    }
    return merged.sort((a, b) => a.priority - b.priority);
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
    return new Set((txConfig.gameFeatures.customTags ?? []).map((t) => t.id));
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
