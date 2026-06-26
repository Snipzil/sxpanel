import got from '@lib/got';
import consoleFactory from '@lib/console';
const console = consoleFactory('ClockSkew');

const SKEW_WARN_THRESHOLD_MS = 30_000; // 30 seconds

let cachedSkewMs: number | null = null;

/**
 * Parses Google's time API response (plain number or JSON with XSSI prefix).
 */
const parseTimeApiResponse = (body: string): number | null => {
    const trimmed = body.trim();

    const plainMs = parseInt(trimmed, 10);
    if (!Number.isNaN(plainMs)) return plainMs;

    const jsonStart = trimmed.indexOf('{');
    if (jsonStart === -1) return null;

    try {
        const parsed = JSON.parse(trimmed.slice(jsonStart)) as Record<string, unknown>;
        const millis = parsed.current_time_millis ?? parsed.currentTimeMillis;
        return typeof millis === 'number' && Number.isFinite(millis) ? millis : null;
    } catch {
        return null;
    }
};

/**
 * Fetches real time from Google's time API and calculates local clock skew.
 * Returns the skew in milliseconds (positive = local clock is ahead).
 */
const fetchClockSkew = async (): Promise<number | null> => {
    try {
        const beforeMs = Date.now();
        const resp = await got('https://clients2.google.com/time/1/current', {
            timeout: { request: 5000 },
        }).text();
        const afterMs = Date.now();
        const roundTripMs = afterMs - beforeMs;

        const remoteMs = parseTimeApiResponse(resp);
        if (remoteMs === null) {
            console.verbose.warn('Invalid response from time API');
            return null;
        }

        // Adjust for network round-trip (assume symmetric)
        const localEstimateMs = beforeMs + roundTripMs / 2;
        return localEstimateMs - remoteMs;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.verbose.warn(`Failed to check clock skew: ${message}`);
        return null;
    }
};

/**
 * Checks clock skew on boot and logs a warning if significant.
 */
export const checkClockSkew = async () => {
    const skewMs = await fetchClockSkew();
    if (skewMs === null) return;

    cachedSkewMs = skewMs;
    const absSkew = Math.abs(skewMs);
    if (absSkew > SKEW_WARN_THRESHOLD_MS) {
        const direction = skewMs > 0 ? 'ahead' : 'behind';
        const seconds = Math.round(absSkew / 1000);
        console.warn(
            `Server clock is ${seconds}s ${direction} real time. This may cause issues with ban expirations, player timestamps, and scheduler.`,
        );
    } else {
        console.verbose.log(`Clock skew: ${Math.round(skewMs)}ms (within tolerance).`);
    }
};

/**
 * Returns the cached clock skew in milliseconds, or null if not yet checked.
 */
export const getClockSkewMs = () => cachedSkewMs;
