import { beforeEach, expect, it, suite, vi } from 'vitest';
import type { DatabaseBotCommandEventType } from '../databaseTypes';

vi.mock('@lib/misc', () => ({
    now: () => 2_000_000_000,
}));

import BotAnalyticsDao from './botAnalytics';

const createMockDb = () => {
    let botCommandEvents: DatabaseBotCommandEventType[] = [];

    const botCommandEventsCollection = {
        push: vi.fn((item: DatabaseBotCommandEventType) => {
            botCommandEvents.push(item);
            return {
                value: vi.fn(() => item),
            };
        }),
        remove: vi.fn((predicate: (item: DatabaseBotCommandEventType) => boolean) => {
            const removed = botCommandEvents.filter(predicate);
            botCommandEvents = botCommandEvents.filter((item) => !removed.includes(item));
            return {
                value: vi.fn(() => removed),
            };
        }),
        filter: vi.fn((predicate: (item: DatabaseBotCommandEventType) => boolean) => {
            const filtered = botCommandEvents.filter(predicate);
            return {
                cloneDeep: vi.fn(() => ({
                    value: vi.fn(() => structuredClone(filtered)),
                })),
                value: vi.fn(() => filtered),
            };
        }),
    };

    const db = {
        obj: {
            chain: {
                get: vi.fn((collection: string) => {
                    if (collection !== 'botCommandEvents') {
                        throw new Error(`Unexpected collection '${collection}'`);
                    }
                    return botCommandEventsCollection;
                }),
            },
        },
        isReady: true,
        writeFlag: vi.fn(),
    };

    return {
        db,
        setEvents: (nextEvents: DatabaseBotCommandEventType[]) => {
            botCommandEvents = nextEvents;
        },
        getEvents: () => botCommandEvents,
    };
};

const createEvent = (overrides: Partial<DatabaseBotCommandEventType>): DatabaseBotCommandEventType => {
    return {
        id: overrides.id ?? crypto.randomUUID(),
        ts: overrides.ts ?? 2_000_000_000,
        commandName: overrides.commandName ?? 'warn',
        outcome: overrides.outcome ?? 'success',
        denialReason: Object.hasOwn(overrides, 'denialReason') ? overrides.denialReason : undefined,
        requestType: overrides.requestType ?? 'moderationCommand',
        bridgeRequestCount: Object.hasOwn(overrides, 'bridgeRequestCount') ? overrides.bridgeRequestCount : 1,
        interactionAckMs: Object.hasOwn(overrides, 'interactionAckMs') ? overrides.interactionAckMs : 100,
        bridgeRoundtripMs: Object.hasOwn(overrides, 'bridgeRoundtripMs') ? overrides.bridgeRoundtripMs : 40,
        handlerDurationMs: Object.hasOwn(overrides, 'handlerDurationMs') ? overrides.handlerDurationMs : 25,
    };
};

suite('BotAnalyticsDao', () => {
    let dao: BotAnalyticsDao;
    let mockDb: ReturnType<typeof createMockDb>;

    beforeEach(() => {
        mockDb = createMockDb();
        dao = new BotAnalyticsDao(mockDb.db as any);
        vi.clearAllMocks();
    });

    suite('recordCommandEvent', () => {
        it('stores the new event and prunes entries older than retention', () => {
            mockDb.setEvents([
                createEvent({
                    id: 'old',
                    ts: 2_000_000_000 - 121 * 86400,
                    commandName: 'history',
                }),
            ]);

            dao.recordCommandEvent(createEvent({ id: 'new', ts: 2_000_000_000 }));

            expect(mockDb.getEvents().map((event) => event.id)).toEqual(['new']);
            expect(mockDb.db.writeFlag).toHaveBeenCalled();
        });
    });

    suite('getCommandAnalytics', () => {
        it('aggregates outcomes, denials, latency, and 7d/30d rollups', () => {
            mockDb.setEvents([
                createEvent({
                    id: 'warn-success',
                    ts: 2_000_000_000 - 60,
                    commandName: 'warn',
                    outcome: 'success',
                    interactionAckMs: 100,
                    bridgeRoundtripMs: 40,
                    handlerDurationMs: 25,
                }),
                createEvent({
                    id: 'warn-denied',
                    ts: 2_000_000_000 - 120,
                    commandName: 'warn',
                    outcome: 'denied',
                    denialReason: 'missing_permissions',
                    interactionAckMs: 80,
                    bridgeRoundtripMs: 30,
                    handlerDurationMs: 20,
                }),
                createEvent({
                    id: 'reports-timeout',
                    ts: 2_000_000_000 - 180,
                    commandName: 'reports',
                    outcome: 'timed_out',
                    interactionAckMs: 250,
                    bridgeRoundtripMs: 5000,
                    handlerDurationMs: undefined,
                }),
                createEvent({
                    id: 'reports-failed',
                    ts: 2_000_000_000 - 9 * 86400,
                    commandName: 'reports',
                    outcome: 'failed',
                    interactionAckMs: 110,
                    bridgeRoundtripMs: 70,
                    handlerDurationMs: 40,
                }),
            ]);

            const analytics = dao.getCommandAnalytics(30);

            expect(analytics.overview).toEqual({
                total: 4,
                success: 1,
                denied: 1,
                failed: 1,
                timedOut: 1,
                uniqueCommands: 2,
                successRate: 25,
            });
            expect(analytics.latency).toEqual({
                avgInteractionAckMs: 135,
                p95InteractionAckMs: 250,
                avgBridgeRoundtripMs: 1285,
                p95BridgeRoundtripMs: 5000,
                avgHandlerDurationMs: 28,
                p95HandlerDurationMs: 40,
            });
            expect(analytics.byCommand).toEqual([
                {
                    commandName: 'reports',
                    total: 2,
                    success: 0,
                    denied: 0,
                    failed: 1,
                    timedOut: 1,
                    avgInteractionAckMs: 180,
                    avgBridgeRoundtripMs: 2535,
                    avgHandlerDurationMs: 40,
                },
                {
                    commandName: 'warn',
                    total: 2,
                    success: 1,
                    denied: 1,
                    failed: 0,
                    timedOut: 0,
                    avgInteractionAckMs: 90,
                    avgBridgeRoundtripMs: 35,
                    avgHandlerDurationMs: 23,
                },
            ]);
            expect(analytics.denialReasons).toEqual([{ reason: 'missing_permissions', count: 1 }]);
            expect(analytics.rollups['7d']).toEqual({
                total: 3,
                success: 1,
                denied: 1,
                failed: 0,
                timedOut: 1,
                successRate: 33,
                avgInteractionAckMs: 143,
                avgBridgeRoundtripMs: 1690,
                avgHandlerDurationMs: 23,
            });
            expect(analytics.rollups['30d']).toEqual({
                total: 4,
                success: 1,
                denied: 1,
                failed: 1,
                timedOut: 1,
                successRate: 25,
                avgInteractionAckMs: 135,
                avgBridgeRoundtripMs: 1285,
                avgHandlerDurationMs: 28,
            });
            expect(analytics.timelineDays.at(-1)).toEqual({
                date: '2033-05-18',
                total: 3,
                success: 1,
                denied: 1,
                failed: 0,
                timedOut: 1,
            });
        });
    });
});