const modulename = 'AddonProcess';
import { fork, ChildProcess, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import consoleFactory from '@lib/console';
import { txEnv } from '@core/globalData';
import { AddonStorageScope } from './addonStorage';
import { isPathInside } from './addonUtils';
import { ServerPlayer } from '@lib/player/playerClasses';
import type { AddonState, AddonRouteDescriptor, CoreToAddonMessage, AddonToCoreMessage } from '@shared/addonTypes';
const console = consoleFactory(modulename);

const IPC_TIMEOUT_MS = 30_000;
const STORAGE_TIMEOUT_MS = 5_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;

type NonNodeExecResolution = {
    childExecPath?: string;
    childExecArgvPrefix: string[];
    candidateCount: number;
    candidateSample: string[];
    cfxRoot?: string;
};

type AddonRuntimePreference = 'auto' | 'inprocess' | 'worker' | 'node';

//============================================
// In-Process Channel
//============================================
//
// On Linux/cfx-server, no separate Node binary is available and worker_threads
// cannot be safely terminated from the host (terminate() and even worker-side
// process.exit() can dispose a V8 isolate that the host is entered into,
// crashing FXServer with `FATAL ERROR: v8::Isolate::Dispose() Disposing the
// isolate that is entered by a thread`).
//
// To get fully live start/stop/restart on Linux we instead load the addon
// module directly into the core's realm via dynamic import(), and replace
// process.send/process.on('message') with a per-addon channel object handed to
// the SDK. Stopping just closes the channel — no thread tear-down, no isolate
// disposal, no host crash.
//
// Trade-off: addon authors cannot rely on full process isolation in this mode.
// Background timers/intervals registered before stop() will keep ticking until
// the addon module is GC-eligible (which only happens after all references to
// its exports are dropped). This is a deliberate, documented trade-off.

interface AddonInProcessChannel {
    sendToCore(msg: AddonToCoreMessage): void;
    onCoreMessage(fn: (msg: CoreToAddonMessage) => void): void;
    deliverFromCore(msg: CoreToAddonMessage): void;
    close(): void;
    isClosed(): boolean;
}

function createInProcessChannel(opts: {
    addonId: string;
    onMessageFromAddon: (msg: AddonToCoreMessage) => void;
}): AddonInProcessChannel {
    let closed = false;
    const addonHandlers: Array<(msg: CoreToAddonMessage) => void> = [];

    return {
        sendToCore(msg) {
            if (closed) return;
            try {
                opts.onMessageFromAddon(msg);
            } catch (err) {
                console.error(`[addon:${opts.addonId}] in-process onMessage threw: ${(err as Error).message}`);
            }
        },
        onCoreMessage(fn) {
            if (closed) return;
            addonHandlers.push(fn);
        },
        deliverFromCore(msg) {
            if (closed) return;
            // Snapshot to avoid mutation-during-iteration.
            const handlers = addonHandlers.slice();
            for (const h of handlers) {
                try {
                    void h(msg);
                } catch (err) {
                    console.error(`[addon:${opts.addonId}] addon message handler threw: ${(err as Error).message}`);
                }
            }
        },
        close() {
            closed = true;
            addonHandlers.length = 0;
        },
        isClosed() {
            return closed;
        },
    };
}

// Serialize concurrent in-process loads so they don't collide on the
// single-shot globalThis.__TX_PENDING_ADDON__ slot.
let inProcessLoadChain: Promise<void> = Promise.resolve();

let hasComputedNonNodeExecResolution = false;
let cachedNonNodeExecResolution: NonNodeExecResolution = {
    childExecPath: undefined,
    childExecArgvPrefix: [],
    candidateCount: 0,
    candidateSample: [],
};
let warnedNonNodeExecFallback = false;

const ADDON_WORKER_BOOTSTRAP = `
const { parentPort, workerData } = require('node:worker_threads');
const { pathToFileURL } = require('node:url');
const process = require('node:process');

if (!parentPort) {
    throw new Error('Addon worker started without parentPort');
}

const relay = (msg) => {
    try {
        parentPort.postMessage(msg);
    } catch {
        // Parent gone.
    }
};

Object.defineProperty(process, 'send', {
    value: relay,
    configurable: true,
    enumerable: false,
    writable: false,
});

Object.defineProperty(process, 'connected', {
    get: () => true,
    configurable: true,
});

parentPort.on('message', (msg) => {
    process.emit('message', msg);
});

(async () => {
    try {
        await import(pathToFileURL(workerData.entryPath).href);
    } catch (error) {
        relay({
            type: 'error',
            payload: {
                message: error && error.message ? String(error.message) : String(error),
                stack: error && error.stack ? String(error.stack) : undefined,
            },
        });
        throw error;
    }
})();
`;

interface PendingRequest {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    timer: NodeJS.Timeout;
}

/**
 * Manages a single addon's child process lifecycle and IPC communication.
 */
export interface AddonLogEntry {
    timestamp: number;
    level: 'info' | 'warn' | 'error';
    message: string;
}

const MAX_LOG_ENTRIES = 200;

export default class AddonProcess {
    public readonly addonId: string;
    public state: AddonState = 'discovered';
    public routes: AddonRouteDescriptor[] = [];
    public readonly logs: AddonLogEntry[] = [];
    public startedAt: number | null = null;
    public startupDurationMs: number | null = null;
    public crashCount = 0;

    private child: ChildProcess | null = null;
    private worker: Worker | null = null;
    private inProcessChannel: AddonInProcessChannel | null = null;
    private usingWorkerFallback = false;
    private usingInProcess = false;
    private readonly entryPath: string;
    private readonly addonDir: string;
    private readonly permissions: string[];
    private readonly storage: AddonStorageScope;
    private readonly pendingRequests = new Map<string, PendingRequest>();
    private readonly onWsPush: (addonId: string, event: string, data: unknown) => void;
    private readonly onCrash: ((addonId: string) => void) | undefined;
    private readonly logPrefix: string;

    private readonly nodeModulesDir: string;

    constructor(opts: {
        addonId: string;
        entryPath: string;
        addonDir: string;
        nodeModulesDir: string;
        permissions: string[];
        storage: AddonStorageScope;
        onWsPush: (addonId: string, event: string, data: unknown) => void;
        onCrash?: (addonId: string) => void;
    }) {
        this.addonId = opts.addonId;
        this.entryPath = opts.entryPath;
        this.addonDir = opts.addonDir;
        this.nodeModulesDir = opts.nodeModulesDir;
        this.permissions = opts.permissions;
        this.storage = opts.storage;
        this.onWsPush = opts.onWsPush;
        this.onCrash = opts.onCrash;
        this.logPrefix = `[addon:${opts.addonId}]`;
    }

    /**
     * Spawn the addon child process and wait for it to send "ready".
     */
    async start(timeoutMs: number): Promise<{ success: boolean; error?: string }> {
        this.state = 'starting';
        this.usingWorkerFallback = false;
        this.usingInProcess = false;
        const startTime = performance.now();

        // Resolve entry path relative to addon dir
        const resolvedEntry = path.resolve(this.addonDir, this.entryPath);

        // Verify entry path is strictly within addon directory (prevent path traversal
        // via ../, sibling-prefix paths like <addonDir>2/..., and symlink escapes).
        if (!isPathInside(this.addonDir, resolvedEntry)) {
            this.state = 'failed';
            return { success: false, error: 'Entry path escapes addon directory' };
        }

        // Determine runtime preference. On Linux we default to in-process because
        // cfx-server hosts cannot safely spawn worker_threads or fork a Node
        // child (no Node binary, V8 isolate disposal crashes). On other
        // platforms we keep the historical fork-based child-process runtime.
        const runtimePrefRaw = String(process.env.FXPANEL_ADDON_RUNTIME ?? '').trim().toLowerCase();
        const runtimePreference: AddonRuntimePreference =
            runtimePrefRaw === 'inprocess' || runtimePrefRaw === 'worker' || runtimePrefRaw === 'node' || runtimePrefRaw === 'auto'
                ? (runtimePrefRaw as AddonRuntimePreference)
                : (process.platform === 'linux' ? 'inprocess' : 'auto');

        if (runtimePreference === 'inprocess') {
            return await this.startInProcess(resolvedEntry, timeoutMs, startTime);
        }

        try {
            // The addon-sdk lives at <txaPath>/node_modules/addon-sdk/
            // ESM resolution walks up the directory tree to find node_modules,
            // so addons at <txaPath>/addons/<id>/ naturally resolve it.
            //
            // Do NOT inherit the parent's execArgv (which may contain debug/inspect
            // flags that would expose the host Node process to the addon), and
            // explicitly neutralise a few foot-guns.
            //
            // Some FXServer runtimes expose a non-Node executable as process.execPath
            // (eg FXServer.exe on Windows, musl loader on Linux). Using it for fork()
            // causes child boot failures (EPIPE / loader usage output). Resolve a
            // usable Node executable path before spawning addon child processes.
            const execBase = path.basename(process.execPath).toLowerCase();
            const isNodeExec = execBase === 'node' || execBase === 'node.exe' || execBase.startsWith('node');
            const isMuslLoaderExec = execBase.startsWith('ld-musl');
            // Reaching here means runtimePreference !== 'inprocess'. Map remaining
            // preferences to the legacy worker/fork selection.
            const preferWorkerFallback = runtimePreference === 'worker';
            const forceNodeRuntime = runtimePreference === 'node';
            let childExecPath: string | undefined;
            let childExecArgvPrefix: string[] = [];

            if (!isNodeExec && !preferWorkerFallback) {
                if (!hasComputedNonNodeExecResolution) {
                    hasComputedNonNodeExecResolution = true;

                    const candidateSet = new Set<string>();
                    const execDir = path.dirname(process.execPath);
                    const cfxRootSet = new Set<string>();
                    const addCfxRoot = (root: string | undefined) => {
                        if (!root) return;
                        cfxRootSet.add(path.resolve(root));
                    };

                    // Common candidates: exact exec dir (eg /opt/cfx-server) plus nearby parents.
                    addCfxRoot(execDir);
                    addCfxRoot(path.resolve(execDir, '..'));
                    addCfxRoot(path.resolve(execDir, '..', '..'));

                    // Recover the canonical /.../cfx-server root directly from execPath.
                    const resolvedExecPathAbs = path.resolve(process.execPath);
                    const lowerExecPath = resolvedExecPathAbs.toLowerCase();
                    const markerWithSep = `${path.sep}cfx-server${path.sep}`;
                    const markerTail = `${path.sep}cfx-server`;
                    const markerIdx = lowerExecPath.lastIndexOf(markerWithSep);
                    if (markerIdx !== -1) {
                        addCfxRoot(resolvedExecPathAbs.slice(0, markerIdx + markerWithSep.length - 1));
                    } else if (lowerExecPath.endsWith(markerTail)) {
                        addCfxRoot(resolvedExecPathAbs);
                    }

                    const cfxRoots = [...cfxRootSet];
                    const cfxLibPaths = Array.from(
                        new Set(
                            cfxRoots.map(
                                (root) =>
                                    `${path.join(root, 'usr', 'lib', 'v8')}:${path.join(root, 'lib')}:${path.join(root, 'usr', 'lib')}`,
                            ),
                        ),
                    );
                    const nodeNameRegex = /^node(?:\d+)?(?:\.exe)?$/i;

                    const collectNodeBins = (root: string, maxDepth: number): string[] => {
                        if (!fs.existsSync(root)) return [];
                        const out: string[] = [];
                        const queue: Array<[string, number]> = [[root, 0]];

                        while (queue.length) {
                            const [dir, depth] = queue.shift()!;
                            let entries: fs.Dirent[];
                            try {
                                entries = fs.readdirSync(dir, { withFileTypes: true });
                            } catch {
                                continue;
                            }

                            for (const entry of entries) {
                                const fullPath = path.join(dir, entry.name);
                                if (entry.isDirectory()) {
                                    if (depth < maxDepth) queue.push([fullPath, depth + 1]);
                                    continue;
                                }

                                if (!(entry.isFile() || entry.isSymbolicLink())) continue;
                                if (nodeNameRegex.test(entry.name)) {
                                    out.push(fullPath);
                                }
                            }
                        }

                        return out;
                    };

                    const collectExecutableBins = (root: string, maxDepth: number, maxFiles: number): string[] => {
                        if (!fs.existsSync(root)) return [];
                        const out: string[] = [];
                        const queue: Array<[string, number]> = [[root, 0]];

                        while (queue.length && out.length < maxFiles) {
                            const [dir, depth] = queue.shift()!;
                            let entries: fs.Dirent[];
                            try {
                                entries = fs.readdirSync(dir, { withFileTypes: true });
                            } catch {
                                continue;
                            }

                            for (const entry of entries) {
                                if (out.length >= maxFiles) break;
                                const fullPath = path.join(dir, entry.name);

                                if (entry.isDirectory()) {
                                    if (depth < maxDepth) queue.push([fullPath, depth + 1]);
                                    continue;
                                }

                                if (!(entry.isFile() || entry.isSymbolicLink())) continue;

                                try {
                                    const st = fs.statSync(fullPath);
                                    if ((st.mode & 0o111) !== 0) {
                                        out.push(fullPath);
                                    }
                                } catch {
                                    // Ignore unreadable/broken entries.
                                }
                            }
                        }

                        return out;
                    };

                    const envNodeExecPath = process.env.npm_node_execpath ?? process.env.NODE;
                    const explicitNodeExecPath = process.env.FXPANEL_ADDON_NODE_PATH;
                    if (typeof explicitNodeExecPath === 'string' && explicitNodeExecPath.length) {
                        candidateSet.add(explicitNodeExecPath);
                    }
                    if (typeof envNodeExecPath === 'string' && envNodeExecPath.length) {
                        candidateSet.add(envNodeExecPath);
                    }

                    if (process.argv0 && path.isAbsolute(process.argv0)) {
                        candidateSet.add(process.argv0);
                    }

                    const siblingNode = path.join(path.dirname(process.execPath), process.platform === 'win32' ? 'node.exe' : 'node');
                    if (fs.existsSync(siblingNode)) {
                        candidateSet.add(siblingNode);
                    }

                    // Common CFX Linux layout when execPath is /alpine/opt/cfx-server/ld-musl-*.so.1
                    const cfxNodeCandidates = cfxRoots.flatMap((root) => [
                        path.join(root, 'usr', 'bin', 'node'),
                        path.join(root, 'usr', 'lib', 'v8', 'node'),
                        path.join(root, 'usr', 'lib', 'v8', 'bin', 'node'),
                        path.join(root, 'citizen', 'scripting', 'v8', 'node', 'bin', 'node'),
                        path.join(root, 'citizen', 'scripting', 'v8', 'node20', 'bin', 'node'),
                        path.join(root, 'citizen', 'scripting', 'v8', 'node16', 'bin', 'node'),
                        path.join(root, 'opt', 'cfx-server', 'citizen', 'scripting', 'v8', 'node', 'bin', 'node'),
                        path.join(root, 'opt', 'cfx-server', 'citizen', 'scripting', 'v8', 'node20', 'bin', 'node'),
                        path.join(root, 'opt', 'cfx-server', 'citizen', 'scripting', 'v8', 'node16', 'bin', 'node'),
                    ]);
                    for (const candidate of cfxNodeCandidates) {
                        if (fs.existsSync(candidate)) {
                            candidateSet.add(candidate);
                        }
                    }

                    // Additional safety net for artifact layouts that rename node dirs.
                    const cfxNodeSearchRoots = cfxRoots.flatMap((root) => [
                        path.join(root, 'usr', 'lib', 'v8'),
                        path.join(root, 'citizen', 'scripting', 'v8'),
                        path.join(root, 'opt', 'cfx-server', 'citizen', 'scripting', 'v8'),
                        root,
                    ]);
                    for (const root of cfxNodeSearchRoots) {
                        for (const candidate of collectNodeBins(root, 7)) {
                            candidateSet.add(candidate);
                        }
                    }

                    // Last-resort executable scan for artifact layouts that don't use
                    // obvious node binary names.
                    const cfxExecSearchRoots = cfxRoots.flatMap((root) => [
                        path.join(root, 'usr', 'bin'),
                        path.join(root, 'usr', 'lib', 'v8'),
                        path.join(root, 'citizen', 'scripting'),
                        path.join(root, 'opt', 'cfx-server', 'citizen', 'scripting'),
                    ]);
                    for (const root of cfxExecSearchRoots) {
                        for (const candidate of collectExecutableBins(root, 6, 300)) {
                            candidateSet.add(candidate);
                        }
                    }

                    const lookupCmd = process.platform === 'win32' ? 'where' : 'which';
                    const nodeInPath = spawnSync(lookupCmd, ['node'], { stdio: 'ignore' });
                    if (!nodeInPath.error && nodeInPath.status === 0) {
                        candidateSet.add('node');
                    }

                    const candidates = [...candidateSet];
                    const looksLikeNodeVersion = (text: string) => /^v\d+\.\d+\.\d+$/m.test(text.trim());

                    const canExecuteDirect = (candidate: string) => {
                        const check = spawnSync(candidate, ['--version'], {
                            stdio: 'pipe',
                            encoding: 'utf8',
                            timeout: 1500,
                            killSignal: 'SIGKILL',
                        });
                        if (check.error || check.status !== 0) return false;
                        const outText = `${check.stdout ?? ''}\n${check.stderr ?? ''}`;
                        return looksLikeNodeVersion(outText);
                    };

                    const canExecuteViaMuslLoader = (candidate: string): string[] | null => {
                        if (!isMuslLoaderExec) return null;
                        for (const cfxLibPath of cfxLibPaths) {
                            const check = spawnSync(
                                process.execPath,
                                ['--library-path', cfxLibPath, '--', candidate, '--version'],
                                {
                                    stdio: 'pipe',
                                    encoding: 'utf8',
                                    timeout: 1500,
                                    killSignal: 'SIGKILL',
                                },
                            );
                            if (check.error || check.status !== 0) continue;
                            const outText = `${check.stdout ?? ''}\n${check.stderr ?? ''}`;
                            if (looksLikeNodeVersion(outText)) {
                                return ['--library-path', cfxLibPath, '--', candidate];
                            }
                        }
                        return null;
                    };

                    let resolvedExecPath: string | undefined;
                    let resolvedExecPrefix: string[] = [];
                    for (const candidate of candidates) {
                        if (canExecuteDirect(candidate)) {
                            resolvedExecPath = candidate;
                            break;
                        }

                        const muslExecPrefix = canExecuteViaMuslLoader(candidate);
                        if (muslExecPrefix) {
                            resolvedExecPath = process.execPath;
                            resolvedExecPrefix = muslExecPrefix;
                            break;
                        }
                    }

                    cachedNonNodeExecResolution = {
                        childExecPath: resolvedExecPath,
                        childExecArgvPrefix: resolvedExecPrefix,
                        candidateCount: candidates.length,
                        candidateSample: candidates.slice(0, 10),
                        cfxRoot: cfxRoots.slice(0, 4).join(' | '),
                    };
                }

                childExecPath = cachedNonNodeExecResolution.childExecPath;
                childExecArgvPrefix = [...cachedNonNodeExecResolution.childExecArgvPrefix];

                if (childExecPath && childExecPath !== process.execPath) {
                    console.verbose.warn(
                        `${this.logPrefix} Host execPath is not a Node binary (${process.execPath}); using '${childExecPath}' for addon process`,
                    );
                } else if (childExecPath && childExecArgvPrefix.length) {
                    console.verbose.warn(
                        `${this.logPrefix} Host execPath is musl loader; using embedded Node '${childExecArgvPrefix[3]}' via loader`,
                    );
                } else {
                    // No explicit Node binary found. The caller will use worker-thread fallback mode.
                    if (!warnedNonNodeExecFallback) {
                        warnedNonNodeExecFallback = true;
                        console.warn(
                            `${this.logPrefix} Could not locate explicit Node binary, using worker-thread fallback. ` +
                            `candidates=${cachedNonNodeExecResolution.candidateCount}, sample=[${cachedNonNodeExecResolution.candidateSample.join(', ')}], cfxRoot=${cachedNonNodeExecResolution.cfxRoot}`,
                        );
                    }
                }
            }

            if (preferWorkerFallback && !warnedNonNodeExecFallback) {
                warnedNonNodeExecFallback = true;
                console.warn(
                    `${this.logPrefix} Using worker-thread addon runtime by default on Linux. ` +
                    `Set FXPANEL_ADDON_RUNTIME=node (and optionally FXPANEL_ADDON_NODE_PATH) to force child-process runtime.`,
                );
            }

            if (!isNodeExec && forceNodeRuntime && !childExecPath) {
                this.state = 'failed';
                return {
                    success: false,
                    error: 'FXPANEL_ADDON_RUNTIME=node is set, but no executable Node runtime was found. Set FXPANEL_ADDON_NODE_PATH or use FXPANEL_ADDON_RUNTIME=worker.',
                };
            }

            const useWorkerFallback = preferWorkerFallback || (!isNodeExec && !childExecPath);

            // Prefer node_modules derived from the addon's concrete path structure
            // (<monitor>/addons/<id> -> <monitor>/node_modules). This avoids runtime
            // drift when txaPath-derived values are wrong in some Linux setups.
            const derivedNodeModulesDir = path.resolve(this.addonDir, '..', '..', 'node_modules');
            const derivedSdkPath = path.join(derivedNodeModulesDir, 'addon-sdk');
            const fallbackSdkPath = path.join(this.nodeModulesDir, 'addon-sdk');
            const resolvedNodeModulesDir = fs.existsSync(derivedSdkPath)
                ? derivedNodeModulesDir
                : this.nodeModulesDir;

            if (!fs.existsSync(path.join(resolvedNodeModulesDir, 'addon-sdk'))) {
                this.state = 'failed';
                return {
                    success: false,
                    error: `addon-sdk not found (checked ${derivedSdkPath} and ${fallbackSdkPath})`,
                };
            }
            // Whitelist of additional process.env keys to forward to addon child processes.
            // These are safe locale/timezone/terminal vars that addons may legitimately need.
            const envWhitelist = ['LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'TERM'] as const;
            const whitelistedEnv = Object.fromEntries(
                envWhitelist.flatMap((key) => (process.env[key] !== undefined ? [[key, process.env[key]]] : [])),
            );
            const addonChildEnv = {
                ...whitelistedEnv,
                PATH: process.env.PATH,
                HOME: process.env.HOME,
                NODE_ENV: process.env.NODE_ENV,
                ADDON_ID: this.addonId,
                ADDON_RUNTIME: useWorkerFallback ? 'worker' : 'node',
                NODE_PATH: resolvedNodeModulesDir,
            };

            if (useWorkerFallback) {
                this.usingWorkerFallback = true;
                console.warn(
                    `${this.logPrefix} Nuclear fallback enabled: running addon in worker-thread mode (no external Node binary available).`,
                );

                this.worker = new Worker(ADDON_WORKER_BOOTSTRAP, {
                    eval: true,
                    workerData: {
                        entryPath: resolvedEntry,
                    },
                    env: addonChildEnv,
                });

                this.worker.on('message', (msg: AddonToCoreMessage) => {
                    this.handleMessage(msg);
                });

                this.worker.on('exit', (code) => {
                    if (this.state === 'running') {
                        console.error(`${this.logPrefix} Worker crashed (exitCode=${code})`);
                        this.state = 'crashed';
                        this.crashCount++;
                        this.onCrash?.(this.addonId);
                    } else if (this.state !== 'stopped' && this.state !== 'stopping') {
                        this.state = 'failed';
                    }
                    this.worker = null;
                    this.rejectAllPending(new Error('Addon worker exited'));
                });

                this.worker.on('error', (err) => {
                    if (this.state === 'stopping') return;
                    console.error(`${this.logPrefix} Worker error: ${err.message}`);
                    if (this.state === 'starting') {
                        this.state = 'failed';
                    }
                });
            } else {
                this.usingWorkerFallback = false;
                this.child = fork(resolvedEntry, [], {
                    cwd: this.addonDir,
                    ...(childExecPath && { execPath: childExecPath }),
                    env: addonChildEnv,
                    execArgv: [
                        ...childExecArgvPrefix,
                        // Throw on __proto__ writes to reduce prototype-pollution blast radius.
                        '--disable-proto=throw',
                        // Keep symlinked addon paths intact for package resolution so imports
                        // resolve against monitor/addons/... instead of host-realpath parents.
                        '--preserve-symlinks',
                        '--preserve-symlinks-main',
                    ],
                    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
                    serialization: 'json',
                });

                // Capture stdout/stderr
                this.child.stdout?.on('data', (data: Buffer) => {
                    console.log(`${this.logPrefix} ${data.toString().trimEnd()}`);
                });
                this.child.stderr?.on('data', (data: Buffer) => {
                    console.error(`${this.logPrefix} ${data.toString().trimEnd()}`);
                });

                // Handle IPC messages
                this.child.on('message', (msg: AddonToCoreMessage) => {
                    this.handleMessage(msg);
                });

                // Handle unexpected exits
                this.child.on('exit', (code, signal) => {
                    if (this.state === 'running') {
                        console.error(`${this.logPrefix} Process crashed (code=${code}, signal=${signal})`);
                        this.state = 'crashed';
                        this.crashCount++;
                        this.onCrash?.(this.addonId);
                    } else if (this.state !== 'stopped' && this.state !== 'stopping') {
                        this.state = 'failed';
                    }
                    this.child = null;
                    this.rejectAllPending(new Error('Addon process exited'));
                });

                this.child.on('error', (err) => {
                    console.error(`${this.logPrefix} Process error: ${err.message}`);
                    if (this.state === 'starting') {
                        this.state = 'failed';
                    }
                });
            }

            this.send({
                type: 'init',
                payload: {
                    addonId: this.addonId,
                    permissions: this.permissions,
                },
            });

            const readyResult = await this.waitForReady(timeoutMs);
            if (!readyResult.success) {
                await this.kill();
                this.state = 'failed';
                return readyResult;
            }

            this.state = 'running';
            this.startedAt = Date.now();
            this.startupDurationMs = performance.now() - startTime;
            return { success: true };
        } catch (error) {
            this.state = 'failed';
            return { success: false, error: `Failed to spawn: ${(error as Error).message}` };
        }
    }

    /**
     * Returns true when this addon is running in the worker-thread fallback runtime.
     */
    isWorkerFallbackMode(): boolean {
        return this.usingWorkerFallback;
    }

    /**
     * Returns true when this addon is running in-process (same realm as core).
     */
    isInProcessMode(): boolean {
        return this.usingInProcess;
    }

    /**
     * Start the addon in-process: dynamic-import the entry into the core's
     * realm and wire up a message channel that replaces process.send/on.
     *
     * This is the only safe runtime on cfx-server's embedded Node host:
     * worker_threads cannot be terminated without crashing the V8 isolate, and
     * no separate Node binary is available to fork.
     */
    private async startInProcess(
        resolvedEntry: string,
        timeoutMs: number,
        startTime: number,
    ): Promise<{ success: boolean; error?: string }> {
        this.usingInProcess = true;

        // Channel that bridges SDK <-> this process instance.
        const channel = createInProcessChannel({
            addonId: this.addonId,
            onMessageFromAddon: (msg) => this.handleMessage(msg),
        });
        this.inProcessChannel = channel;

        // CRITICAL: addons typically call addon.ready() synchronously during
        // module evaluation (often before they receive 'init'). Register the
        // ready waiter NOW, before any import/dispatch can fire.
        const readyPromise = this.waitForReady(timeoutMs);

        // Cache-bust dynamic import so reload picks up edits. ESM module cache
        // is keyed by URL; query string forces a fresh evaluation.
        const entryUrl = pathToFileURL(resolvedEntry).href + `?txReload=${Date.now()}-${randomUUID()}`;

        // Serialize concurrent loads — globalThis.__TX_PENDING_ADDON__ is a
        // single-shot slot consumed synchronously by createAddon().
        const slot = '__TX_PENDING_ADDON__';
        const myTurn = inProcessLoadChain.then(async () => {
            (globalThis as Record<string, unknown>)[slot] = {
                addonId: this.addonId,
                channel,
            };
            try {
                await import(entryUrl);
            } finally {
                const current = (globalThis as Record<string, unknown>)[slot] as
                    | { addonId?: string }
                    | undefined;
                if (current && current.addonId === this.addonId) {
                    delete (globalThis as Record<string, unknown>)[slot];
                }
            }
        });
        // Update chain before awaiting so subsequent starts queue behind us.
        inProcessLoadChain = myTurn.catch(() => undefined);

        try {
            await myTurn;
        } catch (error) {
            channel.close();
            this.inProcessChannel = null;
            this.state = 'failed';
            return { success: false, error: `Failed to load addon module: ${(error as Error).message}` };
        }

        // Deliver init now that the addon's handler is registered. If the
        // addon already called ready() during evaluation, the ready message
        // has already resolved readyPromise and this init is informational.
        if (!channel.isClosed()) {
            channel.deliverFromCore({
                type: 'init',
                payload: {
                    addonId: this.addonId,
                    permissions: this.permissions,
                },
            });
        }

        // Wait for ready signal (waiter was registered before import).
        const readyResult = await readyPromise;
        if (!readyResult.success) {
            channel.close();
            this.inProcessChannel = null;
            this.state = 'failed';
            return readyResult;
        }

        this.state = 'running';
        this.startedAt = Date.now();
        this.startupDurationMs = performance.now() - startTime;
        return { success: true };
    }

    /**
     * Wait for the addon to send a "ready" message.
     */
    private waitForReady(timeoutMs: number): Promise<{ success: boolean; error?: string }> {
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                resolve({ success: false, error: `Addon did not send ready signal within ${timeoutMs}ms` });
            }, timeoutMs);

            // Store as a special pending request
            this.pendingRequests.set('__ready__', {
                resolve: (value) => {
                    clearTimeout(timer);
                    const msg = value as AddonToCoreMessage;
                    if (msg.type === 'ready') {
                        this.routes = (msg.payload as { routes: AddonRouteDescriptor[] }).routes || [];
                        resolve({ success: true });
                    }
                },
                reject: (err) => {
                    clearTimeout(timer);
                    resolve({ success: false, error: err.message });
                },
                timer,
            });
        });
    }

    /**
     * Send an HTTP request to the addon and wait for the response.
     */
    async handleHttpRequest(opts: {
        method: string;
        path: string;
        headers: Record<string, string>;
        body: unknown;
        admin: { name: string; permissions: string[]; isMaster?: boolean };
    }): Promise<{ status: number; headers?: Record<string, string>; body: unknown }> {
        if (this.state !== 'running') {
            return { status: 503, body: { error: 'Addon is not running' } };
        }

        const id = randomUUID();

        const response = await this.sendRequest<{ status: number; headers?: Record<string, string>; body: unknown }>(
            {
                type: 'http-request',
                id,
                payload: opts,
            },
            id,
            IPC_TIMEOUT_MS,
        );

        return response;
    }

    /**
     * Send a public (unauthenticated) HTTP request to the addon and wait for the response.
     */
    async handlePublicRequest(opts: {
        method: string;
        path: string;
        headers: Record<string, string>;
        body: unknown;
    }): Promise<{ status: number; headers?: Record<string, string>; body: unknown }> {
        if (this.state !== 'running') {
            return { status: 503, body: { error: 'Addon is not running' } };
        }

        const id = randomUUID();

        const response = await this.sendRequest<{ status: number; headers?: Record<string, string>; body: unknown }>(
            {
                type: 'public-request',
                id,
                payload: opts,
            },
            id,
            IPC_TIMEOUT_MS,
        );

        return response;
    }

    /**
     * Send an event to the addon (fire-and-forget).
     */
    sendEvent(event: string, data: unknown): void {
        if (this.state !== 'running') return;
        this.send({
            type: 'event',
            payload: { event, data },
        });
    }

    /**
     * Graceful shutdown.
     */
    async stop(): Promise<void> {
        if (this.state === 'stopped' || this.state === 'stopping') return;
        this.state = 'stopping';

        // In-process: deliver shutdown msg, close the channel, drop reference.
        // No threads to join, no isolate to dispose. Background timers inside
        // the addon module keep ticking until GC, but they have no way to
        // affect us because the channel is closed.
        if (this.inProcessChannel) {
            const ch = this.inProcessChannel;
            try {
                ch.deliverFromCore({ type: 'shutdown', payload: {} });
            } catch {
                // Ignore — channel may already be closed.
            }
            ch.close();
            this.inProcessChannel = null;
            this.state = 'stopped';
            this.rejectAllPending(new Error('Addon stopped'));
            return;
        }

        // If child is already dead, just clean up state
        if (!this.child && !this.worker) {
            this.state = 'stopped';
            this.rejectAllPending(new Error('Addon process already exited'));
            return;
        }

        // Worker fallback graceful shutdown path: ask addon-sdk to exit the worker
        // thread cleanly via process.exit(0) (thread-local in worker_threads).
        //
        // We DO NOT call worker.terminate() — in embedded Node runtimes such as
        // cfx-server's, terminate() can dispose a V8 isolate that is still entered
        // by a thread, crashing the entire host process. If the worker fails to
        // self-exit within the timeout, we orphan it (the worker keeps running
        // until it naturally finishes) rather than risk killing the host.
        if (this.worker && !this.child) {
            const activeWorker = this.worker;
            try {
                this.send({ type: 'shutdown', payload: {} });
            } catch {
                // Ignore IPC errors if worker already exited.
            }

            await new Promise<void>((resolve) => {
                let settled = false;
                const settle = () => {
                    if (settled) return;
                    settled = true;
                    resolve();
                };

                const timer = setTimeout(() => {
                    console.warn(
                        `${this.logPrefix} Worker did not exit within ${SHUTDOWN_TIMEOUT_MS}ms; ` +
                        `orphaning to avoid V8 isolate crash from terminate(). ` +
                        `It will exit on its own when its event loop drains.`,
                    );
                    try { activeWorker.unref(); } catch { /* ignore */ }
                    settle();
                }, SHUTDOWN_TIMEOUT_MS);

                activeWorker.once('exit', () => {
                    clearTimeout(timer);
                    settle();
                });

                activeWorker.once('error', (err) => {
                    // Any error during shutdown means the worker is going down.
                    if (this.state === 'stopping') {
                        clearTimeout(timer);
                        settle();
                    }
                    void err;
                });
            });

            this.worker = null;
            this.state = 'stopped';
            this.rejectAllPending(new Error('Addon worker stopped'));
            return;
        }

        // Send shutdown signal
        try {
            this.send({ type: 'shutdown', payload: {} });
        } catch {
            // IPC channel may already be closed if the process crashed
        }

        // Wait for graceful exit
        await new Promise<void>((resolve) => {
            const timer = setTimeout(async () => {
                console.warn(`${this.logPrefix} Shutdown timed out, killing process`);
                await this.kill();
                resolve();
            }, SHUTDOWN_TIMEOUT_MS);

            if (this.child) {
                this.child.once('exit', () => {
                    clearTimeout(timer);
                    resolve();
                });
            } else if (this.worker) {
                this.worker.once('exit', () => {
                    clearTimeout(timer);
                    resolve();
                });
            } else {
                clearTimeout(timer);
                resolve();
            }
        });

        this.state = 'stopped';
        this.child = null;
        this.worker = null;
    }

    /**
     * Force kill the child process.
     */
    private async kill(): Promise<void> {
        if (this.child) {
            this.child.kill('SIGKILL');
            this.child = null;
        }
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
        }
    }

    /**
     * Handle incoming IPC messages from the addon.
     */
    private handleMessage(msg: AddonToCoreMessage): void {
        switch (msg.type) {
            case 'ready': {
                const pending = this.pendingRequests.get('__ready__');
                if (pending) {
                    this.pendingRequests.delete('__ready__');
                    pending.resolve(msg);
                }
                break;
            }
            case 'http-response': {
                const pending = this.pendingRequests.get(msg.id);
                if (pending) {
                    this.pendingRequests.delete(msg.id);
                    clearTimeout(pending.timer);
                    // Sanitize response - strip dangerous headers (case-insensitive)
                    const headers: Record<string, string> = {};
                    for (const [key, value] of Object.entries(msg.payload.headers || {})) {
                        if (key.toLowerCase() !== 'set-cookie') {
                            headers[key] = value as string;
                        }
                    }
                    pending.resolve({
                        status: msg.payload.status,
                        headers,
                        body: msg.payload.body,
                    });
                }
                break;
            }
            case 'storage-request': {
                this.handleStorageRequest(
                    msg.id,
                    msg.payload as {
                        op: 'get' | 'set' | 'delete' | 'list';
                        key?: string;
                        value?: unknown;
                    },
                );
                break;
            }
            case 'ws-push': {
                const payload = msg.payload as { event: string; data: unknown };
                if (this.permissions.includes('ws.push')) {
                    this.onWsPush(this.addonId, payload.event, payload.data);
                } else {
                    console.warn(`${this.logPrefix} Attempted ws.push without permission`);
                }
                break;
            }
            case 'log': {
                const { level, message } = msg.payload as { level: 'info' | 'warn' | 'error'; message: string };
                const truncatedMsg = message.length > 2000 ? message.slice(0, 2000) + '...' : message;
                console[level](`${this.logPrefix} ${truncatedMsg}`);
                this.logs.push({ timestamp: Date.now(), level, message: truncatedMsg });
                if (this.logs.length > MAX_LOG_ENTRIES) this.logs.shift();
                break;
            }
            case 'api-call': {
                this.handleApiCall(msg.id, msg.payload as { method: string; args: unknown[] });
                break;
            }
            case 'error': {
                const { message, stack } = msg.payload as { message: string; stack?: string };
                console.error(`${this.logPrefix} Error: ${message}`);
                if (stack) console.error(`${this.logPrefix} ${stack}`);
                break;
            }
            default: {
                console.warn(`${this.logPrefix} Unknown message type: ${(msg as any).type}`);
            }
        }
    }

    /**
     * Handle addon API calls (e.g. players.addTag, players.removeTag).
     */
    private handleApiCall(id: string, payload: { method: string; args: unknown[] }): void {
        const respond = (data: unknown, error?: string) => {
            this.send({ type: 'api-call-response', id, payload: { data, error } });
        };

        try {
            const { method, args } = payload;

            if (method === 'players.addTag' || method === 'players.removeTag') {
                if (!this.permissions.includes('players.write')) {
                    respond(null, 'players.write permission not granted');
                    return;
                }

                const [netid, tagId] = args;
                if (typeof netid !== 'number' || typeof tagId !== 'string') {
                    respond(null, 'invalid arguments: netid must be number, tagId must be string');
                    return;
                }

                const validIds = new Set((txConfig.gameFeatures.customTags ?? []).map((t: any) => t.id));
                if (!validIds.has(tagId)) {
                    respond(null, `unknown custom tag id: ${tagId}`);
                    return;
                }

                const player = txCore.fxPlayerlist.getPlayerById(netid);
                if (!(player instanceof ServerPlayer) || !player.isRegistered) {
                    respond(null, `player netid ${netid} not found or not registered`);
                    return;
                }

                const isAddTagAction = method === 'players.addTag';
                player.setCustomTag(tagId, isAddTagAction);
                console.info(
                    `${isAddTagAction ? 'Added' : 'Removed'} tag '${tagId}' via addon API (addonId: ${this.addonId}, player: ${player.netid})`,
                );
                respond(true);
            } else {
                respond(null, `unknown API method: ${method}`);
            }
        } catch (error) {
            const errorMessage =
                (error instanceof Error ? error.message || error.name : String(error)) || 'Unknown error';
            respond(null, errorMessage);
        }
    }

    /**
     * Handle addon storage requests.
     */
    private handleStorageRequest(id: string, payload: { op: string; key?: string; value?: unknown }): void {
        if (!this.permissions.includes('storage')) {
            this.send({
                type: 'storage-response',
                id,
                payload: { data: null, error: 'Storage permission not granted' },
            });
            return;
        }

        try {
            let result: unknown;
            switch (payload.op) {
                case 'get':
                    if (!payload.key) {
                        this.send({
                            type: 'storage-response',
                            id,
                            payload: { data: null, error: 'Missing key for get operation' },
                        });
                        return;
                    }
                    result = this.storage.get(payload.key);
                    break;
                case 'set': {
                    if (!payload.key) {
                        this.send({
                            type: 'storage-response',
                            id,
                            payload: { data: null, error: 'Missing key for set operation' },
                        });
                        return;
                    }
                    const setResult = this.storage.set(payload.key, payload.value);
                    if (!setResult.success) {
                        this.send({ type: 'storage-response', id, payload: { data: null, error: setResult.error } });
                        return;
                    }
                    result = true;
                    break;
                }
                case 'delete':
                    if (!payload.key) {
                        this.send({
                            type: 'storage-response',
                            id,
                            payload: { data: null, error: 'Missing key for delete operation' },
                        });
                        return;
                    }
                    this.storage.delete(payload.key);
                    result = true;
                    break;
                case 'list':
                    result = this.storage.list(payload.key);
                    break;
                default:
                    this.send({
                        type: 'storage-response',
                        id,
                        payload: { data: null, error: `Unknown storage op: ${payload.op}` },
                    });
                    return;
            }
            this.send({ type: 'storage-response', id, payload: { data: result } });
        } catch (error) {
            this.send({
                type: 'storage-response',
                id,
                payload: { data: null, error: (error as Error).message },
            });
        }
    }

    /**
     * Send an IPC message and wait for a response with the given correlation ID.
     */
    private sendRequest<T>(message: CoreToAddonMessage, id: string, timeoutMs: number): Promise<T> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error(`IPC request timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            this.pendingRequests.set(id, {
                resolve: resolve as (value: unknown) => void,
                reject,
                timer,
            });

            this.send(message);
        });
    }

    /**
     * Send a raw IPC message to the child process / worker / in-process channel.
     */
    private send(message: CoreToAddonMessage): void {
        try {
            if (this.inProcessChannel) {
                this.inProcessChannel.deliverFromCore(message);
                return;
            }
            if (this.child && this.child.connected) {
                this.child.send(message);
                return;
            }
            if (this.worker) {
                this.worker.postMessage(message);
            }
        } catch (error) {
            console.error(`${this.logPrefix} Failed to send IPC message: ${(error as Error).message}`);
        }
    }

    /**
     * Reject all pending requests (e.g. on process exit).
     */
    private rejectAllPending(error: Error): void {
        for (const [id, pending] of this.pendingRequests) {
            clearTimeout(pending.timer);
            pending.reject(error);
        }
        this.pendingRequests.clear();
    }
}
