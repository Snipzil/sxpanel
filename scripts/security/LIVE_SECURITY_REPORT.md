# Live security verification report

**Run date:** 2026-05-21  
**Target:** `http://127.0.0.1:40120` (dev panel, FXServer + `npm run dev`)  
**Account:** `Cursor` (temp password — not stored in repo)  
**Harness:** `scripts/security/live-security-suite.mts`

---

## Summary

| Category               | Pass | Fail | Warn          | Skip                 |
| ---------------------- | ---- | ---- | ------------- | -------------------- |
| Live HTTP / Socket.IO  | 7    | 2    | 3             | 2                    |
| gitleaks (git history) | —    | —    | 65 findings\* | —                    |
| nginx staging          | —    | —    | —             | Docker not installed |
| Load test              | 1    | 0    | 0             | 0                    |

\* Mostly false positives (test Discord IDs, query string keys). See `GITLEAKS_REPORT.json`.

**Confirmed vulnerabilities (live):**

1. **CSRF logout** — `POST /auth/logout` succeeds with session cookie only (no `X-TxAdmin-CsrfToken`).
2. **Cookie-authenticated log download** — `GET /logs/server/download` returned log body (~authenticated session) without CSRF header (first run, before rate limit).
3. **Intercom `adminName` spoof** — not executed (needs `SECURITY_TEST_LUA_TOKEN`).

**Not vulnerable (live):**

- `GET /auth/self` requires CSRF when using `apiAuthMw`.
- Intercom rejects invalid `txAdminToken` from `127.0.0.1`.
- Socket.IO accepts session cookie on polling transport (auth works when session valid).

---

## 1. Authentication

- Login `POST /auth/password` with `Cursor` + temp password: **OK** (csrfToken returned, `fxp:*` session cookie set).
- After repeated test runs, **auth rate limiter** triggered (`HTTP 429`, 15 min block) — expected; space automated tests or whitelist CI IP.

---

## 2. CSRF / session cookie abuse

| Test                                             | Result                                                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `GET /auth/self` without CSRF                    | **Pass** — rejected (`logout` / error)                                                          |
| `GET /auth/self` with CSRF                       | **Pass** — `Cursor`                                                                             |
| `POST /auth/logout` without CSRF                 | **Fail** — `{ logout: true }`                                                                   |
| `GET /logs/server/download` with cookie, no CSRF | **Fail** (1st run) — HTTP 200 + log text; **Warn** (2nd run) — session destroyed by logout test |

**Fix:** Put `/auth/logout` behind `apiAuthMw` or require CSRF; move log downloads to `apiAuthMw` or signed one-time tokens.

---

## 3. Socket.IO

| Test                           | Result                                                                     |
| ------------------------------ | -------------------------------------------------------------------------- |
| Connect with session cookie    | **Pass** — `transports: ['polling','websocket']`                           |
| `joinSocketRoom` + status data | **Warn** — connected; no status event in 3s (may need FX server heartbeat) |

Earlier failures were from `websocket`-only transport and from running socket after logout destroyed the session.

---

## 4. Intercom

| Test                               | Result                                       |
| ---------------------------------- | -------------------------------------------- |
| Bad token from localhost           | **Pass** — `invalid token`                   |
| Spoof `adminName` with valid token | **Skipped** — need `SECURITY_TEST_LUA_TOKEN` |

**Get token for full intercom abuse test** (server console, brief window):

```txt
get txAdmin-luaComToken
```

Or set env and re-run:

```powershell
$env:SECURITY_TEST_LUA_TOKEN = '<paste token>'
npx tsx scripts/security/live-security-suite.mts
```

---

## 5. Host API

Check `GET /host/status` without token — if `TXHOST_API_TOKEN=disabled`, returns host JSON (**critical**). Run with your host env; not overridden in this pass.

---

## 6. Load test

- `200` requests, `20` concurrent `GET /` → **~46–284 req/s**, `0` × 429 on index (global limiter permissive for static/HTML).

---

## 7. gitleaks

- Tool: gitleaks **8.24.2** (downloaded to `%TEMP%\gitleaks.exe`)
- **65** findings in git history — overwhelmingly test fixtures / false positives
- Report: `scripts/security/GITLEAKS_REPORT.json`
- **Action:** Tighten `.gitleaks.toml` allowlist for `*.test.ts`; run in CI; triage any real secrets manually

---

## 8. nginx staging (skipped)

- **Docker not available** on this host → could not run `scripts/security/docker-compose.nginx.yml`
- Config prepared: proxy `40121` → host `40120` with `X-Forwarded-For: 203.0.113.50`, `X-Forwarded-Proto: https`
- **Manual:** Install Docker Desktop, then:

```powershell
docker compose -f scripts/security/docker-compose.nginx.yml up -d
# Enable webServer.trustProxy in panel settings, re-test intercom + rate limits via http://localhost:40121
```

---

## 9. Proxy header probe (no nginx)

`POST /intercom/monitor` from TCP localhost with `X-Forwarded-For: 203.0.113.99` — if still `invalid token` (not `invalid request origin`), **trustProxy is off** and socket IP is used (expected default).

---

## Re-run

```powershell
cd C:\Users\Eli\Downloads\sxPanel\sxPanel-v1.0.0
$env:SECURITY_TEST_BASE_URL = 'http://127.0.0.1:40120'
$env:SECURITY_TEST_USER = 'Cursor'
$env:SECURITY_TEST_PASSWORD = '<your password>'
# optional: $env:SECURITY_TEST_LUA_TOKEN = '...'
npx tsx scripts/security/live-security-suite.mts
```

Machine-readable: `scripts/security/LIVE_SECURITY_RESULTS.json`

---

## Recommended fixes (priority)

1. CSRF on logout + log downloads
2. Intercom: bind `adminName` to verified identity
3. Add gitleaks to CI with tuned config
4. Install Docker / run nginx staging before enabling `trustProxy` in production
