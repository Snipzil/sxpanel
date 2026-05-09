const modulename = 'WebServer:SessionMws';
import fs from 'node:fs';
import type {
    CfxreSessAuthType,
    DiscordSessAuthType,
    PassSessAuthType,
    Pending2faSessAuthType,
} from '@modules/WebServer/authLogic';
import { LRUCacheWithDelete } from 'mnemonist';
import { RawKoaCtx } from '@modules/WebServer/ctxTypes';
import { Next } from 'koa';
import { randomUUID } from 'node:crypto';
import { Socket } from 'socket.io';
import { parse as cookieParse } from 'cookie';
import Keygrip from 'keygrip';
import { SetOption as KoaCookieSetOption } from 'cookies';
import type { DeepReadonly } from 'utility-types';
import consoleFactory from '@lib/console';
const console = consoleFactory(modulename);

//Types
export type AddMasterUserInfoType = {
    name: string;
    identifier: string;
};
export type ValidSessionType = {
    auth?: PassSessAuthType | CfxreSessAuthType | DiscordSessAuthType | Pending2faSessAuthType;
    tmpAddMasterUserInfo?: AddMasterUserInfoType;
    tmpDiscourseNonce?: string; //uuid v4
    tmpDiscoursePrivateKey?: string; //PEM-encoded RSA private key
    tmpDiscordOAuthState?: string; //uuid v4
    tmpDiscordRedirectUri?: string; //redirect URI bound at authorize time
    tmpTotpSecret?: string; //pending TOTP secret during 2FA setup
};
export type SessToolsType = {
    get: () => DeepReadonly<ValidSessionType> | undefined;
    set: (sess: ValidSessionType) => void;
    /**
     * Rotate the session identifier and store `sess` under the new id.
     * Must be called on every privilege-level transition (login, 2FA promotion)
     * to defeat session-fixation: an attacker who planted a session cookie
     * pre-login cannot hijack the post-auth session, since the id changes.
     */
    regenerate: (sess: ValidSessionType) => void;
    destroy: () => void;
};
type StoredSessionType = {
    expires: number;
    data: ValidSessionType;
};

/**
 * Storage for the sessions, with optional file persistence.
 */
export class SessionMemoryStorage {
    private readonly sessions = new LRUCacheWithDelete<string, StoredSessionType>(5000);
    public readonly maxAgeMs = 24 * 60 * 60 * 1000;
    private readonly persistFilePath: string | null;
    private cleanupInterval: ReturnType<typeof setInterval> | null = null;

    constructor(maxAgeMs?: number, persistFilePath?: string) {
        if (maxAgeMs) {
            this.maxAgeMs = maxAgeMs;
        }
        this.persistFilePath = persistFilePath ?? null;

        //Restore from disk if persistence is enabled
        if (this.persistFilePath) {
            this.loadFromFile();
        }

        //Cleanup every 5 mins
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            for (const [key, sess] of [...this.sessions]) {
                if (sess.expires < now) {
                    this.sessions.delete(key);
                }
            }
        }, 5 * 60_000);
    }

    dispose() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    get(key: string) {
        const stored = this.sessions.get(key);
        if (!stored) return;
        if (stored.expires < Date.now()) {
            this.sessions.delete(key);
            return;
        }
        return stored.data as DeepReadonly<ValidSessionType>;
    }

    set(key: string, sess: ValidSessionType) {
        this.sessions.set(key, {
            expires: Date.now() + this.maxAgeMs,
            data: sess,
        });
    }

    refresh(key: string) {
        const stored = this.sessions.get(key);
        if (!stored) return;
        this.sessions.set(key, {
            expires: Date.now() + this.maxAgeMs,
            data: stored.data,
        });
    }

    destroy(key: string) {
        return this.sessions.delete(key);
    }

    get size() {
        return this.sessions.size;
    }

    /**
     * Persist session data to disk (called on shutdown).
     *
     * SECURITY: password-authenticated sessions (and pending-2FA sessions) carry
     * the admin's bcrypt `password_hash` on the session object so the auth layer
     * can invalidate sessions when a password changes. Persisting those hashes
     * to a JSON file on disk would expose them to any filesystem compromise
     * (backup leaks, shared hosting, path traversal). Those sessions are
     * therefore stripped on persist — affected users simply have to re-login
     * after a restart, while OAuth (cfxre / discord) sessions survive because
     * they carry no password material.
     */
    handleShutdown() {
        if (!this.persistFilePath) return;
        try {
            const now = Date.now();
            const entries: [string, StoredSessionType][] = [];
            let droppedSensitive = 0;
            for (const [key, sess] of this.sessions) {
                if (sess.expires <= now) continue;
                const authType = sess.data?.auth?.type;
                if (authType === 'password' || authType === 'pending_2fa') {
                    droppedSensitive++;
                    continue;
                }
                // Belt-and-braces: strip any unexpected password_hash fields
                // before serialising, in case the session shape evolves.
                const sanitisedData = { ...sess.data };
                if (sanitisedData.auth && 'password_hash' in sanitisedData.auth) {
                    const { password_hash: _ph, ...restAuth } = sanitisedData.auth as Record<string, unknown>;
                    void _ph;
                    sanitisedData.auth = restAuth as ValidSessionType['auth'];
                }
                entries.push([key, { expires: sess.expires, data: sanitisedData }]);
            }
            fs.writeFileSync(this.persistFilePath, JSON.stringify(entries), { mode: 0o600 });
            // Best-effort tighten perms on existing file (writeFileSync mode only
            // applies on create; chmod for updates).
            try {
                fs.chmodSync(this.persistFilePath, 0o600);
            } catch {
                /* ignore */
            }
            console.verbose.debug(
                `Persisted ${entries.length} sessions to disk (dropped ${droppedSensitive} password-authenticated).`,
            );
        } catch (error) {
            console.error(`Failed to persist sessions: ${(error as Error).message}`);
        }
    }

    /**
     * Restore session data from disk (called on boot).
     */
    private loadFromFile() {
        if (!this.persistFilePath) return;
        try {
            const raw = fs.readFileSync(this.persistFilePath, 'utf8');
            const entries: [string, StoredSessionType][] = JSON.parse(raw);
            if (!Array.isArray(entries)) throw new Error('data_is_not_an_array');
            const now = Date.now();
            let restored = 0;
            for (const [key, sess] of entries) {
                if (
                    typeof key === 'string' &&
                    sess &&
                    typeof sess.expires === 'number' &&
                    sess.expires > now &&
                    sess.data != null &&
                    typeof sess.data === 'object' &&
                    !Array.isArray(sess.data)
                ) {
                    // Defensively strip any lingering sensitive fields from
                    // older persisted files so password hashes can never be
                    // reintroduced into the live sessions Map.
                    const sanitisedData = { ...(sess.data as Record<string, unknown>) };
                    if (
                        sanitisedData.auth &&
                        typeof sanitisedData.auth === 'object' &&
                        !Array.isArray(sanitisedData.auth)
                    ) {
                        const { password_hash: _ph, ...restAuth } = sanitisedData.auth as Record<string, unknown>;
                        void _ph;
                        sanitisedData.auth = restAuth;
                    }
                    this.sessions.set(key, {
                        expires: sess.expires,
                        data: sanitisedData as ValidSessionType,
                    });
                    restored++;
                }
            }
            console.verbose.ok(`Restored ${restored} sessions from disk.`);
        } catch (error) {
            if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
                console.verbose.debug('No persisted sessions file found, starting fresh.');
            } else {
                console.warn(`Failed to load persisted sessions: ${(error as Error).message}`);
                console.warn('Starting with empty session store.');
            }
        }
    }
}

/**
 * Helper to check if the session id is valid
 */
const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isValidSessId = (sessId: string) => {
    if (typeof sessId !== 'string') return false;
    if (sessId.length !== 36) return false;
    return uuidV4Regex.test(sessId);
};

/**
 * Middleware factory to add sessTools to the koa context.
 */
export const koaSessMw = (cookieName: string, store: SessionMemoryStorage) => {
    // Determine if we should use secure cookies
    // Enable secure cookies if explicitly configured or in production
    const isSecureEnabled = txConfig.webServer.useSecureCookies || process.env.NODE_ENV === 'production';

    const cookieOptions = {
        path: '/',
        maxAge: store.maxAgeMs,
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: isSecureEnabled,
        overwrite: true,
        signed: true,
    } satisfies KoaCookieSetOption;

    // Log warning if secure cookies are enabled but not on HTTPS
    if (isSecureEnabled) {
        console.verbose.debug('Session cookies configured with secure flag enabled.');
    }

    //Middleware
    return async (ctx: RawKoaCtx, next: Next) => {
        const sessGet = () => {
            const sessId = ctx.cookies.get(cookieName);
            if (!sessId || !isValidSessId(sessId)) return;
            const stored = store.get(sessId);
            if (!stored) return;
            ctx._refreshSessionCookieId = sessId;
            return stored;
        };

        const sessSet = (sess: ValidSessionType) => {
            const sessId = ctx.cookies.get(cookieName);
            if (!sessId || !isValidSessId(sessId)) {
                const newSessId = randomUUID();
                ctx.cookies.set(cookieName, newSessId, cookieOptions);
                store.set(newSessId, sess);
            } else {
                store.set(sessId, sess);
            }
        };

        const sessRegenerate = (sess: ValidSessionType) => {
            // Destroy the old session (if any) and issue a brand-new id.
            const oldId = ctx.cookies.get(cookieName);
            if (oldId && isValidSessId(oldId)) {
                store.destroy(oldId);
            }
            const newSessId = randomUUID();
            ctx.cookies.set(cookieName, newSessId, cookieOptions);
            store.set(newSessId, sess);
            // Prevent the finally block from refreshing the stale old id
            ctx._refreshSessionCookieId = undefined;
        };

        const sessDestroy = () => {
            const sessId = ctx.cookies.get(cookieName);
            if (!sessId || !isValidSessId(sessId)) return;
            store.destroy(sessId);
            ctx.cookies.set(cookieName, '', { ...cookieOptions, maxAge: 0 });
        };

        ctx.sessTools = {
            get: sessGet,
            set: sessSet,
            regenerate: sessRegenerate,
            destroy: sessDestroy,
        } satisfies SessToolsType;

        try {
            await next();
        } finally {
            if (typeof ctx._refreshSessionCookieId === 'string') {
                ctx.cookies.set(cookieName, ctx._refreshSessionCookieId, cookieOptions);
                store.refresh(ctx._refreshSessionCookieId);
            }
        }
    };
};

/**
 * Middleware factory to add sessTools to the socket context.
 *
 * NOTE: The set() and destroy() functions are NO-OPs because we cannot set cookies in socket.io,
 *  but that's fine since socket pages are always acompanied by a web page
 *  the authLogic only needs to get the cookie, and the webAuthMw only destroys it
 *  and webSocket.handleConnection() just drops if authLogic fails.
 */
export const socketioSessMw = (cookieName: string, store: SessionMemoryStorage, cookieKeys: string[]) => {
    if (!Array.isArray(cookieKeys) || !cookieKeys.length) {
        throw new Error('socketioSessMw: cookieKeys must be a non-empty array');
    }
    const keygrip = new Keygrip(cookieKeys);
    return (socket: Socket & { sessTools?: SessToolsType }, next: (err?: any) => void) => {
        const sessGet = () => {
            const cookiesString = socket?.handshake?.headers?.cookie;
            if (typeof cookiesString !== 'string') return;
            const cookies = cookieParse(cookiesString);
            const sessId = cookies[cookieName];
            if (!sessId || !isValidSessId(sessId)) return;
            const sig = cookies[`${cookieName}.sig`];
            if (!sig || !keygrip.verify(`${cookieName}=${sessId}`, sig)) return;
            return store.get(sessId);
        };

        socket.sessTools = {
            get: sessGet,
            set: (_sess: ValidSessionType) => {},
            regenerate: (_sess: ValidSessionType) => {},
            destroy: () => {},
        } satisfies SessToolsType;

        return next();
    };
};
