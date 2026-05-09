import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, suite, vi } from 'vitest';
import {
    clearCopyDestination,
    copyBotRuntimeDependencies,
    copyDirectoryIfDifferent,
    shouldCopyStaticEntry,
    shouldSyncStaticContents,
} from './utils';

const tempDirs: string[] = [];
const originalCwd = process.cwd();

const makeTempDir = () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fxpanel-copy-'));
    tempDirs.push(tempDir);
    return tempDir;
};

afterEach(() => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    for (const tempDir of tempDirs.splice(0)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

suite('clearCopyDestination', () => {
    it('removes directory contents without deleting the directory root', () => {
        const tempDir = makeTempDir();
        const srcDir = path.join(tempDir, 'src', 'addons');
        const destDir = path.join(tempDir, 'dest', 'addons');

        fs.mkdirSync(srcDir, { recursive: true });
        fs.mkdirSync(path.join(destDir, 'nested', '.git', 'objects'), { recursive: true });
        fs.writeFileSync(path.join(srcDir, 'addon.lua'), 'print(\'new\')');
        fs.writeFileSync(path.join(destDir, 'stale.txt'), 'old');
        fs.writeFileSync(path.join(destDir, 'nested', 'stale.lua'), 'old');
        fs.writeFileSync(path.join(destDir, 'nested', '.git', 'objects', 'keep-me-out'), 'old');

        const rmSpy = vi.spyOn(fs, 'rmSync');

        clearCopyDestination(srcDir, destDir);

        expect(fs.existsSync(destDir)).toBe(true);
        expect(fs.readdirSync(destDir)).toEqual([]);
        expect(rmSpy).not.toHaveBeenCalledWith(destDir, expect.anything());
    });
});

suite('shouldCopyStaticEntry', () => {
    it('filters nested git directories from static copies', () => {
        const tempDir = makeTempDir();
        const srcDir = path.join(tempDir, 'src', 'resource');
        const destDir = path.join(tempDir, 'dest', 'resource');

        fs.mkdirSync(path.join(srcDir, 'scripts', '.git', 'objects'), { recursive: true });
        fs.writeFileSync(path.join(srcDir, 'scripts', '.git', 'config'), '[core]');
        fs.writeFileSync(path.join(srcDir, 'scripts', 'runtime.lua'), 'print(\'ok\')');

        fs.cpSync(srcDir, destDir, { recursive: true, filter: shouldCopyStaticEntry });

        expect(fs.existsSync(path.join(destDir, 'scripts', 'runtime.lua'))).toBe(true);
        expect(fs.existsSync(path.join(destDir, 'scripts', '.git'))).toBe(false);
    });
});

suite('shouldSyncStaticContents', () => {
    it('skips addon contents for dev sync events', () => {
        expect(shouldSyncStaticContents('addons/', 'change')).toBe(false);
        expect(shouldSyncStaticContents('addons/', 'init')).toBe(false);
    });

    it('still syncs addon contents for publish events', () => {
        expect(shouldSyncStaticContents('addons/', 'publish')).toBe(true);
    });
});

suite('copyDirectoryIfDifferent', () => {
    it('skips copying when source and destination resolve to the same directory', () => {
        const tempDir = makeTempDir();
        const sourceDir = path.join(tempDir, 'addon-sdk');

        fs.mkdirSync(sourceDir, { recursive: true });
        fs.writeFileSync(path.join(sourceDir, 'index.js'), 'export const ok = true;');

        const cpSpy = vi.spyOn(fs, 'cpSync');
        const result = copyDirectoryIfDifferent(sourceDir, sourceDir);

        expect(result).toBe(false);
        expect(cpSpy).not.toHaveBeenCalled();
    });
});

suite('copyBotRuntimeDependencies', () => {
    it('copies discord bot runtime packages and their transitive dependencies into the monitor node_modules folder', () => {
        const tempDir = makeTempDir();
        const monitorDir = path.join(tempDir, 'monitor');

        fs.mkdirSync(path.join(tempDir, 'bot'), { recursive: true });
        fs.mkdirSync(path.join(tempDir, 'node_modules', 'discord.js'), { recursive: true });
        fs.mkdirSync(path.join(tempDir, 'node_modules', 'ws'), { recursive: true });
        fs.mkdirSync(path.join(tempDir, 'node_modules', '@discordjs', 'util'), { recursive: true });
        fs.mkdirSync(path.join(tempDir, 'addon-sdk'), { recursive: true });

        fs.writeFileSync(
            path.join(tempDir, 'bot', 'package.json'),
            JSON.stringify({
                dependencies: {
                    'discord.js': '^14.26.3',
                    ws: '^8.18.3',
                },
            }),
        );
        fs.writeFileSync(
            path.join(tempDir, 'node_modules', 'discord.js', 'package.json'),
            JSON.stringify({
                name: 'discord.js',
                main: 'index.js',
                dependencies: {
                    '@discordjs/util': '^1.2.0',
                },
            }),
        );
        fs.writeFileSync(path.join(tempDir, 'node_modules', 'discord.js', 'index.js'), 'module.exports = {};');
        fs.writeFileSync(
            path.join(tempDir, 'node_modules', 'ws', 'package.json'),
            JSON.stringify({
                name: 'ws',
                main: 'index.js',
            }),
        );
        fs.writeFileSync(path.join(tempDir, 'node_modules', 'ws', 'index.js'), 'module.exports = {};');
        fs.writeFileSync(
            path.join(tempDir, 'node_modules', '@discordjs', 'util', 'package.json'),
            JSON.stringify({
                name: '@discordjs/util',
                main: 'index.js',
            }),
        );
        fs.writeFileSync(path.join(tempDir, 'node_modules', '@discordjs', 'util', 'index.js'), 'module.exports = {};');
        fs.writeFileSync(path.join(tempDir, 'addon-sdk', 'index.js'), 'export const addon = true;');

        process.chdir(tempDir);
        copyBotRuntimeDependencies(monitorDir);

        expect(fs.existsSync(path.join(monitorDir, 'node_modules', 'discord.js', 'index.js'))).toBe(true);
        expect(fs.existsSync(path.join(monitorDir, 'node_modules', 'ws', 'index.js'))).toBe(true);
        expect(fs.existsSync(path.join(monitorDir, 'node_modules', '@discordjs', 'util', 'index.js'))).toBe(true);
        expect(fs.existsSync(path.join(monitorDir, 'node_modules', 'addon-sdk', 'index.js'))).toBe(true);
    });
});