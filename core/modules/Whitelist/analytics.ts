import type { WhitelistAnalyticsSummary } from '@shared/whitelistApiTypes';
import type { WhitelistEventType } from '@shared/whitelistTypes';
import { now } from '@lib/misc';

const DAY_SECONDS = 86400;

function median(values: number[]): number | null {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    }
    return sorted[mid];
}

/**
 * Builds whitelist analytics summary for the panel.
 */
export function buildWhitelistAnalyticsSummary(days = 30): WhitelistAnalyticsSummary {
    const sinceTs = now() - days * DAY_SECONDS;

    const entries = txCore.database.whitelist.findManyEntries();
    const applications = txCore.database.whitelist.findManyApplications();
    const events = txCore.database.whitelist.findManyEvents((e) => e.ts >= sinceTs);

    const pendingApplications = applications.filter((a) => a.status === 'pending');
    const approvedApplications = applications.filter((a) => a.status === 'approved');
    const deniedApplications = applications.filter((a) => a.status === 'denied');

    const waitSamples = approvedApplications
        .filter((a) => typeof a.tsDecided === 'number')
        .map((a) => (a.tsDecided as number) - a.tsCreated);
    const avgApprovalWaitSeconds = waitSamples.length
        ? Math.round(waitSamples.reduce((sum, n) => sum + n, 0) / waitSamples.length)
        : null;
    const medianApprovalWaitSeconds = median(waitSamples);

    const pendingOlderThan24h = pendingApplications.filter((a) => now() - a.tsCreated > DAY_SECONDS).length;

    const recentApplications = applications.filter((a) => a.tsCreated >= sinceTs);
    const eventCounts: Partial<Record<WhitelistEventType, number>> = {};
    for (const event of events) {
        eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
    }

    const connectedEntries = entries.filter((e) => typeof e.tsFirstConnect === 'number');
    const retention7d = connectedEntries.filter((e) => {
        if (typeof e.tsFirstConnect !== 'number') return false;
        return now() - e.tsFirstConnect <= 7 * DAY_SECONDS;
    }).length;

    return {
        totalEntries: entries.length,
        activePlayers: connectedEntries.length,
        pendingPreApprovals: entries.filter((e) => typeof e.tsFirstConnect !== 'number').length,
        pendingApplications: pendingApplications.length,
        approvedApplications: approvedApplications.length,
        deniedApplications: deniedApplications.length,
        avgApprovalWaitSeconds,
        medianApprovalWaitSeconds,
        pendingOlderThan24h,
        applicationsCreatedInPeriod: recentApplications.length,
        eventsInPeriod: events.length,
        eventCounts,
        connectedLast7d: retention7d,
        periodDays: days,
    };
}
