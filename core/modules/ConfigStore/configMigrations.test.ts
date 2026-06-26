import { describe, it, expect, vi } from 'vitest';

vi.mock('@core/globalData', () => ({
    txEnv: {
        profileSubPath: (name: string) => `/tmp/test-profile/${name}`,
    },
}));

vi.mock('node:fs', () => ({
    default: {
        copyFileSync: vi.fn(),
    },
}));

import { migrateConfigFile } from './configMigrations';

describe('migrateConfigFile', () => {
    it('migrates v2 to v6 and sets version to 6', () => {
        const result = migrateConfigFile({
            version: 2,
            general: { serverName: 'Test Server' },
            whitelist: {
                mode: 'approvedLicense',
                rejectionMessage: 'Join our Discord',
                discordRoles: [],
            },
        });

        expect(result.version).toBe(6);
        expect(result.whitelist?.enabled).toBe(true);
        expect(result.whitelist?.workflows?.length).toBeGreaterThan(0);
        expect(result.whitelist?.activeWorkflowId).toBeDefined();
        expect((result as any).whitelist?.tiers).toBeUndefined();
        expect((result as any).queue?.rules).toBeDefined();
    });
});
