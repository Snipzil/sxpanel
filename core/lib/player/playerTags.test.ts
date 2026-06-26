import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
    getAssignableCustomTagIds,
    getDiscordManagedTagIds,
    normalizePlayerTagId,
    resolveDiscordRoleTags,
    syncPlayerDiscordTags,
    discordTagMappingsTouchRoles,
} from './playerTags';
import type { BasePlayer } from './playerClasses';

const makePlayer = (customTags: string[] = []) => {
    let dbData = { customTags, license: 'license:test' };
    const player = {
        getDbData: () => dbData,
        mutateDbData: (patch: { customTags?: string[] }) => {
            dbData = { ...dbData, ...patch };
        },
        getAllIdentifiers: () => ['license:test', 'discord:123456789012345678'],
    } as unknown as BasePlayer;
    return { player, getDbData: () => dbData };
};

describe('playerTags helpers', () => {
    beforeEach(() => {
        vi.stubGlobal('txConfig', {
            gameFeatures: {
                customTags: [
                    { id: 'staff', label: 'Staff', color: '#EF4444', priority: 10, enabled: true },
                    { id: 'vip', label: 'VIP', color: '#3B82F6', priority: 40, discordRoleIds: ['111111111111111111'] },
                    {
                        id: 'streamer',
                        label: 'Streamer',
                        color: '#22C55E',
                        priority: 50,
                        discordRoleIds: ['222222222222222222'],
                    },
                    { id: '', label: 'Broken', color: '#000000', priority: 50 },
                ],
            },
        });
    });

    it('normalizePlayerTagId lowercases and strips invalid characters', () => {
        expect(normalizePlayerTagId(' VIP ')).toBe('vip');
        expect(normalizePlayerTagId('Stream-ER')).toBe('streamer');
    });

    it('getAssignableCustomTagIds excludes auto tags, discord-managed tags, and empty ids', () => {
        expect(getAssignableCustomTagIds()).toEqual(new Set());
    });

    it('getDiscordManagedTagIds returns tags with discordRoleIds configured', () => {
        expect(getDiscordManagedTagIds()).toEqual(new Set(['vip', 'streamer']));
    });

    it('resolveDiscordRoleTags matches configured role intersections', () => {
        expect(resolveDiscordRoleTags(['111111111111111111', '999999999999999999'])).toEqual(['vip']);
        expect(resolveDiscordRoleTags([])).toEqual([]);
    });

    it('syncPlayerDiscordTags adds matching tags and preserves manual tags', () => {
        const { player, getDbData } = makePlayer(['manual_tag']);
        const changed = syncPlayerDiscordTags(player, ['111111111111111111']);
        expect(changed).toBe(true);
        expect(getDbData().customTags).toEqual(['manual_tag', 'vip']);
    });

    it('syncPlayerDiscordTags removes discord-managed tags when roles no longer match', () => {
        const { player, getDbData } = makePlayer(['manual_tag', 'vip', 'streamer']);
        const changed = syncPlayerDiscordTags(player, []);
        expect(changed).toBe(true);
        expect(getDbData().customTags).toEqual(['manual_tag']);
    });

    it('syncPlayerDiscordTags skips when bot lookup unavailable', () => {
        const { player, getDbData } = makePlayer(['vip']);
        const changed = syncPlayerDiscordTags(player, null);
        expect(changed).toBe(false);
        expect(getDbData().customTags).toEqual(['vip']);
    });

    it('discordTagMappingsTouchRoles detects mapping overlap', () => {
        expect(discordTagMappingsTouchRoles(['111111111111111111'])).toBe(true);
        expect(discordTagMappingsTouchRoles(['000000000000000000'])).toBe(false);
    });
});
