const modulename = 'Logger:System';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import bytes from 'bytes';
import consoleFactory from '@lib/console';
import { chalkInversePad, getTimeFilename } from '@lib/misc';
import type { SystemLogActionId, SystemLogCategory, SystemLogEntry } from '@shared/systemLogTypes';
const console = consoleFactory(modulename);

type SystemLogWriteOptions = {
    actionId?: SystemLogActionId;
};

//Consts
const BUFFER_SIZE = 16_000;
const SESSION_FILE_REGEX = /^system_session_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.jsonl$/;
const ACTIVE_SESSION_FILENAME = 'system_session.jsonl';
const RETENTION_DAYS = 14;

export default class SystemLogger {
    private readonly basePath: string;
    private readonly activeSessionPath: string;
    private readonly recentBuffer: SystemLogEntry[] = [];
    private sessionStream: fs.WriteStream;
    public writeCounter = 0;
    public lrLastError: string | undefined;

    constructor(basePath: string) {
        this.basePath = basePath;
        this.activeSessionPath = path.join(basePath, ACTIVE_SESSION_FILENAME);
        this._rotateSessionFileOnBoot();
        this.sessionStream = fs.createWriteStream(this.activeSessionPath, { flags: 'a' });
        this._loadRecentEntries();
    }

    /**
     * Loads recent entries from disk into the in-memory buffer on boot
     */
    private _loadRecentEntries() {
        try {
            if (!fs.existsSync(this.activeSessionPath)) return;
            const raw = fs.readFileSync(this.activeSessionPath, 'utf8');
            const lines = raw.trim().split('\n').filter(Boolean);
            const startIdx = Math.max(0, lines.length - BUFFER_SIZE);
            for (let i = startIdx; i < lines.length; i++) {
                try {
                    const entry = JSON.parse(lines[i]) as SystemLogEntry;
                    this.recentBuffer.push(entry);
                } catch {
                    //skip malformed lines
                }
            }
            console.verbose.log(`Loaded ${this.recentBuffer.length} recent system log entries`);
        } catch (error) {
            console.warn(`Failed to load system log: ${emsg(error)}`);
        }
    }

    /**
     * Returns the base log directory path
     */
    getLogDirectory(): string {
        return this.basePath;
    }

    /**
     * Returns a string with short usage stats
     */
    getUsageStats() {
        return `Writes: ${this.writeCounter}, Buffer: ${this.recentBuffer.length}`;
    }

    /**
     * Returns the recent buffer, optionally only the last N elements
     */
    getRecentBuffer(lastN?: number) {
        return lastN ? this.recentBuffer.slice(-lastN) : this.recentBuffer;
    }

    /**
     * Returns the full active session file contents as a string (for diagnostics report)
     */
    async getSessionFileContent() {
        try {
            return await fsp.readFile(this.activeSessionPath, 'utf8');
        } catch (error) {
            return false;
        }
    }

    /**
     * Returns a slice of the recent buffer OLDER than a reference timestamp
     */
    readPartialOlder(timestamp: number, sliceLength: number) {
        const limitIndex = this.recentBuffer.findIndex((x) => x.ts >= timestamp);
        if (limitIndex === -1) {
            return this.recentBuffer.slice(-sliceLength);
        } else {
            return this.recentBuffer.slice(Math.max(0, limitIndex - sliceLength), limitIndex);
        }
    }

    /**
     * Returns a slice of the recent buffer NEWER than a reference timestamp
     */
    readPartialNewer(timestamp: number, sliceLength: number) {
        const limitIndex = this.recentBuffer.findIndex((x) => x.ts > timestamp);
        return this.recentBuffer.slice(limitIndex, limitIndex + sliceLength);
    }

    /**
     * Returns list of available session files with metadata
     */
    async listSessionFiles() {
        const files: { name: string; size: string; ts: string; mtime: number }[] = [];
        try {
            const dirEntries = await fsp.readdir(this.basePath, { withFileTypes: true });
            for (const entry of dirEntries) {
                if (!entry.isFile()) continue;
                if (!SESSION_FILE_REGEX.test(entry.name)) continue;
                const filePath = path.join(this.basePath, entry.name);
                const stat = await fsp.stat(filePath);
                const match = entry.name.match(/system_session_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})\.jsonl/);
                files.push({
                    name: entry.name,
                    size: bytes(stat.size) ?? '0B',
                    ts: match
                        ? match[1].replace(/_/g, ' ').replace(/-/g, (m, offset) => (offset > 10 ? ':' : '-'))
                        : entry.name,
                    mtime: stat.mtime.getTime(),
                });
            }
            files.sort((a, b) => b.mtime - a.mtime);
        } catch (error) {
            console.verbose.warn('Failed to list session files:', emsg(error));
        }
        return files;
    }

    /**
     * Reads events from a session file
     */
    async readSessionFile(fileName: string) {
        if (!SESSION_FILE_REGEX.test(fileName)) {
            throw new Error('Invalid session file name');
        }
        const filePath = path.join(this.basePath, fileName);
        const content = await fsp.readFile(filePath, 'utf-8');
        const events: SystemLogEntry[] = [];
        for (const line of content.split('\n')) {
            if (!line.trim()) continue;
            try {
                events.push(JSON.parse(line));
            } catch {
                //skip malformed lines
            }
        }
        return events;
    }

    /**
     * Logs a system event (with console output)
     */
    write(author: string, action: string, category: SystemLogCategory, options: SystemLogWriteOptions = {}) {
        if (category === 'command') {
            console.log(`${author} executed ` + chalkInversePad(action));
        } else {
            console.log(action);
        }
        this._writeEntry(author, action, category, options);
    }

    /**
     * Logs a system event (silent, no console output)
     */
    writeSystem(author: string, action: string, category: SystemLogCategory, options: SystemLogWriteOptions = {}) {
        this._writeEntry(author, action, category, options);
    }

    /**
     * Writes a structured entry to the JSONL session file and in-memory buffer
     */
    private _writeEntry(
        author: string,
        action: string,
        category: SystemLogCategory,
        options: SystemLogWriteOptions = {},
    ) {
        const entry: SystemLogEntry = {
            ts: Date.now(),
            author,
            category,
            action,
            ...(options.actionId ? { actionId: options.actionId } : {}),
        };

        //Push to in-memory buffer
        this.recentBuffer.push(entry);
        if (this.recentBuffer.length > BUFFER_SIZE) {
            this.recentBuffer.shift();
        }

        //Write to JSONL session file
        this.sessionStream.write(JSON.stringify(entry) + '\n');
        this.writeCounter++;

        //Send to websocket
        txCore.webServer.webSocket.buffer('systemlog', entry);

        if (typeof txCore.discordBot?.handleSystemLogEntry === 'function') {
            txCore.discordBot.handleSystemLogEntry(entry).catch(() => {});
        }
    }

    /**
     * Rotates the active session file on server restart
     */
    rotateSessionFile() {
        try {
            if (this.sessionStream) {
                this.sessionStream.end();
            }
            if (fs.existsSync(this.activeSessionPath)) {
                const stat = fs.statSync(this.activeSessionPath);
                if (stat.size > 0) {
                    const ts = getTimeFilename();
                    const dest = path.join(this.basePath, `system_session_${ts}.jsonl`);
                    fs.renameSync(this.activeSessionPath, dest);
                    console.verbose.log(`Rotated session file to ${path.basename(dest)}`);
                }
            }
            this.sessionStream = fs.createWriteStream(this.activeSessionPath, { flags: 'a' });
            this._cleanupSessionFiles();
        } catch (error) {
            console.verbose.warn('Failed to rotate session file:', emsg(error));
        }
    }

    /**
     * On boot, rotate any leftover active session file (e.g. from a crash)
     */
    private _rotateSessionFileOnBoot() {
        try {
            if (fs.existsSync(this.activeSessionPath)) {
                const stat = fs.statSync(this.activeSessionPath);
                if (stat.size > 0) {
                    const ts = getTimeFilename(stat.mtime);
                    const dest = path.join(this.basePath, `system_session_${ts}.jsonl`);
                    fs.renameSync(this.activeSessionPath, dest);
                    console.verbose.log(`Rotated orphan session file to ${path.basename(dest)}`);
                }
            }
        } catch (error) {
            console.verbose.warn('Failed to rotate orphan session file:', emsg(error));
        }
        this._cleanupSessionFiles();
        this._cleanupPreRefactorFiles();
    }

    /**
     * Remove session files older than retention days
     */
    private _cleanupSessionFiles() {
        try {
            const cutoffMs = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
            const files = fs.readdirSync(this.basePath).filter((f) => SESSION_FILE_REGEX.test(f));
            for (const file of files) {
                const filePath = path.join(this.basePath, file);
                const stat = fs.statSync(filePath);
                if (stat.mtime.getTime() < cutoffMs) {
                    fs.unlinkSync(filePath);
                    console.verbose.log(`Deleted old session file: ${file}`);
                }
            }
        } catch (error) {
            console.verbose.warn('Failed to clean up session files:', emsg(error));
        }
    }

    /**
     * Remove pre-refactor system.jsonl / system.old.jsonl leftover files
     */
    private _cleanupPreRefactorFiles() {
        const legacyFiles = ['system.jsonl', 'system.old.jsonl'];
        for (const fileName of legacyFiles) {
            try {
                const filePath = path.join(this.basePath, fileName);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.verbose.log(`Deleted pre-refactor leftover: ${fileName}`);
                }
            } catch (error) {
                console.verbose.warn(`Failed to delete ${fileName}:`, emsg(error));
            }
        }
    }

    /**
     * Close the active session write stream (called on shutdown)
     */
    public closeStream() {
        if (this.sessionStream) {
            this.sessionStream.end();
        }
    }
}
