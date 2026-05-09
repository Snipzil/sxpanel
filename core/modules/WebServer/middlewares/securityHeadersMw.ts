const modulename = 'WebServer:SecurityHeadersMw';
import crypto from 'node:crypto';
import consoleFactory from '@lib/console';
const console = consoleFactory(modulename);
import { Next } from 'koa';
import { RawKoaCtx } from '../ctxTypes';
import { txDevEnv } from '@core/globalData';

/**
 * Builds the Content-Security-Policy header string.
 * In production, uses a per-request nonce instead of 'unsafe-inline' for scripts.
 * 'unsafe-eval' is kept only for Monaco Editor which requires it.
 * In development, allows Vite dev server connections with unsafe-inline/eval.
 */
const buildCSP = (isDev: boolean, nonce?: string): string => {
    const cspDirectives: Record<string, string[]> = {
        'default-src': ["'self'"],
        'script-src': isDev
            ? ["'self'", "'unsafe-inline'", "'unsafe-eval'"]
            : ["'self'", `'nonce-${nonce}'`, "'unsafe-eval'"],
        'worker-src': ["'self'", 'blob:'],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'blob:', 'https:', 'http:'],
        'font-src': ["'self'"],
        'connect-src': ["'self'", 'ws:', 'wss:'],
        'media-src': ["'self'"],
        'object-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'form-action': ["'self'"],
        'base-uri': ["'self'"],
    };

    // In development mode, allow Vite dev server connections
    if (isDev) {
        const devHosts = ['http://localhost:*', 'ws://localhost:*', 'http://127.0.0.1:*', 'ws://127.0.0.1:*'];
        cspDirectives['script-src'].push(...devHosts);
        cspDirectives['connect-src'].push(...devHosts);
        cspDirectives['style-src'].push(...devHosts);
        cspDirectives['img-src'].push(...devHosts);
        // Allow fonts from dev server and file system
        cspDirectives['font-src'].push('http://localhost:*', 'http://127.0.0.1:*', 'data:', 'blob:');
        // Allow framing in dev mode for dev tools
        cspDirectives['frame-ancestors'] = ["'self'", 'http://localhost:*', 'http://127.0.0.1:*'];
    }

    // Allow external CDN resources commonly used by the application
    const trustedCDNs = ['https://cdnjs.cloudflare.com', 'https://unpkg.com', 'https://cdn.jsdelivr.net'];
    cspDirectives['script-src'].push(...trustedCDNs);
    cspDirectives['style-src'].push(...trustedCDNs);
    // Allow GitHub Raw for fetching txAdmin recipe index and custom recipe URLs
    cspDirectives['connect-src'].push(...trustedCDNs, 'https://raw.githubusercontent.com');
    // Allow fonts from trusted CDNs (e.g. Monaco editor codicon from jsdelivr)
    cspDirectives['font-src'].push(...trustedCDNs);
    if (!isDev) {
        cspDirectives['font-src'].push('data:');
    }

    return Object.entries(cspDirectives)
        .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
        .join('; ');
};

/**
 * Middleware responsible for setting security headers to protect against
 * common web vulnerabilities like XSS, clickjacking, and MIME sniffing.
 */
const securityHeadersMw = async (ctx: RawKoaCtx, next: Next) => {
    const isDevMode = txDevEnv.ENABLED === true;

    //Prevent clickjacking attacks by denying framing
    ctx.set('X-Frame-Options', 'DENY');

    //Prevent MIME type sniffing which could lead to XSS
    ctx.set('X-Content-Type-Options', 'nosniff');

    //Control referrer information to protect sensitive URLs
    ctx.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    //Disable browser features that aren't needed
    ctx.set(
        'Permissions-Policy',
        'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()',
    );

    //Set Content Security Policy to prevent XSS and data injection
    //In production, generate a unique nonce per request for inline scripts/styles
    let nonce: string | undefined;
    if (!isDevMode) {
        nonce = crypto.randomBytes(16).toString('base64');
        ctx.state.cspNonce = nonce;
    }
    ctx.set('Content-Security-Policy', buildCSP(isDevMode, nonce));

    //HSTS is only meaningful over TLS. Gate on ctx.secure so dev (usually http)
    //isn't broken, but prod behind a TLS-terminating proxy still gets it as long
    //as the proxy sets X-Forwarded-Proto (Koa reads this when app.proxy=true).
    if (ctx.secure) {
        ctx.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    }

    //Disable caching for sensitive pages that might contain player data
    //This is handled separately by cacheControlMw for most routes,
    //but we add an extra layer here for security-sensitive endpoints
    if (ctx.path.startsWith('/api/') || ctx.path.startsWith('/intercom/')) {
        ctx.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        ctx.set('Pragma', 'no-cache');
        ctx.set('Expires', '0');
    }

    await next();
};

export default securityHeadersMw;
