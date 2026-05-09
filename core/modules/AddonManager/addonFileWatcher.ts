const modulename = 'AddonFileWatcher';
import fs from 'node:fs';
import path from 'node:path';
import consoleFactory from '@lib/console';
const console = consoleFactory(modulename);

const DEBOUNCE_MS = 1500;

/**
 * Watches the addons/ directory for file changes and triggers reloads.
 *
 * Uses fs.watch on each addon subdirectory (recursive) with debouncing
 * to avoid rapid-fire reloads during builds or multi-file saves.
 * Also watches the root addons/ dir for new addon folders being added/removed.
 */
export default class AddonFileWatcher {
    private readonly addonsDir: string;
    private readonly onReload: (addonId: string, nuiOnly: boolean) => void;
    private readonly watchers = new Map<string, fs.FSWatcher>();
    private readonly debounceTimers = new Map<string, NodeJS.Timeout>();
    /** Tracks whether all changes during a debounce window are in nui/ or panel/ dirs */
    private readonly staticOnlyFlags = new Map<string, boolean>();
    private rootWatcher: fs.FSWatcher | null = null;
    private closed = false;

    constructor(addonsDir: string, onReload: (addonId: string, nuiOnly: boolean) => void) {
        this.addonsDir = addonsDir;
        this.onReload = onReload;
        this.start();
    }

    private start(): void {
        if (!fs.existsSync(this.addonsDir)) return;

        // fs.watch with { recursive: true } requires Node.js >= 19.1.0 on Linux.
        // Abort hot-reload (rather than crashing later) on older Linux runtimes.
        if (process.platform === 'linux') {
            const parts = process.versions.node.split('.').map((n) => Number(n));
            const major = parts[0] ?? 0;
            const minor = parts[1] ?? 0;
            if (major < 19 || (major === 19 && minor < 1)) {
                console.warn(
                    `Addon file watcher disabled: recursive fs.watch requires Node.js >= 19.1.0 on Linux (current: ${process.version}).`,
                );
                return;
            }
        }

        // Watch root addons/ for new/removed directories
        try {
            this.rootWatcher = fs.watch(this.addonsDir, (eventType, filename) => {
                try {
                    if (this.closed || !filename) return;
                    const fullPath = path.join(this.addonsDir, filename);

                    // Stat the path; treat any error (e.g. ENOENT due to a race) as "not present"
                    let isDirectory = false;
                    let statOk = false;
                    try {
                        const st = fs.statSync(fullPath);
                        statOk = true;
                        isDirectory = st.isDirectory();
                    } catch {
                        statOk = false;
                    }

                    // New directory added — start watching it
                    if (statOk && isDirectory) {
                        if (!this.watchers.has(filename)) {
                            this.watchAddonDir(filename);
                            this.scheduleReload(filename);
                        }
                    } else if (!statOk && this.watchers.has(filename)) {
                        // Directory removed — stop watching
                        this.unwatchAddonDir(filename);
                        this.scheduleReload(filename);
                    }
                } catch (err) {
                    console.warn(`Root addons watcher callback error: ${(err as Error).message}`);
                }
            });
            this.rootWatcher.on('error', (err) => {
                console.warn(`Root addons watcher error: ${err.message}`);
                try {
                    this.rootWatcher?.close();
                    this.rootWatcher = null;
                } catch {
                    /* already closed */
                }
            });
        } catch (err) {
            console.warn(`Failed to watch addons root directory: ${(err as Error).message}`);
        }

        // Watch each existing addon subdirectory
        try {
            const entries = fs.readdirSync(this.addonsDir);
            for (const entry of entries) {
                const fullPath = path.join(this.addonsDir, entry);
                try {
                    if (fs.statSync(fullPath).isDirectory()) {
                        this.watchAddonDir(entry);
                    }
                } catch {
                    /* skip entries removed concurrently or otherwise unstattable */
                }
            }
        } catch (err) {
            console.warn(`Failed to enumerate addon directories: ${(err as Error).message}`);
        }

        console.log('File watcher started for hot-reload');
    }

    private watchAddonDir(addonId: string): void {
        const dirPath = path.join(this.addonsDir, addonId);
        if (this.watchers.has(addonId)) return;

        try {
            // Resolve symlinks to watch the real directory
            let watchTarget: string;
            try {
                watchTarget = fs.realpathSync(dirPath);
            } catch {
                watchTarget = dirPath;
            }

            const watcher = fs.watch(watchTarget, { recursive: true }, (_eventType, filename) => {
                if (this.closed) return;
                // Track whether the change is in a static-only directory (nui/ or panel/)
                const isStatic =
                    typeof filename === 'string' &&
                    (filename.startsWith('nui' + path.sep) ||
                        filename.startsWith('nui/') ||
                        filename.startsWith('panel' + path.sep) ||
                        filename.startsWith('panel/'));
                if (!isStatic) {
                    this.staticOnlyFlags.set(addonId, false);
                } else if (!this.staticOnlyFlags.has(addonId)) {
                    this.staticOnlyFlags.set(addonId, true);
                }
                this.scheduleReload(addonId);
            });

            watcher.on('error', (err) => {
                console.warn(`Watcher error for addon ${addonId}: ${err.message}`);
                // Gracefully close — do not let EPERM bubble to uncaughtException
                try {
                    this.unwatchAddonDir(addonId);
                } catch {
                    /* already closed */
                }
            });

            this.watchers.set(addonId, watcher);
        } catch (err) {
            console.warn(`Failed to watch addon ${addonId}: ${(err as Error).message}`);
        }
    }

    private unwatchAddonDir(addonId: string): void {
        const watcher = this.watchers.get(addonId);
        if (watcher) {
            try {
                watcher.close();
            } catch (err) {
                console.warn(`Failed to close watcher for addon ${addonId}: ${(err as Error).message}`);
            } finally {
                this.watchers.delete(addonId);
            }
        }
    }

    private scheduleReload(addonId: string): void {
        // Clear any existing debounce timer for this addon
        const existing = this.debounceTimers.get(addonId);
        if (existing) clearTimeout(existing);

        const timer = setTimeout(() => {
            this.debounceTimers.delete(addonId);
            const nuiOnly = this.staticOnlyFlags.get(addonId) ?? false;
            this.staticOnlyFlags.delete(addonId);
            if (this.closed) return;
            console.log(
                `File change detected in addon "${addonId}"${nuiOnly ? ' (static only)' : ''}, triggering reload...`,
            );
            this.onReload(addonId, nuiOnly);
        }, DEBOUNCE_MS);

        this.debounceTimers.set(addonId, timer);
    }

    close(): void {
        this.closed = true;

        // Clear all debounce timers
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();
        this.staticOnlyFlags.clear();

        // Close all addon watchers
        for (const [addonId, watcher] of this.watchers.entries()) {
            try {
                watcher.close();
            } catch (err) {
                console.warn(`Failed to close watcher for addon ${addonId}: ${(err as Error).message}`);
            }
        }
        this.watchers.clear();

        // Close root watcher
        if (this.rootWatcher) {
            try {
                this.rootWatcher.close();
            } catch (err) {
                console.warn(`Failed to close root watcher: ${(err as Error).message}`);
            } finally {
                this.rootWatcher = null;
            }
        }

        console.log('File watcher stopped');
    }

    /**
     * Clear any pending debounce state for a specific addon.
     * Called before manual reloads to prevent stale timers from firing
     * after the manual reload completes.
     */
    clearPending(addonId: string): void {
        const timer = this.debounceTimers.get(addonId);
        if (timer) {
            clearTimeout(timer);
            this.debounceTimers.delete(addonId);
        }
        this.staticOnlyFlags.delete(addonId);
    }

    /**
     * Remove the watcher for an addon that has been deleted from disk.
     */
    removeAddon(addonId: string): void {
        this.clearPending(addonId);
        this.unwatchAddonDir(addonId);
    }

    /**
     * Start watching a new addon directory (e.g. after discovering a new addon).
     */
    addAddon(addonId: string): void {
        if (!this.closed) {
            this.watchAddonDir(addonId);
        }
    }
}
