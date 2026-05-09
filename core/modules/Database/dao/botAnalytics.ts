import { now } from '@lib/misc';
import type {
    BotCommandAnalyticsSummary,
    BotCommandBreakdownEntry,
    BotCommandEvent,
    BotCommandLatencySummary,
    BotCommandOutcome,
    BotCommandRollup,
    BotCommandTimelineDay,
} from '@shared/discordBotAnalyticsTypes';
import { DbInstance, SavePriority } from '../instance';
import type { DatabaseBotCommandEventType } from '../databaseTypes';

const RETENTION_DAYS = 120;

const toTimelineKey = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);

const average = (values: number[]) => {
    if (!values.length) return 0;
    return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
};

const percentile = (values: number[], ratio: number) => {
    if (!values.length) return 0;

    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
    return sorted[index];
};

const recordOutcome = (target: Record<'success' | 'denied' | 'failed' | 'timedOut', number>, outcome: BotCommandOutcome) => {
    if (outcome === 'timed_out') {
        target.timedOut += 1;
        return;
    }

    target[outcome] += 1;
};

const buildRollup = (events: BotCommandEvent[]): BotCommandRollup => {
    const totals = {
        total: events.length,
        success: 0,
        denied: 0,
        failed: 0,
        timedOut: 0,
    };
    const ackValues: number[] = [];
    const roundtripValues: number[] = [];
    const handlerValues: number[] = [];

    for (const event of events) {
        recordOutcome(totals, event.outcome);
        if (typeof event.interactionAckMs === 'number') ackValues.push(event.interactionAckMs);
        if (typeof event.bridgeRoundtripMs === 'number') roundtripValues.push(event.bridgeRoundtripMs);
        if (typeof event.handlerDurationMs === 'number') handlerValues.push(event.handlerDurationMs);
    }

    return {
        ...totals,
        successRate: totals.total > 0 ? Math.round((totals.success / totals.total) * 100) : 0,
        avgInteractionAckMs: average(ackValues),
        avgBridgeRoundtripMs: average(roundtripValues),
        avgHandlerDurationMs: average(handlerValues),
    };
};

export default class BotAnalyticsDao {
    constructor(private readonly db: DbInstance) {}

    private get chain() {
        if (!this.db.obj || !this.db.isReady) throw new Error('database not ready yet');
        return this.db.obj.chain;
    }

    recordCommandEvent(event: DatabaseBotCommandEventType) {
        this.chain.get('botCommandEvents').push(structuredClone(event)).value();

        const cutoff = Math.max(0, event.ts - RETENTION_DAYS * 86400);
        this.chain
            .get('botCommandEvents')
            .remove((entry: DatabaseBotCommandEventType) => entry.ts < cutoff)
            .value();

        this.db.writeFlag(SavePriority.LOW);
    }

    getCommandAnalytics(windowDays = 30): BotCommandAnalyticsSummary {
        const tsNow = now();
        const maxWindowDays = Math.max(windowDays, 30);
        const selectedWindowStart = tsNow - windowDays * 86400;
        const maxWindowStart = tsNow - maxWindowDays * 86400;

        const recentEvents: DatabaseBotCommandEventType[] = this.chain
            .get('botCommandEvents')
            .filter((event: DatabaseBotCommandEventType) => event.ts >= maxWindowStart)
            .cloneDeep()
            .value();

        const selectedEvents = recentEvents.filter((event) => event.ts >= selectedWindowStart);
        const sevenDayEvents = recentEvents.filter((event) => event.ts >= tsNow - 7 * 86400);
        const thirtyDayEvents = recentEvents.filter((event) => event.ts >= tsNow - 30 * 86400);

        const timelineMap = new Map<string, BotCommandTimelineDay>();
        for (let dayOffset = windowDays - 1; dayOffset >= 0; dayOffset--) {
            const ts = tsNow - dayOffset * 86400;
            const date = toTimelineKey(ts);
            timelineMap.set(date, {
                date,
                total: 0,
                success: 0,
                denied: 0,
                failed: 0,
                timedOut: 0,
            });
        }

        const commandMap = new Map<
            string,
            BotCommandBreakdownEntry & {
                ackValues: number[];
                roundtripValues: number[];
                handlerValues: number[];
            }
        >();
        const denialMap = new Map<string, number>();
        const ackValues: number[] = [];
        const roundtripValues: number[] = [];
        const handlerValues: number[] = [];
        const overview = {
            total: selectedEvents.length,
            success: 0,
            denied: 0,
            failed: 0,
            timedOut: 0,
            uniqueCommands: 0,
            successRate: 0,
        };

        for (const event of selectedEvents) {
            const timelineDay = timelineMap.get(toTimelineKey(event.ts));
            if (timelineDay) {
                timelineDay.total += 1;
                recordOutcome(timelineDay, event.outcome);
            }

            recordOutcome(overview, event.outcome);
            if (event.outcome === 'denied') {
                denialMap.set(event.denialReason ?? 'unknown', (denialMap.get(event.denialReason ?? 'unknown') ?? 0) + 1);
            }

            const commandEntry = commandMap.get(event.commandName) ?? {
                commandName: event.commandName,
                total: 0,
                success: 0,
                denied: 0,
                failed: 0,
                timedOut: 0,
                avgInteractionAckMs: 0,
                avgBridgeRoundtripMs: 0,
                avgHandlerDurationMs: 0,
                ackValues: [],
                roundtripValues: [],
                handlerValues: [],
            };

            commandEntry.total += 1;
            recordOutcome(commandEntry, event.outcome);
            if (typeof event.interactionAckMs === 'number') {
                commandEntry.ackValues.push(event.interactionAckMs);
                ackValues.push(event.interactionAckMs);
            }
            if (typeof event.bridgeRoundtripMs === 'number') {
                commandEntry.roundtripValues.push(event.bridgeRoundtripMs);
                roundtripValues.push(event.bridgeRoundtripMs);
            }
            if (typeof event.handlerDurationMs === 'number') {
                commandEntry.handlerValues.push(event.handlerDurationMs);
                handlerValues.push(event.handlerDurationMs);
            }

            commandMap.set(event.commandName, commandEntry);
        }

        overview.uniqueCommands = commandMap.size;
        overview.successRate = overview.total > 0 ? Math.round((overview.success / overview.total) * 100) : 0;

        const latency: BotCommandLatencySummary = {
            avgInteractionAckMs: average(ackValues),
            p95InteractionAckMs: percentile(ackValues, 0.95),
            avgBridgeRoundtripMs: average(roundtripValues),
            p95BridgeRoundtripMs: percentile(roundtripValues, 0.95),
            avgHandlerDurationMs: average(handlerValues),
            p95HandlerDurationMs: percentile(handlerValues, 0.95),
        };

        const byCommand = Array.from(commandMap.values())
            .map((entry) => ({
                commandName: entry.commandName,
                total: entry.total,
                success: entry.success,
                denied: entry.denied,
                failed: entry.failed,
                timedOut: entry.timedOut,
                avgInteractionAckMs: average(entry.ackValues),
                avgBridgeRoundtripMs: average(entry.roundtripValues),
                avgHandlerDurationMs: average(entry.handlerValues),
            }))
            .sort((left, right) => {
                if (right.total !== left.total) return right.total - left.total;
                return left.commandName.localeCompare(right.commandName);
            });

        const denialReasons = Array.from(denialMap.entries())
            .map(([reason, count]) => ({ reason: reason as BotCommandEvent['denialReason'] extends infer T ? Extract<T, string> : never, count }))
            .sort((left, right) => {
                if (right.count !== left.count) return right.count - left.count;
                return left.reason.localeCompare(right.reason);
            });

        return {
            overview,
            latency,
            byCommand,
            denialReasons,
            timelineDays: Array.from(timelineMap.values()),
            rollups: {
                '7d': buildRollup(sevenDayEvents),
                '30d': buildRollup(thirtyDayEvents),
            },
        };
    }
}