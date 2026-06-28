# Contributing to sxPanel

Thanks for your interest in contributing! This guide covers everything you need to get started.

> **Before starting any significant PR**, please join the [Discord](https://discord.gg/6FcqBYwxH5) and discuss your idea first.

## Getting Started

### Prerequisites

- **Operating system**
    - **Windows, macOS, or Linux** — install dependencies, run tests, and run **`npm run build`** on any of these (CI does the same).
    - **FXServer-spawning dev mode** — `cd core && npm run dev` **starting and restarting FXServer** for you when the core bundle rebuilds — is **Windows and Linux only** (see `scripts/build/dev.ts` and `TxAdminRunner`).
    - **macOS** — the same `npm run dev` command runs in **watch-only** mode: it rebuilds and syncs into your **`monitor`** folder but **does not spawn FXServer**. Start FXServer yourself (or use a remote server) and use stdin `r` only to get a reminder to restart manually.
    - **Optional `TXDEV_NO_SPAWN`** — on Windows or Linux, set `TXDEV_NO_SPAWN=1` in `.env` for the same watch-only behavior (e.g. FXServer in Docker or on another machine).
- **Node.js** v22.9 or newer
- **FXServer artifacts path** — a folder that contains the **`monitor`** resource (your server install or artifact tree). Required for `TXDEV_FXSERVER_PATH` even in watch-only mode so the dev builder knows where to copy outputs.

### Setup

1. Clone the repository:

```sh
git clone https://github.com/Snipzil/sxpanel.git
cd sxPanel
```

2. Install dependencies and prepare git hooks:

```sh
npm install
npm run prepare
```

3. Create a `.env` file in the project root (paths are examples — use your install):

```sh
TXDEV_FXSERVER_PATH='E:/FiveM/10309/'
TXDEV_VITE_URL='http://localhost:40122'
```

`TXDEV_FXSERVER_PATH` is **required** for the core dev builder. `TXDEV_VITE_URL` defaults to `http://localhost:40122` if unset (`shared/txDevEnv.ts`); set it explicitly if your panel dev server uses another origin (see `scripts/build/dev.ts`).

### Development Workflows

**Core + Panel + Resource** (two terminals):

```sh
# Terminal 1: Start the panel dev server
cd panel
npm run dev

# Terminal 2: Start the core dev builder (esbuild watch + sync into monitor/)
cd core
npm run dev
```

On **Windows or Linux** (and without `TXDEV_NO_SPAWN`), Terminal 2 **stops and starts FXServer** around each successful core rebuild so the server picks up changes.

On **macOS**, or whenever **`TXDEV_NO_SPAWN`** is set, Terminal 2 **only** rebuilds and copies files — **restart FXServer yourself** after changes (the builder logs watch-only mode on startup).

**NUI Menu**:

```sh
cd nui

# Game dev mode (requires monitor resource restart):
npm run dev

# Browser dev mode:
npm run browser
```

For more detail on env vars and builder behavior, read `scripts/build/dev.ts` and `shared/txDevEnv.ts`. Long-form guides (same sources as the website) live in the **[sxPanel-Docs](https://github.com/Snipzil/sxPanel-Docs/tree/main)** repo — pick the folder for your version (e.g. `v0.3.1-Alpha-01/`). The rendered site is [sxpanel.org/docs](https://sxpanel.org/docs).

## Coding Style

### TypeScript / JavaScript

- **Formatter**: Prettier — 4-space indent, single quotes, 120-char width, trailing commas
- **Linter**: ESLint flat config with `@typescript-eslint/recommended` (see `core/eslint.config.js` and `panel/eslint.config.js`)
- Prefer **arrow functions** except for React components
- Prefer **implicit return types** over explicit annotations
- Prefer **`for...of`** over `.forEach()`
- Prefer **single quotes** over double quotes
- Use `import` / `export` (ESM) — the project uses `"type": "module"`

### Lua

- **Formatter**: StyLua — 4-space indent
- Follow existing patterns in `resource/`

### Formatting

Run Prettier before committing:

```sh
npm run format
```

Or check without modifying:

```sh
npm run format:check
```

## Commit Conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/) enforced by Commitlint.

### Format

```
type(scope): description
```

### Allowed Types

| Type       | Use for                                 |
| ---------- | --------------------------------------- |
| `feat`     | New features                            |
| `fix`      | Bug fixes                               |
| `docs`     | Documentation changes                   |
| `style`    | Formatting, whitespace (no code change) |
| `refactor` | Code restructuring (no feature/fix)     |
| `perf`     | Performance improvements                |
| `test`     | Adding or updating tests                |
| `build`    | Build system or dependency changes      |
| `ci`       | CI/CD configuration                     |
| `chore`    | Maintenance tasks                       |
| `revert`   | Reverting a previous commit             |
| `tweak`    | Small adjustments                       |
| `wip`      | Work in progress                        |
| `locale`   | Translation/locale updates              |

### Examples

```
feat(panel): add player activity heatmap
fix(core): prevent session loss on restart
docs: update development setup guide
locale: update French translations
```

## Testing

Tests use **Vitest**. Each test file should:

- Import `suite`, `it`, `expect` from `vitest`
- Wrap tests in a single `suite()` with `it()` calls

```sh
# Run all tests
npm run test --workspaces

# Run core tests only
cd core && npm run test

# Run a specific test file
cd core && npx vitest run path/to/file.test.ts

# Typecheck
npm run typecheck -w core
```

### What to Test

- All new utility functions and parsers
- Business logic in `core/lib/` and `core/modules/`
- API route handlers (integration tests welcome)
- Bug fixes should include a regression test

## No-commit (`!` + `NC`) tags

The end-of-line comment `!` immediately followed by `NC` marks code that **must not be committed**. The pre-commit hook scans for that two-character sequence and blocks the commit if any are found. Use them for temporary debugging code or TODOs that must be resolved before merging.

```ts
console.log('debug output'); // append ! then NC (no space) to block commits while iterating
```

## Pull Request Process

1. **Branch from `dev`** — all PRs target the `dev` branch, including translations
2. **Keep PRs focused** — one feature or fix per PR
3. **Run checks locally** before pushing:
    ```sh
    npm run test --workspaces
    npm run typecheck -w core
    npm run lint -w core
    npm run format:check
    ```
4. **Write a clear description** explaining what changed and why
5. **Link related issues** if applicable

## Project Structure

| Directory   | Description                                            |
| ----------- | ------------------------------------------------------ |
| `core/`     | Node.js backend — modules, routes, libraries           |
| `panel/`    | Web panel frontend (React + Radix + Tailwind)          |
| `nui/`      | In-game NUI menu (React + MUI, targets CEF/Chrome 103) |
| `shared/`   | Shared types, schemas, and utilities                   |
| `resource/` | FXServer Lua/JS game scripts                           |
| `scripts/`  | Build and dev tooling                                  |
| `locale/`   | 35 translation JSON files                              |
| `docs/`     | Project documentation                                  |

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
