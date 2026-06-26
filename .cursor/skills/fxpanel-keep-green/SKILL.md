---
name: fxpanel-keep-green
description: Keep fxPanel changes green after audit or refactor work. Use when continuing audit fixes, changing package scripts/dependencies, touching core/panel/nui/shared code, or when the user asks to keep typecheck, tests, audit, and build passing.
user-invocable: true
---

# fxPanel Keep Green

## When To Use

- Continuing audit remediation in this repository.
- Making code, package, dependency, route, auth, build, or test changes.
- The user asks to keep everything passing or to update the audit canvas as work progresses.

## Required Workflow

1. Check the current tree before editing:
    - Run `git status --short`.
    - Assume unrelated dirty files are user work. Do not revert them.

2. If an audit canvas exists, update it as work progresses:
    - Mark findings as `Fixed`, `In progress`, or `Open`.
    - Update verification rows after each meaningful check.
    - Keep the canvas typecheck clean.

3. Prefer focused verification immediately after each fix:
    - For core auth/IP changes: `npm run test -w core -- lib/host/isIpAddressLocal.test.ts modules/WebServer/middlewares/authMws.test.ts`
    - For core test drift: run the changed test files with `npm run test -w core -- <test paths>`.
    - For shared changes: `npm run test -w shared` and `npm run typecheck -w shared`.
    - For panel changes: `npm run typecheck -w panel`.
    - For NUI changes: `npm run typecheck -w nui`.

4. Before handing off, run the green gates:
    - `npm run typecheck`
    - `npm run test`
    - `npm audit --audit-level=moderate`
    - `npm run build`

5. Report known non-blocking warnings separately:
    - Vite large chunk warnings are currently expected.
    - Panel font asset resolution warnings are currently expected.
    - `npm run format:check` may still fail on broad pre-existing formatting debt. Do not run `npm run format` unless the user asks for a formatting-only change.

## Project-Specific Notes

- Build output is `monitor/`; release packaging must zip `monitor/`, not `dist/`.
- `license:distfile` should use `generate-license-file.config.json` and `--overwrite`.
- `shared` tests should run with `vitest run`; do not restore the old skip message.
- The dependency scanner should not count `import type` as a runtime circular import edge.
- Keep host API tokens in `x-txadmin-envtoken`; do not reintroduce query-string `envtoken`.
- Sensitive browser downloads should stay CSRF-protected. Use POST form submissions with a body `csrfToken` rather than query tokens.

## Done Criteria

Before final response, summarize:

- What changed.
- Which gates passed.
- Any warnings or known residual risks.
- Whether the audit canvas was updated.
