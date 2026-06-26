import { suite, it, expect, vi, beforeEach } from 'vitest';
import ActionsDao from './actions';

// Mock globals
vi.stubGlobal('emsg', (e: any) => (e instanceof Error ? e.message : String(e)));
vi.stubGlobal('txConfig', {
    banlist: { requiredHwidMatches: 1 },
});

// Minimal lowdb chain mock for actions
function createMockDb() {
    let actions: any[] = [];
    let idCounter = 1;

    const chainValue = {
        get: vi.fn((collection: string) => {
            if (collection !== 'actions') throw new Error('Unexpected collection');
            return {
                find: vi.fn((filter: any) => {
                    const found = actions.find((a) => Object.entries(filter).every(([k, v]) => (a as any)[k] === v));
                    return {
                        cloneDeep: vi.fn(() => ({
                            value: vi.fn(() => (found ? structuredClone(found) : undefined)),
                        })),
                        value: vi.fn(() => found),
                    };
                }),
                filter: vi.fn((filterOrFn: any) => {
                    let filtered: any[];
                    if (typeof filterOrFn === 'function') {
                        filtered = actions.filter(filterOrFn);
                    } else {
                        filtered = actions.filter((a) =>
                            Object.entries(filterOrFn).every(([k, v]) => (a as any)[k] === v),
                        );
                    }
                    return {
                        cloneDeep: vi.fn(() => ({
                            value: vi.fn(() => structuredClone(filtered)),
                        })),
                        value: vi.fn(() => filtered),
                    };
                }),
                push: vi.fn((action: any) => {
                    actions.push(action);
                    return { value: vi.fn() };
                }),
                remove: vi.fn((filter: any) => {
                    const removed = actions.filter((a) =>
                        Object.entries(filter).every(([k, v]) => (a as any)[k] === v),
                    );
                    const remaining = actions.filter(
                        (a) => !Object.entries(filter).every(([k, v]) => (a as any)[k] === v),
                    );
                    actions.length = 0;
                    actions.push(...remaining);
                    return { value: vi.fn(() => removed) };
                }),
                value: vi.fn(() => actions),
            };
        }),
    };

    const db = {
        obj: { chain: chainValue, data: { actions } },
        isReady: true,
        writeFlag: vi.fn(),
    };

    return { db, getActions: () => actions, setActions: (a: any[]) => (actions = a) };
}

// Mock genActionID to return predictable IDs
vi.mock('../dbUtils', () => ({
    genActionID: vi.fn(() => 'B001-TEST'),
    DuplicateKeyError: class DuplicateKeyError extends Error {
        readonly code = 'DUPLICATE_KEY';
    },
}));

vi.mock('@lib/misc', () => ({
    now: vi.fn(() => 1700000000),
}));

suite('ActionsDao', () => {
    let dao: ActionsDao;
    let mockDb: ReturnType<typeof createMockDb>;

    beforeEach(() => {
        mockDb = createMockDb();
        dao = new ActionsDao(mockDb.db as any);
        vi.clearAllMocks();
    });

    suite('findOne', () => {
        it('should throw on invalid actionId', () => {
            expect(() => dao.findOne('')).toThrow('Invalid actionId');
            expect(() => dao.findOne(undefined as any)).toThrow('Invalid actionId');
        });

        it('should return null for non-existent action', () => {
            const result = dao.findOne('NONEXIST');
            expect(result).toBeNull();
        });
    });

    suite('findMany', () => {
        it('should throw when idsArray is not an array', () => {
            expect(() => dao.findMany('notarray' as any)).toThrow('idsArray should be an array');
        });

        it('should throw when hwidsArray is invalid', () => {
            expect(() => dao.findMany([], 'notarray' as any)).toThrow('hwidsArray should be an array or undefined');
        });

        it('should return empty array when no indexes match', () => {
            const result = dao.findMany(['license:nonexist']);
            expect(result).toEqual([]);
        });
    });

    suite('registerBan', () => {
        it('should throw on empty ids array', () => {
            expect(() => dao.registerBan([], 'admin', 'reason', false)).toThrow('Invalid ids array');
        });

        it('should throw on non-array ids', () => {
            expect(() => dao.registerBan('bad' as any, 'admin', 'reason', false)).toThrow('Invalid ids array');
        });

        it('should throw on invalid author', () => {
            expect(() => dao.registerBan(['id:1'], '', 'reason', false)).toThrow('Invalid author');
        });

        it('should throw on invalid reason', () => {
            expect(() => dao.registerBan(['id:1'], 'admin', '', false)).toThrow('Invalid reason');
        });

        it('should throw on invalid expiration', () => {
            expect(() => dao.registerBan(['id:1'], 'admin', 'cheat', 'bad' as any)).toThrow('Invalid expiration');
        });

        it('should register a ban and return action ID', () => {
            const id = dao.registerBan(['license:abc'], 'admin1', 'Cheating', 1700100000);
            expect(id).toBe('B001-TEST');
            expect(mockDb.db.writeFlag).toHaveBeenCalled();
        });

        it('should register a permanent ban (expiration: false)', () => {
            const id = dao.registerBan(['license:abc'], 'admin1', 'Cheating', false);
            expect(id).toBe('B001-TEST');
        });

        it('should register a ban even when author is a routine audit label', () => {
            const id = dao.registerBan(['license:abc'], 'System', 'Cheating', false);
            expect(id).toBe('B001-TEST');
            expect(mockDb.db.writeFlag).toHaveBeenCalled();
        });
    });

    suite('registerWarn', () => {
        it('should throw on empty ids array', () => {
            expect(() => dao.registerWarn([], 'admin', 'reason')).toThrow('Invalid ids array');
        });

        it('should throw on invalid author', () => {
            expect(() => dao.registerWarn(['id:1'], '', 'reason')).toThrow('Invalid author');
        });

        it('should throw on invalid reason', () => {
            expect(() => dao.registerWarn(['id:1'], 'admin', '')).toThrow('Invalid reason');
        });

        it('should register a warning', () => {
            const id = dao.registerWarn(['license:abc'], 'admin1', 'Toxic');
            expect(id).toBe('B001-TEST');
            expect(mockDb.db.writeFlag).toHaveBeenCalled();
        });
    });

    suite('registerKick', () => {
        it('should throw on empty ids array', () => {
            expect(() => dao.registerKick([], 'admin', 'reason')).toThrow('Invalid ids array');
        });

        it('should register a kick', () => {
            const id = dao.registerKick(['license:abc'], 'admin1', 'AFK');
            expect(id).toBe('B001-TEST');
            expect(mockDb.db.writeFlag).toHaveBeenCalled();
        });
    });

    suite('ackWarn', () => {
        it('should throw on invalid actionId', () => {
            expect(() => dao.ackWarn('')).toThrow('Invalid actionId');
        });
    });

    suite('changeBanExpiration', () => {
        it('should throw on invalid actionId', () => {
            expect(() => dao.changeBanExpiration('', 1700100000)).toThrow('Invalid actionId');
        });

        it('should throw on invalid expiration value', () => {
            expect(() => dao.changeBanExpiration('B001', 0)).toThrow('Invalid expiration');
            expect(() => dao.changeBanExpiration('B001', -1)).toThrow('Invalid expiration');
        });

        it('should accept expiration: false', () => {
            // Will throw "action not found" since mock db is empty, but won't throw Invalid expiration
            expect(() => dao.changeBanExpiration('B001', false)).toThrow('action not found');
        });
    });

    suite('revoke', () => {
        it('should throw on invalid actionId', () => {
            expect(() => dao.revoke('', 'admin')).toThrow('Invalid actionId');
        });

        it('should throw on invalid author', () => {
            expect(() => dao.revoke('B001', '')).toThrow('Invalid author');
        });

        it('should throw on invalid allowedTypes', () => {
            expect(() => dao.revoke('B001', 'admin', 'bad' as any)).toThrow('Invalid allowedTypes');
        });
    });

    suite('deleteAction', () => {
        it('should throw on invalid actionId', () => {
            expect(() => dao.deleteAction('')).toThrow('Invalid actionId');
        });
    });

    suite('buildIndexes', () => {
        it('should run without errors on empty database', () => {
            expect(() => dao.buildIndexes()).not.toThrow();
        });
    });
});
