/**
 * Limits for the in-memory panel static cache bootstrapped at WebServer startup.
 * Each cached file is stored as raw + gzip + brotli buffers.
 *
 * Keep `panel/scripts/verify-static-cache-limit.mjs` in sync when changing MAX_FILES.
 */
export const PANEL_STATIC_CACHE_LIMITS = {
    MAX_BYTES: 75 * 1024 * 1024, // 75MB
    MAX_FILES: 500,
    MAX_DEPTH: 10,
    MAX_TIME: 2 * 60 * 1000, // 2 minutes
} as const;
