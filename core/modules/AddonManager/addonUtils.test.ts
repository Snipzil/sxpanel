import { suite, it, expect } from 'vitest';
import { topologicalSort, getMissingDependencies, type DependencyNode } from './addonUtils';
import { AddonManifestSchema } from '@shared/addonTypes';

suite('topologicalSort', () => {
    const node = (id: string, deps: string[] = []): DependencyNode => ({ id, dependencies: deps });

    it('returns empty array for empty input', () => {
        expect(topologicalSort([])).toEqual([]);
    });

    it('returns single node as-is', () => {
        const nodes = [node('a')];
        expect(topologicalSort(nodes).map((n) => n.id)).toEqual(['a']);
    });

    it('preserves order when no dependencies', () => {
        const nodes = [node('a'), node('b'), node('c')];
        expect(topologicalSort(nodes).map((n) => n.id)).toEqual(['a', 'b', 'c']);
    });

    it('places dependency before dependent', () => {
        const nodes = [node('b', ['a']), node('a')];
        const sorted = topologicalSort(nodes).map((n) => n.id);
        expect(sorted.indexOf('a')).toBeLessThan(sorted.indexOf('b'));
    });

    it('handles a chain of dependencies (a → b → c)', () => {
        const nodes = [node('c', ['b']), node('b', ['a']), node('a')];
        const sorted = topologicalSort(nodes).map((n) => n.id);
        expect(sorted).toEqual(['a', 'b', 'c']);
    });

    it('handles diamond dependency (d → b,c → a)', () => {
        const nodes = [node('d', ['b', 'c']), node('c', ['a']), node('b', ['a']), node('a')];
        const sorted = topologicalSort(nodes).map((n) => n.id);
        expect(sorted.indexOf('a')).toBeLessThan(sorted.indexOf('b'));
        expect(sorted.indexOf('a')).toBeLessThan(sorted.indexOf('c'));
        expect(sorted.indexOf('b')).toBeLessThan(sorted.indexOf('d'));
        expect(sorted.indexOf('c')).toBeLessThan(sorted.indexOf('d'));
    });

    it('handles circular dependencies gracefully', () => {
        const nodes = [node('a', ['b']), node('b', ['a'])];
        const sorted = topologicalSort(nodes);
        // Both should appear (appended at end since they can't resolve)
        expect(sorted).toHaveLength(2);
        expect(sorted.map((n) => n.id)).toContain('a');
        expect(sorted.map((n) => n.id)).toContain('b');
    });

    it('ignores dependencies on unknown nodes', () => {
        const nodes = [node('a', ['unknown']), node('b')];
        const sorted = topologicalSort(nodes).map((n) => n.id);
        expect(sorted).toEqual(['a', 'b']);
    });
});

suite('getMissingDependencies', () => {
    it('returns empty when no dependencies', () => {
        expect(getMissingDependencies([], new Set(['a']))).toEqual([]);
    });

    it('returns empty when all deps are running', () => {
        expect(getMissingDependencies(['a', 'b'], new Set(['a', 'b', 'c']))).toEqual([]);
    });

    it('returns missing deps', () => {
        expect(getMissingDependencies(['a', 'b', 'c'], new Set(['a']))).toEqual(['b', 'c']);
    });

    it('returns all deps when none are running', () => {
        expect(getMissingDependencies(['a', 'b'], new Set())).toEqual(['a', 'b']);
    });
});

suite('AddonManifestSchema validation', () => {
    const validManifest = {
        id: 'test-addon',
        name: 'Test Addon',
        description: 'A test addon',
        version: '1.0.0',
        author: 'Test',
        fxpanel: { minVersion: '0.1.0' },
        permissions: { required: ['storage'], optional: [] },
    };

    it('accepts a minimal valid manifest', () => {
        const result = AddonManifestSchema.safeParse(validManifest);
        expect(result.success).toBe(true);
    });

    it('defaults dependencies to empty array', () => {
        const result = AddonManifestSchema.parse(validManifest);
        expect(result.dependencies).toEqual([]);
    });

    it('defaults adminPermissions to empty array', () => {
        const result = AddonManifestSchema.parse(validManifest);
        expect(result.adminPermissions).toEqual([]);
    });

    it('accepts valid dependencies', () => {
        const result = AddonManifestSchema.safeParse({
            ...validManifest,
            dependencies: ['addon-a', 'addon-b'],
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.dependencies).toEqual(['addon-a', 'addon-b']);
        }
    });

    it('rejects invalid dependency IDs', () => {
        const result = AddonManifestSchema.safeParse({
            ...validManifest,
            dependencies: ['INVALID_CAPS'],
        });
        expect(result.success).toBe(false);
    });

    it('accepts valid adminPermissions', () => {
        const result = AddonManifestSchema.safeParse({
            ...validManifest,
            adminPermissions: [{ id: 'manage-notes', label: 'Manage Notes', description: 'Can manage notes' }],
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.adminPermissions).toHaveLength(1);
            expect(result.data.adminPermissions[0].id).toBe('manage-notes');
        }
    });

    it('rejects adminPermissions with invalid ID format', () => {
        const result = AddonManifestSchema.safeParse({
            ...validManifest,
            adminPermissions: [{ id: 'INVALID', label: 'Bad', description: 'bad' }],
        });
        expect(result.success).toBe(false);
    });

    it('accepts panel with settingsComponent', () => {
        const result = AddonManifestSchema.safeParse({
            ...validManifest,
            panel: {
                entry: 'panel/index.js',
                settingsComponent: 'MySettings',
            },
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.panel?.settingsComponent).toBe('MySettings');
        }
    });

    it('accepts panel without settingsComponent', () => {
        const result = AddonManifestSchema.safeParse({
            ...validManifest,
            panel: {
                entry: 'panel/index.js',
            },
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.panel?.settingsComponent).toBeUndefined();
        }
    });

    it('defaults publicRoutes to false', () => {
        const result = AddonManifestSchema.parse(validManifest);
        expect(result.publicRoutes).toBe(false);
    });

    it('accepts publicRoutes: true', () => {
        const result = AddonManifestSchema.safeParse({
            ...validManifest,
            publicRoutes: true,
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.publicRoutes).toBe(true);
        }
    });

    it('accepts publicServer with defaultPort', () => {
        const result = AddonManifestSchema.safeParse({
            ...validManifest,
            publicRoutes: true,
            publicServer: { defaultPort: 8080 },
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.publicServer?.defaultPort).toBe(8080);
        }
    });

    it('accepts discordBot commands path', () => {
        const result = AddonManifestSchema.safeParse({
            ...validManifest,
            discordBot: {
                commands: 'discord-bot/commands',
            },
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.discordBot?.commands).toBe('discord-bot/commands');
        }
    });

    it('accepts discordBot rate limits', () => {
        const result = AddonManifestSchema.safeParse({
            ...validManifest,
            discordBot: {
                commands: 'discord-bot/commands',
                rateLimit: {
                    max: 3,
                    windowMs: 10000,
                },
            },
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.discordBot?.rateLimit).toEqual({
                max: 3,
                windowMs: 10000,
            });
        }
    });

    it('rejects discordBot rate limits with invalid values', () => {
        const result = AddonManifestSchema.safeParse({
            ...validManifest,
            discordBot: {
                commands: 'discord-bot/commands',
                rateLimit: {
                    max: 0,
                    windowMs: 500,
                },
            },
        });
        expect(result.success).toBe(false);
    });

    it('rejects discordBot without commands or events', () => {
        const result = AddonManifestSchema.safeParse({
            ...validManifest,
            discordBot: {},
        });
        expect(result.success).toBe(false);
    });

    it('rejects discordBot paths that escape the addon directory', () => {
        const result = AddonManifestSchema.safeParse({
            ...validManifest,
            discordBot: {
                commands: '../discord-bot/commands',
            },
        });
        expect(result.success).toBe(false);
    });

    it('rejects discordBot absolute paths', () => {
        const result = AddonManifestSchema.safeParse({
            ...validManifest,
            discordBot: {
                events: '/discord-bot/events',
            },
        });
        expect(result.success).toBe(false);
    });

    it('rejects publicServer with invalid port', () => {
        const result = AddonManifestSchema.safeParse({
            ...validManifest,
            publicServer: { defaultPort: 99999 },
        });
        expect(result.success).toBe(false);
    });

    it('accepts manifest without publicServer', () => {
        const result = AddonManifestSchema.parse(validManifest);
        expect(result.publicServer).toBeUndefined();
    });
});
