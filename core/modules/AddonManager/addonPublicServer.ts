const modulename = 'AddonPublicServer';
import fs from 'node:fs';
import Koa from 'koa';
import HttpsClass from 'node:https';
import type { Server as HttpsServer } from 'node:https';

import consoleFactory from '@lib/console';
import xssFactory from '@lib/xss';
import type AddonProcess from './addonProcess';
const console = consoleFactory(modulename);

/**
 * Rate limiter — simple per-IP counter that resets every minute.
 * Counters are kept per AddonPublicServer instance so each addon has an
 * isolated rate-limit pool.
 */
const MAX_RPM = 600;

const sanitiseXss = xssFactory();
const stripNewlines = (value: string) => value.replace(/[\r\n]+/g, ' ').trim();
const ALLOWED_RESPONSE_HEADERS = new Set([
    'cache-control',
    'content-language',
    'content-type',
    'etag',
    'expires',
    'last-modified',
    'location',
    'pragma',
    'vary',
]);
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

type TlsCredentials = {
    key: string | Buffer;
    cert: string | Buffer;
};

const getTlsCredentials = (): TlsCredentials => {
    const rawKey = process.env.TXHOST_ADDON_PUBLIC_TLS_KEY;
    const rawCert = process.env.TXHOST_ADDON_PUBLIC_TLS_CERT;
    if (rawKey && rawCert) {
        return { key: rawKey, cert: rawCert };
    }

    const keyPath = process.env.TXHOST_ADDON_PUBLIC_TLS_KEY_FILE;
    const certPath = process.env.TXHOST_ADDON_PUBLIC_TLS_CERT_FILE;
    if (keyPath && certPath) {
        return {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath),
        };
    }

    throw new Error(
        'Public addon server requires TLS credentials. Set TXHOST_ADDON_PUBLIC_TLS_KEY + TXHOST_ADDON_PUBLIC_TLS_CERT or TXHOST_ADDON_PUBLIC_TLS_KEY_FILE + TXHOST_ADDON_PUBLIC_TLS_CERT_FILE.',
    );
};

const sanitiseResponseBody = (value: unknown): unknown => {
    if (typeof value === 'string') return sanitiseXss(value);
    if (Array.isArray(value)) return value.map((item) => sanitiseResponseBody(item));
    if (value && typeof value === 'object') {
        const safeObject: Record<string, unknown> = {};
        for (const [key, innerValue] of Object.entries(value)) {
            safeObject[key] = sanitiseResponseBody(innerValue);
        }
        return safeObject;
    }
    return value;
};

type ProcessResolver = (addonId: string) => AddonProcess | null;

/**
 * AddonPublicServer — Standalone HTTP server for public addon routes.
 *
 * Listens on a configurable port, routes all requests to a single addon
 * via the `public-request` IPC message type (no authentication).
 * The addon owns the entire URL space: / → home, /rules → rules page, etc.
 */
export default class AddonPublicServer {
    private app: Koa;
    private httpServer: HttpsServer | null = null;
    private ipClearTimer: ReturnType<typeof setInterval> | null = null;
    private readonly ipCounters = new Map<string, number>();
    private readonly port: number;
    private readonly addonId: string;
    private readonly getProcess: ProcessResolver;
    public isListening = false;
    private isStarting = false;

    private checkRate(ip: string): boolean {
        const count = this.ipCounters.get(ip) ?? 0;
        this.ipCounters.set(ip, count + 1);
        return count < MAX_RPM;
    }

    constructor(port: number, addonId: string, getProcess: ProcessResolver) {
        this.port = port;
        this.addonId = addonId;
        this.getProcess = getProcess;

        this.app = new Koa();

        // Error handler
        this.app.on('error', (error) => {
            if ((error as any).code === 'ECONNRESET') return;
            console.error(`Koa error: ${(error as Error).message}`);
        });

        // Main routing middleware
        this.app.use(async (ctx) => {
            // Rate limit
            const ip = ctx.ip;
            if (!this.checkRate(ip)) {
                ctx.status = 429;
                ctx.body = { error: 'Too many requests' };
                return;
            }

            const addonProcess = this.getProcess(this.addonId);
            if (!addonProcess) {
                ctx.status = 503;
                ctx.body = { error: 'Addon is not running' };
                return;
            }

            try {
                const sanitisedHeaders: Record<string, string> = {};
                for (const [key, value] of Object.entries(ctx.headers)) {
                    if (value === undefined) continue;
                    const lower = key.toLowerCase();
                    if (
                        lower === 'cookie' ||
                        lower === 'authorization' ||
                        lower === 'x-txadmin-csrftoken' ||
                        lower === 'x-txadmin-token'
                    )
                        continue;
                    if (!/^[a-z0-9-]+$/i.test(lower)) continue;
                    const joined = Array.isArray(value) ? value.join(', ') : String(value);
                    sanitisedHeaders[lower] = sanitiseXss(stripNewlines(joined));
                }

                const normalisedMethod = ALLOWED_METHODS.has(ctx.method.toUpperCase())
                    ? ctx.method.toUpperCase()
                    : 'GET';
                const normalisedPath = /^\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]*$/.test(ctx.path || '/')
                    ? ctx.path || '/'
                    : '/';

                const result = await addonProcess.handlePublicRequest({
                    method: normalisedMethod,
                    path: normalisedPath,
                    headers: sanitisedHeaders,
                    body: null,
                });

                ctx.status = result.status;
                if (result.headers) {
                    for (const [key, value] of Object.entries(result.headers)) {
                        const lowerKey = key.toLowerCase();
                        if (!ALLOWED_RESPONSE_HEADERS.has(lowerKey)) continue;
                        ctx.set(lowerKey, stripNewlines(String(value)));
                    }
                }
                ctx.body = sanitiseResponseBody(result.body);
            } catch (error) {
                console.error(`Public request error for ${this.addonId}: ${(error as Error).message}`);
                ctx.status = 504;
                ctx.body = { error: 'Request timed out' };
            }
        });
    }

    /**
     * Start listening on the configured port.
     */
    async start(): Promise<void> {
        if (this.isListening || this.isStarting) return;
        this.isStarting = true;
        if (!this.ipClearTimer) {
            this.ipClearTimer = setInterval(() => this.ipCounters.clear(), 60_000);
        }

        return new Promise((resolve, reject) => {
            this.httpServer = HttpsClass.createServer(getTlsCredentials(), this.app.callback());

            this.httpServer.on('error', (error: NodeJS.ErrnoException) => {
                this.isStarting = false;
                this.isListening = false;
                if (this.ipClearTimer) {
                    clearInterval(this.ipClearTimer);
                    this.ipClearTimer = null;
                }
                if (error.code === 'EADDRINUSE') {
                    console.error(`Port ${this.port} is already in use. Public server not started.`);
                    reject(error);
                } else {
                    console.error(`HTTPS server error: ${error.message}`);
                    reject(error);
                }
            });

            this.httpServer.listen(this.port, '0.0.0.0');
            this.httpServer.on('listening', () => {
                this.isStarting = false;
                this.isListening = true;
                console.log(`Public server listening on port ${this.port} (HTTPS)`);
                resolve();
            });
        });
    }

    /**
     * Stop the HTTP server.
     */
    async stop(): Promise<void> {
        if (!this.httpServer || !this.isListening) return;
        if (this.ipClearTimer) {
            clearInterval(this.ipClearTimer);
            this.ipClearTimer = null;
        }

        return new Promise((resolve) => {
            this.httpServer!.close(() => {
                this.isStarting = false;
                this.isListening = false;
                this.httpServer = null;
                console.log('Public server stopped');
                resolve();
            });
        });
    }
}
