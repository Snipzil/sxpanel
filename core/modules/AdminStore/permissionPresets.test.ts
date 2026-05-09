import { suite, it, expect } from 'vitest';
import type { PermissionPreset } from '@shared/permissions';
import { resolvePermissionPresetIdsFromCatalog } from './permissionPresets';

suite('resolvePermissionPresetIdsFromCatalog', () => {
    it('merges permissions from multiple presets without duplicates', () => {
        const catalog: PermissionPreset[] = [
            {
                id: 'custom:moderator',
                name: 'Moderator',
                permissions: ['players.warn', 'players.kick'],
            },
            {
                id: 'custom:senior_moderator',
                name: 'Senior Moderator',
                permissions: ['players.kick', 'players.ban'],
            },
        ];

        expect(
            resolvePermissionPresetIdsFromCatalog(catalog, [
                'custom:moderator',
                'custom:senior_moderator',
                'custom:moderator',
            ]),
        ).toEqual({
            presetIds: ['custom:moderator', 'custom:senior_moderator'],
            presetNames: ['Moderator', 'Senior Moderator'],
            permissions: ['players.warn', 'players.kick', 'players.ban'],
        });
    });

    it('ignores unknown preset ids', () => {
        const catalog: PermissionPreset[] = [
            {
                id: 'custom:support',
                name: 'Support',
                permissions: ['players.warn'],
            },
        ];

        expect(resolvePermissionPresetIdsFromCatalog(catalog, ['missing', 'custom:support'])).toEqual({
            presetIds: ['custom:support'],
            presetNames: ['Support'],
            permissions: ['players.warn'],
        });
    });

    it('supports single preset ids', () => {
        const catalog: PermissionPreset[] = [
            {
                id: 'custom:moderator',
                name: 'Moderator',
                permissions: ['players.kick'],
            },
        ];

        expect(resolvePermissionPresetIdsFromCatalog(catalog, 'custom:moderator')).toEqual({
            presetIds: ['custom:moderator'],
            presetNames: ['Moderator'],
            permissions: ['players.kick'],
        });
    });
});