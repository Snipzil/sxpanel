import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isApplicationsOpen } from './schedule';
import type { WhitelistSchedule } from '@shared/whitelistTypes';

describe('isApplicationsOpen', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-25T20:00:00Z')); // Monday 20:00 UTC
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('returns true when schedule is disabled', () => {
        const schedule: WhitelistSchedule = {
            enabled: false,
            timezone: 'UTC',
            windows: [],
            closedMessage: 'closed',
        };
        expect(isApplicationsOpen(schedule)).toBe(true);
    });

    it('returns true inside a same-day window', () => {
        const schedule: WhitelistSchedule = {
            enabled: true,
            timezone: 'UTC',
            windows: [{ dayOfWeek: 1, startHour: 18, endHour: 23 }],
            closedMessage: 'closed',
        };
        expect(isApplicationsOpen(schedule)).toBe(true);
    });

    it('returns false outside window', () => {
        const schedule: WhitelistSchedule = {
            enabled: true,
            timezone: 'UTC',
            windows: [{ dayOfWeek: 1, startHour: 6, endHour: 12 }],
            closedMessage: 'closed',
        };
        expect(isApplicationsOpen(schedule)).toBe(false);
    });
});
