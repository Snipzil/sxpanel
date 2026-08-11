const modulename = 'SelfUpdater';
import path from 'node:path';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn, execSync } from 'node:child_process';
import { promisify } from 'node:util';
import stream from 'node:stream';
import semver from 'semver';
import { z } from 'zod';
import StreamZip from 'node-stream-zip';

import { txEnv } from '@core/globalData';
import got from '@lib/got';
import consoleFactory from '@lib/console';
import quitProcess from '@lib/quitProcess';
import type { FxUpdateStatus, PanelReleaseInfo } from '@shared/otherTypes';
const console = consoleFactory(modulename);
const pipeline = promisify(stream.pipeline);

const GITHUB_REPO = 'Snipzil/sxpanel';
//Entries that must exist in the zip for the resource to boot at all (mirrors scripts/package-monitor.js)
const REQUIRED_ENTRIES = ['fxmanifest.lua', 'entrypoint.js', 'core/index.js', 'resource/sv_main.lua'];

const releaseSchema = z.object({
    tag_name: z.string().min(1),
    prerelease: z.boolean(),
    html_url: z.string().url(),
    draft: z.boolean(),
    assets: z.array(
        z.object({
            name: z.string(),
            browser_download_url: z.string().url(),
        }),
    ),
});
const releaseListSchema = z.array(releaseSchema);

/**
 * Module responsible for checking, downloading and applying sxPanel (monitor resource) updates.
 * The flow is: download+verify → extract → stop game server → swap directories → restart process.
 * Unlike FxUpdater (which swaps the FXServer artifact), this swaps the monitor resource directory
 * that the running process itself was loaded from — so the process must fully exit and be
 * relaunched by whatever's starting fxserver.exe (service/wrapper/manual) for the new code to load.
 */
export default class SelfUpdater {
    private _status: FxUpdateStatus = { phase: 'idle' };
    private latestRelease?: PanelReleaseInfo;
    private readonly updateDir: string;
    private readonly archivePath: string;
    private readonly stagingDir: string;
    private readonly failureStatusPath: string;

    constructor() {
        const parentDir = path.dirname(txEnv.txaPath);
        this.updateDir = path.join(parentDir, 'sxpanel_update_temp');
        this.archivePath = path.join(this.updateDir, 'monitor.zip');
        this.stagingDir = path.join(parentDir, 'sxpanel_update_staging');
        this.failureStatusPath = path.join(parentDir, 'sxpanel_update_failure.txt');
        this.loadPersistedFailureStatus();
    }

    get status(): FxUpdateStatus {
        return this._status;
    }

    get availableUpdate(): PanelReleaseInfo | undefined {
        return this.latestRelease;
    }

    /**
     * Loads any persisted updater failure status written by the detached swap script
     * (used mainly on Windows, where the process exits mid-apply).
     */
    private loadPersistedFailureStatus() {
        try {
            const persisted = fs.readFileSync(this.failureStatusPath, 'utf8').trim();
            if (!persisted.length) return;
            this._status = { phase: 'error', message: persisted };
            console.warn(`Loaded persisted self-update failure: ${persisted}`);
        } catch {
            // no persisted failure status
        }
    }

    private async clearPersistedFailureStatus() {
        await fsp.rm(this.failureStatusPath, { force: true }).catch(() => {});
    }

    /**
     * Queries GitHub for the latest sxPanel release and compares it against the running version.
     * NOTE: uses the releases list (not /releases/latest) because sxPanel is currently shipping
     * prerelease ("-Beta") tags, which GitHub's "latest" endpoint deliberately excludes.
     */
    async checkForUpdate(): Promise<PanelReleaseInfo | undefined> {
        try {
            const resp = await got(`https://api.github.com/repos/${GITHUB_REPO}/releases`, {
                headers: { Accept: 'application/vnd.github+json' },
                timeout: { request: 10_000 },
            }).json();
            const releases = releaseListSchema.parse(resp).filter((r) => !r.draft);
            const latest = releases[0];
            if (!latest) return;

            const version = latest.tag_name.replace(/^v/, '');
            if (!semver.valid(version)) {
                console.verbose.warn(`Latest release tag "${latest.tag_name}" is not valid semver, skipping.`);
                return;
            }

            const zipAsset = latest.assets.find((a) => a.name === 'monitor.zip');
            const shaAsset = latest.assets.find((a) => a.name === 'monitor.zip.sha256');
            if (!zipAsset || !shaAsset) {
                console.verbose.warn(`Release ${latest.tag_name} is missing monitor.zip or its checksum, skipping.`);
                return;
            }

            this.latestRelease = {
                version,
                isPrerelease: latest.prerelease,
                isOutdated: semver.lt(txEnv.txaVersion, version),
                releaseUrl: latest.html_url,
                zipUrl: zipAsset.browser_download_url,
                shaUrl: shaAsset.browser_download_url,
            };
            return this.latestRelease;
        } catch (error) {
            console.verbose.warn(`Failed to check for sxPanel updates: ${emsg(error)}`);
            return;
        }
    }

    /**
     * Downloads and verifies the latest monitor.zip, then extracts it to a staging directory.
     */
    async download() {
        if (this._status.phase === 'downloading') {
            throw new Error('A download is already in progress.');
        }
        if (this._status.phase === 'applying') {
            throw new Error('An update is currently being applied.');
        }

        this._status = { phase: 'downloading', percentage: 0 };
        try {
            await this.clearPersistedFailureStatus();

            if (!this.latestRelease) {
                await this.checkForUpdate();
            }
            if (!this.latestRelease) {
                throw new Error('No sxPanel release available to download.');
            }
            const release = this.latestRelease;

            //Clean up any previous temp files
            await fsp.rm(this.updateDir, { recursive: true, force: true });
            await fsp.rm(this.stagingDir, { recursive: true, force: true });
            await fsp.mkdir(this.updateDir, { recursive: true });

            //Fetch the expected checksum first (tiny file)
            const shaText = await got(release.shaUrl, { timeout: { request: 10_000 } }).text();
            const expectedDigestMatch = shaText.trim().match(/^([0-9a-f]{64})/i);
            if (!expectedDigestMatch) {
                throw new Error('Could not parse expected checksum from monitor.zip.sha256.');
            }
            const expectedDigest = expectedDigestMatch[1].toLowerCase();

            //Stream download with progress
            const gotStream = got.stream(release.zipUrl, {
                timeout: {
                    request: 30 * 60 * 1000, // 30 minutes
                    lookup: 10_000,
                    connect: 10_000,
                    response: 30_000,
                },
            });
            gotStream.on('downloadProgress', (progress) => {
                this._status = {
                    phase: 'downloading',
                    percentage: Math.round(progress.percent * 100),
                };
            });
            const writeStream = fs.createWriteStream(this.archivePath);
            gotStream.on('error', (err) => {
                this._status = { phase: 'error', message: emsg(err) };
                writeStream.destroy(err);
            });
            await pipeline(gotStream, writeStream);

            //Verify checksum before touching anything else
            const actualDigest = createHash('sha256').update(fs.readFileSync(this.archivePath)).digest('hex');
            if (actualDigest !== expectedDigest) {
                throw new Error(
                    `Checksum mismatch for monitor.zip (expected ${expectedDigest}, got ${actualDigest}). Download may be corrupted.`,
                );
            }

            //Extract to staging directory
            this._status = { phase: 'extracting' };
            await fsp.mkdir(this.stagingDir, { recursive: true });
            console.warn('Extracting sxPanel update archive...');
            await this.extractZipSafe(this.archivePath, this.stagingDir);

            //Validate the expected resource structure before proceeding
            const missing: string[] = [];
            for (const entry of REQUIRED_ENTRIES) {
                const exists = await fsp
                    .access(path.join(this.stagingDir, entry))
                    .then(() => true)
                    .catch(() => false);
                if (!exists) missing.push(entry);
            }
            if (missing.length) {
                throw new Error(`Extracted update is missing required files: ${missing.join(', ')}`);
            }

            //Cleanup the archive
            await fsp.rm(this.updateDir, { recursive: true, force: true });

            this._status = { phase: 'extracted' };
            console.ok(`sxPanel ${release.version} downloaded and extracted successfully.`);
        } catch (error) {
            const msg = emsg(error) ?? 'Unknown download error';
            console.error(`sxPanel update download failed: ${msg}`);
            this._status = { phase: 'error', message: msg };
            await fsp.writeFile(this.failureStatusPath, msg).catch(() => {});
            await fsp.rm(this.updateDir, { recursive: true, force: true }).catch(() => {});
            await fsp.rm(this.stagingDir, { recursive: true, force: true }).catch(() => {});
            throw error;
        }
    }

    /**
     * Applies the downloaded update:
     * 1. Stop the game server.
     * 2. Spawn a detached script that waits for our PID to die, swaps the monitor resource
     *    directory for the staged one, then restarts FXServer with the original command line.
     * 3. Terminate the host process so the swap script can proceed.
     */
    async apply() {
        if (this._status.phase !== 'extracted') {
            throw new Error('No downloaded update ready to apply.');
        }

        this._status = { phase: 'applying' };
        const parentDir = path.dirname(txEnv.txaPath);

        try {
            await this.clearPersistedFailureStatus();

            //Stop the game server if running (skip notice delay — we're about to kill the whole process anyway)
            if (!txCore.fxRunner.isIdle) {
                console.warn('Stopping game server for sxPanel update...');
                const killError = await txCore.fxRunner.killServer('sxPanel update', 'sxPanel', false, true);
                if (killError) {
                    throw new Error(`Failed to stop game server: ${killError}`);
                }
            }

            if (txEnv.isWindows) {
                this.spawnWindowsSwapScript(parentDir);
            } else {
                this.spawnLinuxSwapScript(parentDir);
            }

            //Terminate the FXServer host process. process.exit() alone only exits the
            //embedded Node.js VM — the native host also needs to be told to quit.
            const pid = process.pid;
            setTimeout(() => {
                if (txEnv.isWindows) {
                    try {
                        ExecuteCommand('quit');
                    } catch {
                        quitProcess(0);
                    }
                } else {
                    try {
                        process.kill(pid, 'SIGTERM');
                    } catch {
                        /* already dead */
                    }
                }
                setTimeout(() => {
                    try {
                        process.kill(pid, 'SIGKILL');
                    } catch {
                        /* already dead */
                    }
                }, 5000);
            }, 1500);
        } catch (error) {
            const msg = emsg(error) ?? 'Unknown apply error';
            console.error(`sxPanel update apply failed: ${msg}`);
            this._status = { phase: 'error', message: msg };
            await fsp.writeFile(this.failureStatusPath, msg).catch(() => {});
            throw error;
        }
    }

    /**
     * Windows swap: batch script waits for our PID to die, deletes the old monitor/ dir,
     * moves staging into place, then restarts FXServer using the captured command line.
     */
    private spawnWindowsSwapScript(parentDir: string) {
        const toWin = (p: string) => p.replace(/\//g, '\\').replace(/\\+$/, '');
        const escapeBatchPath = (p: string) => {
            return toWin(p)
                .replace(/%/g, '%%')
                .replace(/([\^&<>|])/g, '^$1');
        };
        const winTxaPath = escapeBatchPath(txEnv.txaPath);
        const winStagingDir = escapeBatchPath(this.stagingDir);
        const winParentDir = escapeBatchPath(parentDir);
        const scriptPath = path.join(parentDir, 'sxpanel_update_swap.bat');
        const winScriptPath = escapeBatchPath(scriptPath);
        const winFailureStatusPath = escapeBatchPath(this.failureStatusPath);
        const pid = process.pid;

        let restartCmd = '';
        try {
            const psOut = execSync(
                `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine"`,
                { encoding: 'utf8', timeout: 2000 },
            );
            restartCmd = psOut.trim();
        } catch {
            console.warn('Could not capture command line for auto-restart.');
        }
        if (!restartCmd.length) {
            try {
                const quoteArg = (arg: string) => `"${arg.replace(/"/g, '""')}"`;
                restartCmd = process.argv.map(quoteArg).join(' ');
                console.warn('Using process.argv fallback for auto-restart command.');
            } catch {
                // no fallback available
            }
        }
        const winCwd = escapeBatchPath(process.cwd());

        const batLines = [
            '@echo off',
            'title sxPanel Update',
            `set "FAILFILE=${winFailureStatusPath}"`,
            'if exist "%FAILFILE%" del /f /q "%FAILFILE%" >NUL 2>&1',
            `echo Waiting for FXServer (PID ${pid}) to shut down...`,
            'set waitretries=0',
            ':waitpidloop',
            `tasklist /FI "PID eq ${pid}" 2>NUL | find /I "${pid}" >NUL`,
            'if errorlevel 1 goto waitpiddone',
            'set /a waitretries+=1',
            'if %waitretries% GEQ 20 (',
            `    set "FAIL_REASON=Could not stop FXServer process ${pid} in time."`,
            '    goto updatefailed',
            ')',
            `echo Process ${pid} still alive, forcing shutdown... attempt %waitretries%`,
            `taskkill /F /PID ${pid} >NUL 2>&1`,
            'timeout /t 1 /nobreak >nul',
            'goto waitpidloop',
            ':waitpiddone',
            'echo FXServer process stopped.',
            'echo.',
            'echo Removing old sxPanel files...',
            'set retries=0',
            ':deleteloop',
            `rmdir /s /q "${winTxaPath}" 2>NUL`,
            `if exist "${winTxaPath}" (`,
            '    set /a retries+=1',
            '    if %retries% GEQ 15 (',
            '        echo WARNING: Could not fully delete old sxPanel directory. Falling back to in-place copy.',
            '        goto inplacecopy',
            '    )',
            '    echo Waiting for directory to be released... attempt %retries%',
            '    timeout /t 2 /nobreak >nul',
            '    goto deleteloop',
            ')',
            'echo Old sxPanel files removed.',
            'echo Moving new files into place...',
            `move "${winStagingDir}" "${winTxaPath}"`,
            'if not errorlevel 1 goto updatesuccess',
            'echo WARNING: Failed to move staging directory. Falling back to in-place copy...',
            ':inplacecopy',
            `robocopy "${winStagingDir}" "${winTxaPath}" /E /MOVE /R:5 /W:2 /NFL /NDL /NJH /NJS /NP >NUL`,
            'if %ERRORLEVEL% GEQ 8 (',
            '    set "FAIL_REASON=Failed to copy staging directory into place."',
            '    goto updatefailed',
            ')',
            `if exist "${winStagingDir}" rmdir /s /q "${winStagingDir}"`,
            `if exist "${winStagingDir}" echo WARNING: Could not fully remove staging directory.`,
            ':updatesuccess',
            'echo.',
            'echo sxPanel update applied successfully!',
            'if exist "%FAILFILE%" del /f /q "%FAILFILE%" >NUL 2>&1',
            'goto restartfx',
            ':updatefailed',
            'echo.',
            'echo ERROR: %FAIL_REASON%',
            '> "%FAILFILE%" echo %FAIL_REASON%',
            'echo Update failed; attempting to restart FXServer with current files...',
        ];

        if (restartCmd) {
            const restartScriptPath = path.join(parentDir, 'sxpanel_restart_cmd.cmd');
            const winRestartScript = escapeBatchPath(restartScriptPath);
            fs.writeFileSync(restartScriptPath, `@echo off\r\ncd /d "${winCwd}"\r\n${restartCmd}\r\n`);
            batLines.push(
                ':restartfx',
                'echo Restarting FXServer...',
                'echo.',
                `start "FXServer" cmd.exe /c "${winRestartScript}"`,
                'timeout /t 3 /nobreak >nul',
                `del "${winRestartScript}"`,
            );
        } else {
            batLines.push(
                ':restartfx',
                'echo Could not determine restart command automatically.',
                'echo Please restart FXServer manually.',
            );
        }
        batLines.push('del "%~f0"');

        fs.writeFileSync(scriptPath, batLines.join('\r\n'));

        const child = spawn('cmd.exe', ['/c', `start "sxPanel Update" cmd.exe /c "${winScriptPath}"`], {
            detached: true,
            stdio: 'ignore',
            cwd: winParentDir,
            shell: true,
        });
        child.unref();
        console.ok('Swap script spawned. Exiting process for update...');
    }

    /**
     * Linux swap: detached bash script waits for our PID to die, then moves the staging
     * directory into place of the old monitor/ dir, and restarts FXServer.
     */
    private spawnLinuxSwapScript(parentDir: string) {
        const pid = process.pid;
        const escapeSh = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;

        let restartCmd = '';
        try {
            const cmdlineRaw = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
            const cmdArgs = cmdlineRaw.split('\0').filter(Boolean);
            restartCmd = cmdArgs.map((a) => escapeSh(a)).join(' ');
        } catch {
            console.warn('Could not capture command line for auto-restart.');
        }

        const scriptPath = path.join(parentDir, 'sxpanel_update_swap.sh');
        const logPath = path.join(parentDir, 'sxpanel_update_swap.log');
        const shTxaPath = escapeSh(txEnv.txaPath);
        const shStagingDir = escapeSh(this.stagingDir);
        const shTxaPathBak = escapeSh(txEnv.txaPath + '.bak');

        const shLines = [
            '#!/bin/bash',
            '# sxPanel Update Script',
            '',
            'trap "" HUP',
            '',
            `LOGFILE=${escapeSh(logPath)}`,
            `> "$LOGFILE"`,
            'log() { echo "$@" | tee -a "$LOGFILE"; }',
            '',
            `log "Waiting for FXServer (PID ${pid}) to shut down..."`,
            `while kill -0 ${pid} 2>/dev/null; do sleep 0.5; done`,
            `log "FXServer stopped."`,
            '',
            'log "Swapping sxPanel files..."',
            `if [ -d ${shTxaPath} ]; then`,
            `    mv ${shTxaPath} ${shTxaPathBak} || { log "ERROR: Failed to back up current sxPanel files."; exit 1; }`,
            'fi',
            `if mv ${shStagingDir} ${shTxaPath}; then`,
            `    rm -rf ${shTxaPathBak} 2>/dev/null || true`,
            '    log "sxPanel update applied successfully!"',
            'else',
            '    log "ERROR: Failed to move staging directory into place."',
            `    if [ -d ${shTxaPathBak} ]; then`,
            `        mv ${shTxaPathBak} ${shTxaPath}`,
            '        log "Rolled back to previous sxPanel files."',
            '    fi',
            '    exit 1',
            'fi',
        ];

        if (restartCmd) {
            const cwd = process.cwd();
            shLines.push(
                '',
                'log "Restarting FXServer..."',
                `rm -f ${escapeSh(scriptPath)} ${escapeSh(logPath)}`,
                `cd ${escapeSh(cwd)}`,
                `exec ${restartCmd}`,
            );
        } else {
            shLines.push('', 'log "Could not determine restart command. Please restart FXServer manually."');
        }

        fs.writeFileSync(scriptPath, shLines.join('\n') + '\n', { mode: 0o755 });
        let spawnCmd: string;
        let spawnArgs: string[];
        try {
            execSync('which setsid', { stdio: 'ignore' });
            spawnCmd = 'setsid';
            spawnArgs = ['bash', scriptPath];
        } catch {
            spawnCmd = 'bash';
            spawnArgs = [scriptPath];
        }
        const child = spawn(spawnCmd, spawnArgs, {
            detached: true,
            stdio: ['ignore', 'inherit', 'inherit'],
            cwd: parentDir,
        });
        child.unref();
        console.ok('Update swap script spawned. Exiting process for update...');
    }

    /**
     * Resets the updater state (e.g. after an error).
     */
    async reset() {
        await fsp.rm(this.updateDir, { recursive: true, force: true }).catch(() => {});
        await fsp.rm(this.stagingDir, { recursive: true, force: true }).catch(() => {});
        await this.clearPersistedFailureStatus();
        this._status = { phase: 'idle' };
    }

    /**
     * Extracts a ZIP archive into `destDir`, validating every entry resolves inside `destDir`
     * before writing (no zip-slip).
     */
    private async extractZipSafe(srcPath: string, destDir: string): Promise<void> {
        const destResolved = path.resolve(destDir);
        const allowedPrefix = destResolved + path.sep;
        const zip = new StreamZip.async({ file: srcPath });
        try {
            const entries = await zip.entries();
            for (const entryName of Object.keys(entries)) {
                if (path.isAbsolute(entryName) || /^[a-zA-Z]:/.test(entryName) || entryName.includes('\0')) {
                    throw new Error(`Archive entry has unsafe name: ${entryName}`);
                }
                const resolved = path.resolve(destResolved, entryName);
                if (resolved !== destResolved && !resolved.startsWith(allowedPrefix)) {
                    throw new Error(`Archive entry escapes staging directory: ${entryName}`);
                }
            }
            await zip.extract(null, destResolved);
        } finally {
            await zip.close();
        }
    }
}
