const modulename = 'AddonStorage';
import fs from 'node:fs';
import path from 'node:path';
import consoleFactory from '@lib/console';
const console = consoleFactory(modulename);

const FLUSH_INTERVAL_MS = 5_000;

/**
 * Manages scoped key-value storage for a single addon.
 * Data is backed by a JSON file at addon-data/<addon-id>.json.
 * Writes are debounced (flushed every 5s or on shutdown).
 */
export class AddonStorageScope {
    private data: Record<string, unknown> = {};
    private dirty = false;
    private readonly filePath: string;
    private readonly maxSizeBytes: number;

    constructor(filePath: string, maxSizeMb: number) {
        this.filePath = filePath;
        this.maxSizeBytes = maxSizeMb * 1024 * 1024;
        this.load();
    }

    private load() {
        try {
            if (fs.existsSync(this.filePath)) {
                const raw = fs.readFileSync(this.filePath, 'utf-8');
                this.data = JSON.parse(raw);
            }
        } catch (error) {
            console.warn(`Failed to load addon storage from ${this.filePath}: ${(error as Error).message}`);
            this.data = {};
        }
    }

    get(key: string): unknown {
        return this.data[key] ?? null;
    }

    set(key: string, value: unknown): { success: boolean; error?: string } {
        // Validate key - no path traversal
        if (key.includes('..') || key.includes('/') || key.includes('\\')) {
            return { success: false, error: 'Invalid storage key' };
        }

        // Check size limit before writing
        const testData = { ...this.data, [key]: value };
        const serialized = JSON.stringify(testData);
        if (serialized.length > this.maxSizeBytes) {
            return { success: false, error: `Storage limit exceeded (max ${this.maxSizeBytes / 1024 / 1024} MB)` };
        }

        this.data[key] = value;
        this.dirty = true;
        return { success: true };
    }

    delete(key: string): { success: boolean } {
        if (key in this.data) {
            delete this.data[key];
            this.dirty = true;
        }
        return { success: true };
    }

    list(prefix?: string): string[] {
        const keys = Object.keys(this.data);
        if (prefix) {
            return keys.filter((k) => k.startsWith(prefix));
        }
        return keys;
    }

    flush(): void {
        if (!this.dirty) return;
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
            this.dirty = false;
        } catch (error) {
            console.error(`Failed to flush addon storage to ${this.filePath}: ${(error as Error).message}`);
        }
    }
}

/**
 * Manages all addon storage scopes.
 * Creates per-addon JSON files under addon-data/.
 */
export default class AddonStorage {
    private readonly scopes = new Map<string, AddonStorageScope>();
    private readonly dataDir: string;
    private readonly maxSizeMb: number;
    private flushTimer: NodeJS.Timer | null = null;

    constructor(dataDir: string, maxSizeMb: number) {
        this.dataDir = dataDir;
        this.maxSizeMb = maxSizeMb;

        // Ensure data directory exists
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }

        // Start periodic flush
        this.flushTimer = setInterval(() => this.flushAll(), FLUSH_INTERVAL_MS);
    }

    /**
     * Get or create a storage scope for the given addon.
     */
    getScope(addonId: string): AddonStorageScope {
        let scope = this.scopes.get(addonId);
        if (!scope) {
            const filePath = path.join(this.dataDir, `${addonId}.json`);
            scope = new AddonStorageScope(filePath, this.maxSizeMb);
            this.scopes.set(addonId, scope);
        }
        return scope;
    }

    /**
     * Flush all scopes to disk.
     */
    flushAll(): void {
        for (const scope of this.scopes.values()) {
            scope.flush();
        }
    }

    /**
     * Shutdown — flush and stop timer.
     */
    shutdown(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
        this.flushAll();
    }
}
