/**
 * Standalone TOTP utility module.
 * All 2FA cryptographic logic is isolated here for easy removal.
 * No dependencies on AdminStore, sessions, or routes.
 */
import { TOTP, Secret } from 'otpauth';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

const TOTP_ISSUER = 'sxPanel';
const TOTP_PERIOD = 30;
const TOTP_DIGITS = 6;
const TOTP_ALGORITHM = 'SHA1';
const BACKUP_CODE_COUNT = 10;

/**
 * Generate a new TOTP secret
 */
export function generateTotpSecret(): string {
    const secret = new Secret({ size: 20 });
    return secret.base32;
}

/**
 * Generate the otpauth:// URI for QR code rendering
 */
export function getTotpUri(secret: string, accountName: string): string {
    const totp = new TOTP({
        issuer: TOTP_ISSUER,
        label: accountName,
        algorithm: TOTP_ALGORITHM,
        digits: TOTP_DIGITS,
        period: TOTP_PERIOD,
        secret: Secret.fromBase32(secret),
    });
    return totp.toString();
}

/**
 * Replay-protection cache. Key is a SHA-256 of (secret + ":" + code); value is
 * the epoch-ms expiry. Entries expire after one full drift window
 * (period * (2 * window + 1)) so a captured code cannot be redeemed twice even
 * within the allowed drift band.
 *
 * Using a hash-keyed map (not the raw secret) so the cache contents aren't as
 * sensitive if dumped in a memory snapshot.
 */
const replayCache = new Map<string, number>();
const REPLAY_TTL_MS = TOTP_PERIOD * 3 * 1000; //window=1 → 3 periods
let lastReplaySweep = 0;
const sweepReplayCache = (now: number) => {
    if (now - lastReplaySweep < 30_000) return;
    lastReplaySweep = now;
    for (const [k, exp] of replayCache) if (exp <= now) replayCache.delete(k);
};

/**
 * Verify a TOTP code against a secret.
 * Allows 1 window of drift (previous + current + next period).
 * Rejects codes that were already accepted within the drift window
 * (prevents replay of intercepted/shoulder-surfed codes).
 */
export function verifyTotpCode(secret: string, code: string): boolean {
    const totp = new TOTP({
        issuer: TOTP_ISSUER,
        algorithm: TOTP_ALGORITHM,
        digits: TOTP_DIGITS,
        period: TOTP_PERIOD,
        secret: Secret.fromBase32(secret),
    });
    const delta = totp.validate({ token: code, window: 1 });
    if (delta === null) return false;

    const now = Date.now();
    sweepReplayCache(now);
    const key = createHash('sha256').update(secret).update(':').update(code).digest('hex');
    const existingExpiry = replayCache.get(key);
    if (existingExpiry !== undefined && existingExpiry > now) {
        return false;
    }
    replayCache.set(key, now + REPLAY_TTL_MS);
    return true;
}

/**
 * Generate backup codes (plaintext + hashed pairs)
 */
export function generateBackupCodes(): { plaintext: string[]; hashed: string[] } {
    const plaintext: string[] = [];
    const hashed: string[] = [];
    for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
        const code = randomBytes(4).toString('hex'); // 8 char hex codes
        plaintext.push(code);
        hashed.push(hashBackupCode(code));
    }
    return { plaintext, hashed };
}

/**
 * Hash a backup code for storage (SHA-256, not reversible)
 */
export function hashBackupCode(code: string): string {
    return createHash('sha256').update(code.toLowerCase().trim()).digest('hex');
}

/**
 * Verify a backup code against the hashed list.
 * Returns the index of the matched code, or -1 if not found.
 *
 * Iterates every candidate without short-circuiting and uses
 * `crypto.timingSafeEqual` so match position is not leaked via latency.
 */
export function verifyBackupCode(code: string, hashedCodes: string[]): number {
    const inputBuf = Buffer.from(hashBackupCode(code));
    let matchedIndex = -1;
    for (let i = 0; i < hashedCodes.length; i++) {
        const candidateBuf = Buffer.from(hashedCodes[i]);
        const sameLength = candidateBuf.length === inputBuf.length;
        // Run a comparison unconditionally so the loop body's cost is constant
        // regardless of whether the lengths match (defensive — all hashes are
        // 64-char sha256 hex in practice, but the input may be malformed).
        const cmpBuf = sameLength ? candidateBuf : inputBuf;
        const isEqual = timingSafeEqual(cmpBuf, inputBuf) && sameLength;
        if (isEqual && matchedIndex === -1) {
            matchedIndex = i;
        }
    }
    return matchedIndex;
}
