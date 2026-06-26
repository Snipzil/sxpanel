import type { WhitelistSchedule } from '@shared/whitelistTypes';

/**
 * Returns whether whitelist applications are open for the current moment.
 */
export function isApplicationsOpen(scheduleConfig: WhitelistSchedule = txConfig.whitelist.schedule, date = new Date()) {
    if (!scheduleConfig.enabled || !scheduleConfig.windows.length) {
        return true;
    }

    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: scheduleConfig.timezone || 'UTC',
        weekday: 'short',
        hour: 'numeric',
        hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const weekdayPart = parts.find((p) => p.type === 'weekday')?.value ?? '';
    const hourPart = parts.find((p) => p.type === 'hour')?.value ?? '0';
    const weekdayMap: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
    };
    const dayOfWeek = weekdayMap[weekdayPart] ?? date.getUTCDay();
    const hour = parseInt(hourPart, 10);

    return scheduleConfig.windows.some((window) => {
        if (window.dayOfWeek !== dayOfWeek) return false;
        if (window.startHour <= window.endHour) {
            return hour >= window.startHour && hour < window.endHour;
        }
        return hour >= window.startHour || hour < window.endHour;
    });
}
