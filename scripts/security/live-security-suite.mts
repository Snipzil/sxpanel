/**
 * Live security verification against a running sxPanel instance.
 *
 * Usage:
 *   $env:SECURITY_TEST_BASE_URL = 'http://127.0.0.1:40120'
 *   $env:SECURITY_TEST_USER = 'Cursor'
 *   $env:SECURITY_TEST_PASSWORD = '<password>'
 *   $env:SECURITY_TEST_LUA_TOKEN = '<optional luaComToken from server>'
 *   npx tsx scripts/security/live-security-suite.mts
 */
import { io, type Socket } from 'socket.io-client';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = (process.env.SECURITY_TEST_BASE_URL ?? 'http://127.0.0.1:40120').replace(/\/$/, '');
const USER = process.env.SECURITY_TEST_USER ?? '';
const PASS = process.env.SECURITY_TEST_PASSWORD ?? '';
const LUA_TOKEN = process.env.SECURITY_TEST_LUA_TOKEN ?? '';

type Result = {
    id: string;
    category: string;
    name: string;
    status: 'pass' | 'fail' | 'warn' | 'skip';
    detail: string;
};

const results: Result[] = [];

function record(category: string, name: string, status: Result['status'], detail: string) {
    const id = `${category}/${name}`.replace(/\s+/g, '_');
    results.push({ id, category, name, status, detail });
    const icon = status === 'pass' ? 'OK' : status === 'fail' ? 'FAIL' : status === 'warn' ? 'WARN' : 'SKIP';
    console.log(`[${icon}] ${category} :: ${name} — ${detail}`);
}

/** Minimal cookie jar for fetch */
class CookieJar {
    private cookies = new Map<string, string>();

    ingest(setCookie: string | null) {
        if (!setCookie) return;
        const parts = setCookie.split(/,(?=\s*[^;,]+=)/);
        for (const part of parts) {
            const [pair] = part.split(';');
            const eq = pair.indexOf('=');
            if (eq < 1) continue;
            const name = pair.slice(0, eq).trim();
            const value = pair.slice(eq + 1).trim();
            if (value) this.cookies.set(name, value);
            else this.cookies.delete(name);
        }
    }

    header() {
        if (!this.cookies.size) return '';
        return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    }
}

async function fetchJson(jar: CookieJar, path: string, init: RequestInit & { csrf?: string } = {}) {
    const headers: Record<string, string> = {
        Accept: 'application/json',
        ...(init.headers as Record<string, string>),
    };
    const cookie = jar.header();
    if (cookie) headers.Cookie = cookie;
    if (init.csrf) headers['X-TxAdmin-CsrfToken'] = init.csrf;

    const res = await fetch(`${BASE}${path}`, { ...init, headers });
    jar.ingest(res.headers.get('set-cookie'));
    const text = await res.text();
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch {
        json = { _raw: text.slice(0, 200) };
    }
    return { res, json, text };
}

async function login(jar: CookieJar): Promise<{ csrf: string; name: string } | null> {
    if (!USER || !PASS) {
        record('auth', 'login', 'skip', 'Set SECURITY_TEST_USER and SECURITY_TEST_PASSWORD');
        return null;
    }
    const { res, json } = await fetchJson(jar, '/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: USER, password: PASS }),
    });
    const body = json as Record<string, unknown>;
    if (!res.ok || typeof body.error === 'string') {
        record('auth', 'login', 'fail', `HTTP ${res.status}: ${body.error ?? 'unknown'}`);
        return null;
    }
    const csrf = typeof body.csrfToken === 'string' ? body.csrfToken : '';
    const name = typeof body.name === 'string' ? body.name : USER;
    if (!csrf) {
        record('auth', 'login', 'fail', 'No csrfToken in login response');
        return null;
    }
    record('auth', 'login', 'pass', `Logged in as ${name}, session cookie set`);
    return { csrf, name };
}

async function testCsrfApi(jar: CookieJar, csrf: string) {
    const noCsrf = await fetchJson(jar, '/auth/self');
    const denied = noCsrf.json as Record<string, unknown>;
    if (noCsrf.res.status === 200 && typeof denied.name === 'string') {
        record('csrf', 'self without CSRF header', 'fail', 'GET /auth/self succeeded without X-TxAdmin-CsrfToken');
    } else if (denied.logout === true || denied.error || denied.msg) {
        record('csrf', 'self without CSRF header', 'pass', 'Protected route rejected missing CSRF');
    } else {
        record(
            'csrf',
            'self without CSRF header',
            'warn',
            `Unexpected response: ${JSON.stringify(denied).slice(0, 120)}`,
        );
    }

    const withCsrf = await fetchJson(jar, '/auth/self', { csrf });
    const self = withCsrf.json as Record<string, unknown>;
    if (withCsrf.res.status === 200 && typeof self.name === 'string') {
        record('csrf', 'self with CSRF', 'pass', `Authenticated as ${self.name}`);
    } else {
        record('csrf', 'self with CSRF', 'fail', JSON.stringify(self).slice(0, 200));
    }
}

async function testCsrfDownload(jar: CookieJar) {
    const dl = await fetch(`${BASE}/logs/server/download?file=fxserver`, {
        headers: { Cookie: jar.header(), Accept: '*/*' },
        redirect: 'manual',
    });
    const ct = dl.headers.get('content-type') ?? '';
    const text = await dl.text();
    if (dl.status === 200 && !text.includes('login') && !text.includes('Invalid session') && text.length > 100) {
        record(
            'csrf',
            'log download GET without CSRF',
            'fail',
            `Authenticated session can GET download (${text.length} bytes) — cookie CSRF risk`,
        );
    } else if (text.includes('login') || text.includes('Invalid session')) {
        record('csrf', 'log download GET without CSRF', 'pass', 'Returned logout/unauth page');
    } else {
        record('csrf', 'log download GET without CSRF', 'warn', `HTTP ${dl.status} ct=${ct} len=${text.length}`);
    }
}

async function testLogoutCsrf(jar: CookieJar) {
    const logoutNoCsrf = await fetchJson(jar, '/auth/logout', { method: 'POST' });
    const logoutBody = logoutNoCsrf.json as Record<string, unknown>;
    if (logoutBody.logout === true) {
        record(
            'csrf',
            'logout without CSRF',
            'fail',
            'POST /auth/logout succeeded without CSRF — CSRF logout possible',
        );
    } else {
        record('csrf', 'logout without CSRF', 'pass', 'Logout blocked or failed without CSRF');
    }
}

async function testHostStatus() {
    const res = await fetch(`${BASE}/host/status`);
    const body = await res.text();
    if (res.status === 200 && body.length > 2 && !body.includes('token missing')) {
        record(
            'host',
            '/host/status open',
            'warn',
            `HTTP 200 without token (${body.slice(0, 80)}) — check TXHOST_API_TOKEN`,
        );
    } else if (body.includes('token missing') || body.includes('invalid token')) {
        record('host', '/host/status requires token', 'pass', 'Host API not open without token');
    } else {
        record('host', '/host/status', 'warn', `HTTP ${res.status}: ${body.slice(0, 100)}`);
    }
}

async function testProxyHeaders() {
    const res = await fetch(`${BASE}/intercom/monitor`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': '203.0.113.99',
            'X-Real-IP': '203.0.113.99',
        },
        body: JSON.stringify({ txAdminToken: 'invalid-token-xyz' }),
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (json.error === 'invalid request origin') {
        record('proxy', 'X-Forwarded-For spoof blocks intercom', 'pass', 'Non-local IP rejected despite localhost TCP');
    } else if (json.error === 'invalid token') {
        record(
            'proxy',
            'X-Forwarded-For spoof',
            'warn',
            'TCP localhost still trusted (trustProxy likely off) — token check reached',
        );
    } else {
        record('proxy', 'X-Forwarded-For spoof', 'warn', JSON.stringify(json).slice(0, 120));
    }
}

async function testIntercom() {
    const bad = await fetch(`${BASE}/intercom/monitor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txAdminToken: 'invalid-token-xyz' }),
    });
    const badJson = (await bad.json()) as Record<string, unknown>;
    if (badJson.error === 'invalid token') {
        record('intercom', 'invalid token localhost', 'pass', 'Rejected bad txAdminToken from 127.0.0.1');
    } else {
        record('intercom', 'invalid token localhost', 'warn', JSON.stringify(badJson));
    }

    if (!LUA_TOKEN) {
        record('intercom', 'adminName spoof', 'skip', 'Set SECURITY_TEST_LUA_TOKEN to test spoofed adminName');
        record('intercom', 'valid token monitor', 'skip', 'No LUA token provided');
        return;
    }

    const mon = await fetch(`${BASE}/intercom/monitor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txAdminToken: LUA_TOKEN }),
    });
    const monJson = (await mon.json()) as Record<string, unknown>;
    if (monJson.error) {
        record('intercom', 'valid token monitor', 'fail', String(monJson.error));
        return;
    }
    record('intercom', 'valid token monitor', 'pass', 'monitor scope accepted with valid token');

    const spoof = await fetch(`${BASE}/intercom/reportAdminList`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txAdminToken: LUA_TOKEN, adminName: 'TotallyFakeAdmin_99999' }),
    });
    if (spoof.status === 200) {
        record(
            'intercom',
            'adminName spoof reportAdminList',
            'fail',
            'Accepted arbitrary adminName with only intercom token',
        );
    } else {
        record('intercom', 'adminName spoof reportAdminList', 'pass', `HTTP ${spoof.status}`);
    }
}

function socketTest(jar: CookieJar, csrf: string): Promise<void> {
    return new Promise((resolve) => {
        const cookie = jar.header();
        if (!cookie) {
            record('socket.io', 'connect', 'skip', 'No session cookie');
            resolve();
            return;
        }

        const socket: Socket = io(BASE, {
            path: '/socket.io',
            transports: ['polling', 'websocket'],
            extraHeaders: { Cookie: cookie },
            withCredentials: true,
            timeout: 12000,
        });

        const timer = setTimeout(() => {
            socket.close();
            record('socket.io', 'connect', 'fail', 'Timeout waiting for connection');
            resolve();
        }, 10000);

        socket.on('connect', () => {
            record('socket.io', 'connect', 'pass', `Connected sid=${socket.id}`);
            socket.emit('joinSocketRoom', 'status');
        });

        socket.on('connect_error', (err) => {
            clearTimeout(timer);
            record('socket.io', 'connect', 'fail', err.message);
            resolve();
        });

        socket.on('logout', (reason) => {
            record('socket.io', 'logout event', 'warn', String(reason));
        });

        let gotData = false;
        socket.on('status', () => {
            gotData = true;
        });

        socket.on('statusPlayerlist', () => {
            gotData = true;
        });

        setTimeout(() => {
            clearTimeout(timer);
            if (gotData) {
                record('socket.io', 'status room data', 'pass', 'Received room payload after joinSocketRoom');
            } else {
                record('socket.io', 'status room data', 'warn', 'Connected but no status payload within 3s');
            }
            socket.close();
            resolve();
        }, 3000);
    });
}

async function loadTest() {
    const url = `${BASE}/`;
    const concurrency = 20;
    const requests = 200;
    const start = performance.now();
    let ok = 0;
    let err = 0;
    let rateLimited = 0;
    let nextIdx = 0;

    const workers = Array.from({ length: concurrency }, async () => {
        while (true) {
            const i = nextIdx++;
            if (i >= requests) break;
            try {
                const res = await fetch(url, { method: 'GET' });
                if (res.status === 200) ok++;
                else if (res.status === 429) rateLimited++;
                else err++;
            } catch {
                err++;
            }
        }
    });
    await Promise.all(workers);
    const ms = performance.now() - start;
    const rps = (requests / ms) * 1000;
    record(
        'load',
        `GET / x${requests} @${concurrency}c`,
        rateLimited > requests * 0.5 ? 'warn' : 'pass',
        `${ok} ok, ${rateLimited} rate-limited, ${err} errors, ${rps.toFixed(1)} req/s, ${ms.toFixed(0)}ms`,
    );
}

async function main() {
    console.log(`\n=== sxPanel live security suite ===\nBase: ${BASE}\n`);

    const health = await fetch(`${BASE}/`);
    if (!health.ok) {
        record('infra', 'panel reachable', 'fail', `HTTP ${health.status}`);
        writeReport();
        process.exit(1);
    }
    record('infra', 'panel reachable', 'pass', `HTTP ${health.status}`);

    const jar = new CookieJar();
    const session = await login(jar);
    if (session) {
        await testCsrfApi(jar, session.csrf);
        await testCsrfDownload(jar);
        await socketTest(jar, session.csrf);
        await testLogoutCsrf(jar);
    }

    await testHostStatus();
    await testProxyHeaders();
    await testIntercom();
    await loadTest();

    writeReport();
}

function writeReport() {
    const outPath = join(process.cwd(), 'scripts', 'security', 'LIVE_SECURITY_RESULTS.json');
    const summary = {
        runAt: new Date().toISOString(),
        baseUrl: BASE,
        user: USER || '(not set)',
        counts: {
            pass: results.filter((r) => r.status === 'pass').length,
            fail: results.filter((r) => r.status === 'fail').length,
            warn: results.filter((r) => r.status === 'warn').length,
            skip: results.filter((r) => r.status === 'skip').length,
        },
        results,
    };
    writeFileSync(outPath, JSON.stringify(summary, null, 2));
    console.log(`\nWrote ${outPath}`);
    console.log(
        `Summary: ${summary.counts.pass} pass, ${summary.counts.fail} fail, ${summary.counts.warn} warn, ${summary.counts.skip} skip`,
    );
    if (summary.counts.fail > 0) process.exitCode = 1;
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
