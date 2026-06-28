import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { txDevEnv, txEnv } from '@core/globalData';
import consoleFactory from '@lib/console';
import {
    formatFxChildNodeResolutionDiagnostics,
    getFxChildNodeRuntimeResolution,
    resolveFxChildNodeSpawn,
} from '@lib/resolveFxChildNode';
import { emsg } from '@shared/emsg';

const console = consoleFactory('DiscordBot:process');
const INITIAL_RESTART_DELAY_MS = 5_000;
const MAX_RESTART_DELAY_MS = 60_000;

/**
 * Controls how the Discord bot runtime is hosted.
 * - `node`: spawn a child Node process (legacy behaviour); fail if no Node binary is found.
 * - `worker`: always run the bot inside a worker thread of the host process.
 * - `auto` (default): use a child Node process when a Node binary is resolvable,
 *   otherwise transparently fall back to a worker thread so the bot still starts
 *   on hosts that ship no standalone Node (e.g. FXServer.exe on Windows).
 */
type BotRuntimePreference = 'node' | 'worker' | 'auto';

function resolveBotRuntimePreference(): BotRuntimePreference {
    const raw = String(process.env.SXPANEL_BOT_RUNTIME ?? '')
        .trim()
        .toLowerCase();
    if (raw === 'node' || raw === 'worker' || raw === 'auto') {
        return raw;
    }
    return 'auto';
}

export type BotProcessStartConfig = {
    token: string;
    secret: string;
    bridgePort: number;
    guild?: string | null;
};

type BotProcessFailure = {
    reason: string;
};

type BotProcessOptions = {
    onError?: (failure: BotProcessFailure) => void;
    onExit?: (failure: BotProcessFailure) => void;
};

export default class BotProcess {
    readonly #sourceBotDir = txDevEnv.SRC_PATH ? path.join(txDevEnv.SRC_PATH, 'bot') : undefined;
    readonly #preferredBotDir = path.join(txEnv.txaPath, 'bot');
    readonly #fallbackBotDir = path.resolve(txEnv.txaPath, '..', 'bot');
    readonly #options: BotProcessOptions;
    #proc: ChildProcessWithoutNullStreams | undefined;
    #worker: Worker | undefined;
    #restartDelayMs = INITIAL_RESTART_DELAY_MS;
    #restartTimer: NodeJS.Timeout | undefined;
    #pendingRestartDelayMs: number | undefined;
    #shuttingDown = false;
    #lastStartConfig: BotProcessStartConfig | undefined;
    #lastOutputLine: string | undefined;
    #lastErrorLine: string | undefined;
    /** When true, spawn failed in a way that will not recover by retrying (e.g. no Node binary). */
    #fatalSpawnError = false;

    constructor(options: BotProcessOptions = {}) {
        this.#options = options;
    }

    get isRunning() {
        return (!!this.#proc && !this.#proc.killed) || !!this.#worker;
    }

    get hasPendingRestart() {
        return !!this.#restartTimer;
    }

    get nextRestartDelayMs() {
        return this.#pendingRestartDelayMs ?? null;
    }

    get lastOutputLine() {
        return this.#lastOutputLine;
    }

    get lastErrorLine() {
        return this.#lastErrorLine;
    }

    start(config: BotProcessStartConfig) {
        this.#lastStartConfig = config;
        this.#shuttingDown = false;
        this.#fatalSpawnError = false;

        if (this.isRunning || this.#restartTimer) return;
        this.#spawn();
    }

    restart(config?: BotProcessStartConfig) {
        if (config) {
            this.#lastStartConfig = config;
        }

        this.stop();
        if (this.#lastStartConfig) {
            this.#shuttingDown = false;
            this.#fatalSpawnError = false;
            this.#spawn();
        }
    }

    stop() {
        this.#shuttingDown = true;
        this.#fatalSpawnError = false;
        if (this.#restartTimer) {
            clearTimeout(this.#restartTimer);
            this.#restartTimer = undefined;
        }
        this.#pendingRestartDelayMs = undefined;

        if (this.#worker) {
            const worker = this.#worker;
            this.#worker = undefined;
            worker.removeAllListeners();
            // terminate() returns a promise; we intentionally do not await it during
            // synchronous stop. The worker has no listeners left, so a late exit is a no-op.
            void worker.terminate();
        }

        if (!this.#proc) return;
        this.#proc.removeAllListeners();
        this.#proc.kill();
        this.#proc = undefined;
    }

    markHealthy() {
        this.#restartDelayMs = INITIAL_RESTART_DELAY_MS;
    }

    #resolveBotDir() {
        if (txDevEnv.ENABLED && this.#sourceBotDir && existsSync(this.#sourceBotDir)) {
            return this.#sourceBotDir;
        }

        if (existsSync(this.#preferredBotDir)) {
            return this.#preferredBotDir;
        }

        if (existsSync(this.#fallbackBotDir)) {
            return this.#fallbackBotDir;
        }

        throw new Error(`Discord bot folder not found at ${this.#preferredBotDir} or ${this.#fallbackBotDir}.`);
    }

    #buildNodePath(botDir: string) {
        const candidateDirs = new Set<string>();
        const pushIfExists = (dirPath: string | undefined) => {
            if (!dirPath || !existsSync(dirPath)) return;
            candidateDirs.add(dirPath);
        };

        pushIfExists(path.join(path.dirname(botDir), 'node_modules'));
        pushIfExists(path.join(txEnv.txaPath, 'node_modules'));
        if (txDevEnv.ENABLED && txDevEnv.SRC_PATH) {
            pushIfExists(path.join(txDevEnv.SRC_PATH, 'node_modules'));
        }

        if (process.env.NODE_PATH) {
            for (const entry of process.env.NODE_PATH.split(path.delimiter)) {
                pushIfExists(entry);
            }
        }

        return [...candidateDirs].join(path.delimiter);
    }

    #ensureRuntimeNodeModules(botDir: string) {
        const sourceNodeModulesDir = txDevEnv.SRC_PATH ? path.join(txDevEnv.SRC_PATH, 'node_modules') : undefined;
        const runtimeNodeModulesDir = path.join(txEnv.txaPath, 'node_modules');
        const botNodeModulesDir = path.join(botDir, 'node_modules');

        try {
            if (sourceNodeModulesDir && existsSync(sourceNodeModulesDir) && existsSync(runtimeNodeModulesDir)) {
                const stats = lstatSync(runtimeNodeModulesDir);
                if (stats.isSymbolicLink()) {
                    const resolved = realpathSync(runtimeNodeModulesDir);
                    if (path.resolve(resolved) === path.resolve(sourceNodeModulesDir)) {
                        rmSync(runtimeNodeModulesDir, { recursive: true, force: true });
                    }
                }
            }

            mkdirSync(runtimeNodeModulesDir, { recursive: true });

            const links = [
                {
                    label: 'discord.js',
                    sourcePaths: [
                        path.join(botNodeModulesDir, 'discord.js'),
                        sourceNodeModulesDir ? path.join(sourceNodeModulesDir, 'discord.js') : undefined,
                    ],
                    targetPath: path.join(runtimeNodeModulesDir, 'discord.js'),
                },
                {
                    label: 'ws',
                    sourcePaths: [
                        path.join(botNodeModulesDir, 'ws'),
                        sourceNodeModulesDir ? path.join(sourceNodeModulesDir, 'ws') : undefined,
                    ],
                    targetPath: path.join(runtimeNodeModulesDir, 'ws'),
                },
                {
                    label: 'addon-sdk',
                    sourcePaths: [txDevEnv.SRC_PATH ? path.join(txDevEnv.SRC_PATH, 'addon-sdk') : undefined],
                    targetPath: path.join(runtimeNodeModulesDir, 'addon-sdk'),
                },
            ] as const;

            for (const link of links) {
                const sourcePath = link.sourcePaths.find((candidate): candidate is string => {
                    return typeof candidate === 'string' && existsSync(candidate);
                });
                if (!sourcePath) continue;
                if (path.resolve(sourcePath) === path.resolve(link.targetPath)) continue;

                const targetParentDir = path.dirname(link.targetPath);
                mkdirSync(targetParentDir, { recursive: true });

                try {
                    const targetStats = lstatSync(link.targetPath);
                    if (!targetStats.isSymbolicLink()) {
                        // Preserve real directories/files already created by the builder.
                        continue;
                    }

                    const resolved = realpathSync(link.targetPath);
                    if (path.resolve(resolved) === path.resolve(sourcePath)) {
                        continue;
                    }

                    rmSync(link.targetPath, { recursive: true, force: true });
                } catch {
                    // Missing target is fine; create it below.
                }

                // Addon ESM modules resolve from <monitor>/addons/... and must be able
                // to walk up to <monitor>/node_modules for shared bot dependencies.
                symlinkSync(sourcePath, link.targetPath, process.platform === 'win32' ? 'junction' : 'dir');
                console.warn(`Linked ${link.targetPath} to ${sourcePath} for Discord bot runtime dependencies.`);
            }
        } catch (error) {
            console.warn(`Failed to prepare Discord bot node_modules link: ${emsg(error)}`);
        }
    }

    #buildChildEnv(config: BotProcessStartConfig, nodePath: string): NodeJS.ProcessEnv {
        return {
            ...process.env,
            BOT_TOKEN: config.token,
            BOT_SECRET: config.secret,
            BOT_BRIDGE_PORT: String(config.bridgePort),
            BOT_GUILD_ID: config.guild ?? '',
            ...(nodePath ? { NODE_PATH: nodePath } : {}),
        };
    }

    #spawn() {
        const config = this.#lastStartConfig;
        if (!config) throw new Error('Cannot start the Discord bot process without a config.');
        if (this.#fatalSpawnError) return;

        const botDir = this.#resolveBotDir();
        this.#ensureRuntimeNodeModules(botDir);
        const nodePath = this.#buildNodePath(botDir);

        this.#lastOutputLine = undefined;
        this.#lastErrorLine = undefined;

        const preference = resolveBotRuntimePreference();
        const spawnCmd = preference === 'worker' ? null : resolveFxChildNodeSpawn(['index.js']);

        if (spawnCmd) {
            this.#spawnChild(config, botDir, nodePath, spawnCmd);
            return;
        }

        // No Node binary resolvable (or worker explicitly requested).
        //
        // The worker-thread fallback is NOT safe to auto-enable on Linux: on
        // cfx-server's embedded musl Node, terminating a worker (which stop()/
        // restart() do routinely) crashes the V8 isolate and takes FXServer down.
        // Linux cfx-server artifacts always ship a resolvable embedded Node, so
        // the child-process path above is used there in practice. Only honour the
        // worker runtime on Linux when the operator explicitly opted in.
        const allowWorkerFallback = preference === 'worker' || (preference === 'auto' && process.platform !== 'linux');
        if (!allowWorkerFallback) {
            const resolution = getFxChildNodeRuntimeResolution();
            const diagnostics = formatFxChildNodeResolutionDiagnostics(resolution);
            const hint =
                preference === 'node'
                    ? ' Unset SXPANEL_BOT_RUNTIME=node to allow the worker-thread fallback.'
                    : process.platform === 'linux'
                      ? ' Set SXPANEL_BOT_RUNTIME=worker to force the worker-thread runtime (note: unsafe on cfx-server musl hosts).'
                      : '';
            const reason =
                'Discord bot: no Node.js binary found for this FXServer environment. ' +
                'Set SXPANEL_BOT_NODE_PATH or SXPANEL_ADDON_NODE_PATH to an absolute path to `node`, or install Node on PATH.' +
                hint;
            console.error(reason);
            console.error(`Discord bot Node resolution: ${diagnostics}`);
            this.#fatalSpawnError = true;
            this.#options.onError?.({ reason: `${reason} ${diagnostics}` });
            return;
        }

        this.#spawnWorker(config, botDir, nodePath);
    }

    #spawnChild(
        config: BotProcessStartConfig,
        botDir: string,
        nodePath: string,
        spawnCmd: { file: string; args: string[] },
    ) {
        this.#proc = spawn(spawnCmd.file, spawnCmd.args, {
            cwd: botDir,
            env: this.#buildChildEnv(config, nodePath),
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });

        this.#pipeOutput(this.#proc.stdout, 'log');
        this.#pipeOutput(this.#proc.stderr, 'error');
        this.#proc.on('error', (error) => {
            const reason = `Discord bot process failed: ${emsg(error)}`;
            console.error(reason);
            this.#proc = undefined;
            const errno = error as NodeJS.ErrnoException;
            if (errno.code === 'ENOENT') {
                this.#fatalSpawnError = true;
                console.error(
                    'Discord bot spawn ENOENT — the resolved Node binary could not be executed. Check SXPANEL_BOT_NODE_PATH / SXPANEL_ADDON_NODE_PATH.',
                );
            }
            this.#options.onError?.({
                reason: this.#lastErrorLine ? `${reason} Last error: ${this.#lastErrorLine}` : reason,
            });
            if (!this.#fatalSpawnError) {
                this.#scheduleRestart();
            }
        });
        this.#proc.on('exit', (code, signal) => {
            this.#proc = undefined;
            if (this.#shuttingDown || this.#fatalSpawnError) return;

            const exitReason = signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`;
            console.warn(`Discord bot process exited with ${exitReason}.`);
            const reason = this.#lastErrorLine
                ? `Discord bot process exited with ${exitReason}. Last error: ${this.#lastErrorLine}`
                : `Discord bot process exited with ${exitReason}.`;
            this.#options.onExit?.({ reason });
            this.#scheduleRestart();
        });

        console.ok(`Started Discord bot process in ${botDir}.`);
    }

    #spawnWorker(config: BotProcessStartConfig, botDir: string, nodePath: string) {
        const entryPath = path.join(botDir, 'index.js');
        console.warn(
            'Discord bot: no standalone Node binary found; running the bot in a worker thread of the host process. ' +
                'Set SXPANEL_BOT_NODE_PATH (or install Node on PATH) to use a dedicated child process instead.',
        );

        let worker: Worker;
        try {
            worker = new Worker(entryPath, {
                env: this.#buildChildEnv(config, nodePath),
                // Avoid inheriting host inspector/debug flags into the bot worker.
                execArgv: [],
                stdout: true,
                stderr: true,
            });
        } catch (error) {
            const reason = `Discord bot worker failed to start: ${emsg(error)}`;
            console.error(reason);
            this.#options.onError?.({ reason });
            this.#scheduleRestart();
            return;
        }

        this.#worker = worker;
        this.#pipeOutput(worker.stdout, 'log');
        this.#pipeOutput(worker.stderr, 'error');

        worker.on('error', (error) => {
            if (this.#worker !== worker) return;
            const reason = `Discord bot worker failed: ${emsg(error)}`;
            console.error(reason);
            this.#worker = undefined;
            this.#options.onError?.({
                reason: this.#lastErrorLine ? `${reason} Last error: ${this.#lastErrorLine}` : reason,
            });
            this.#scheduleRestart();
        });
        worker.on('exit', (code) => {
            if (this.#worker !== worker) return;
            this.#worker = undefined;
            if (this.#shuttingDown || this.#fatalSpawnError) return;

            const exitReason = `code ${code ?? 'unknown'}`;
            console.warn(`Discord bot worker exited with ${exitReason}.`);
            const reason = this.#lastErrorLine
                ? `Discord bot worker exited with ${exitReason}. Last error: ${this.#lastErrorLine}`
                : `Discord bot worker exited with ${exitReason}.`;
            this.#options.onExit?.({ reason });
            this.#scheduleRestart();
        });

        console.ok(`Started Discord bot worker thread in ${botDir}.`);
    }

    #scheduleRestart() {
        if (this.#shuttingDown || this.#fatalSpawnError || this.#restartTimer || !this.#lastStartConfig) return;

        const restartDelayMs = this.#restartDelayMs;
        this.#pendingRestartDelayMs = restartDelayMs;
        console.warn(`Restarting Discord bot process in ${Math.floor(restartDelayMs / 1000)}s.`);
        this.#restartTimer = setTimeout(() => {
            this.#restartTimer = undefined;
            this.#pendingRestartDelayMs = undefined;
            if (!this.#shuttingDown) {
                this.#spawn();
            }
        }, restartDelayMs);
        this.#restartDelayMs = Math.min(this.#restartDelayMs * 2, MAX_RESTART_DELAY_MS);
    }

    #pipeOutput(stream: NodeJS.ReadableStream, level: 'log' | 'error') {
        stream.setEncoding('utf8');
        let buffer = '';

        stream.on('data', (chunk: string) => {
            buffer += chunk;

            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.length) continue;
                if (level === 'error') {
                    this.#lastErrorLine = trimmed;
                } else {
                    this.#lastOutputLine = trimmed;
                }
                console[level](`[Bot] ${trimmed}`);
            }
        });
        stream.on('end', () => {
            const trimmed = buffer.trim();
            if (!trimmed.length) return;
            if (level === 'error') {
                this.#lastErrorLine = trimmed;
            } else {
                this.#lastOutputLine = trimmed;
            }
            console[level](`[Bot] ${trimmed}`);
            buffer = '';
        });
    }
}
