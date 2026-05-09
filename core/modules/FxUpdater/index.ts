const modulename = 'FxUpdater';
import path from 'node:path';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { promisify } from 'node:util';
import stream from 'node:stream';
import StreamZip from 'node-stream-zip';

import { txEnv } from '@core/globalData';
import got from '@lib/got';
import consoleFactory from '@lib/console';
import quitProcess from '@lib/quitProcess';
import { emsg } from '@shared/emsg';
import type { FxUpdateStatus } from '@shared/otherTypes';
const console = consoleFactory(modulename);
const pipeline = promisify(stream.pipeline);

/**
 * Module responsible for downloading and applying FXServer artifact updates.
 * The flow is: download → extract → stop game server → swap directories → restart process.
 */
export default class FxUpdater {
    private _status: FxUpdateStatus = { phase: 'idle' };
    /**
     * The root directory of the artifact that gets swapped during updates.
     * Windows: fxsPath is the root (e.g. C:/fxserver/)
     * Linux:   fxsPath is citizen_root (e.g. /path/alpine/opt/cfx-server/)
     *          but the actual artifact root is the alpine/ dir (../../ relative)
     */
    private readonly artifactRootDir: string;
    private updateDir!: string;
    private archivePath!: string;
    private stagingDir!: string;
    private failureStatusPath!: string;

    constructor() {
        if (txEnv.isWindows) {
            //Windows: fxsPath IS the artifact root (contains FXServer.exe, citizen/, etc.)
            this.artifactRootDir = txEnv.fxsPath;
        } else {
            //Linux: fxsPath is citizen_root at alpine/opt/cfx-server/
            //The artifact root is the alpine/ directory, 2 levels up
            this.artifactRootDir = path.resolve(txEnv.fxsPath, '../../');
        }
        const parentDir = path.dirname(this.artifactRootDir);
        this.updateDir = path.join(parentDir, 'fxserver_update_temp');
        this.archivePath = path.join(this.updateDir, txEnv.isWindows ? 'server.zip' : 'fx.tar.xz');
        this.stagingDir = path.join(parentDir, 'fxserver_update_staging');
        this.failureStatusPath = path.join(parentDir, 'fxserver_update_failure.txt');
        this.loadPersistedFailureStatus();
    }

    get status(): FxUpdateStatus {
        return this._status;
    }

    /**
     * Loads any persisted updater failure status written by the detached
     * swap script (used mainly on Windows where the process exits mid-apply).
     */
    private loadPersistedFailureStatus() {
        try {
            const persisted = fs.readFileSync(this.failureStatusPath, 'utf8').trim();
            if (!persisted.length) return;
            this._status = { phase: 'error', message: persisted };
            console.warn(`Loaded persisted artifact update failure: ${persisted}`);
        } catch {
            // no persisted failure status
        }
    }

    /**
     * Clears persisted updater failure status file.
     */
    private async clearPersistedFailureStatus() {
        await fsp.rm(this.failureStatusPath, { force: true }).catch(() => {});
    }

    /**
     * Downloads the FXServer artifact from the given URL.
     */
    async download(url: string) {
        if (this._status.phase === 'downloading') {
            throw new Error('A download is already in progress.');
        }
        if (this._status.phase === 'applying') {
            throw new Error('An update is currently being applied.');
        }

        this._status = { phase: 'downloading', percentage: 0 };
        try {
            await this.clearPersistedFailureStatus();

            //Clean up any previous temp files
            await fsp.rm(this.updateDir, { recursive: true, force: true });
            await fsp.rm(this.stagingDir, { recursive: true, force: true });
            await fsp.mkdir(this.updateDir, { recursive: true });

            //Stream download with progress
            const gotStream = got.stream(url, {
                timeout: {
                    request: 60 * 60 * 1000, // 60 minutes
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

            //Extract to staging directory
            this._status = { phase: 'extracting' };
            await fsp.mkdir(this.stagingDir, { recursive: true });
            console.warn('Extracting artifact archive...');
            const ext = path.extname(this.archivePath).toLowerCase();
            if (ext === '.zip') {
                // Use node-stream-zip for cross-platform extraction.
                // Avoids shelling out to powershell/unzip with interpolated paths
                // (command injection), and explicitly validates every entry
                // stays inside stagingDir (zip-slip).
                await this.extractZipSafe(this.archivePath, this.stagingDir);
            } else {
                // .tar.xz — spawn tar directly (no shell); paths are passed as
                // separate argv entries, so there is no injection surface.
                await new Promise<void>((resolve, reject) => {
                    const child = spawn('tar', ['-xf', this.archivePath, '-C', this.stagingDir], {
                        stdio: ['ignore', 'ignore', 'pipe'],
                    });
                    const stderrChunks: Buffer[] = [];
                    child.stderr!.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
                    child.on('error', reject);
                    child.on('close', (code) => {
                        if (code === 0) {
                            resolve();
                        } else {
                            const stderrText = Buffer.concat(stderrChunks).toString().trim();
                            const detail = stderrText ? `: ${stderrText}` : '';
                            reject(new Error(`tar exited with code ${code}${detail}`));
                        }
                    });
                });
            }

            //Verify the extraction produced something meaningful
            const files = await fsp.readdir(this.stagingDir);
            if (!files.length) {
                throw new Error('Extraction produced an empty directory.');
            }

            //If the tar extracted a single top-level directory (e.g. alpine/),
            //unwrap it so staging/ directly contains the artifact contents.
            //Also handle the case where the tar has the content dir plus extra
            //files (e.g. alpine/ + run.sh) — we still need to unwrap alpine/.
            if (files.length === 1) {
                const singleEntry = path.join(this.stagingDir, files[0]);
                const stat = await fsp.stat(singleEntry);
                if (stat.isDirectory()) {
                    const unwrapTmp = this.stagingDir + '_unwrap';
                    await fsp.rm(unwrapTmp, { recursive: true, force: true });
                    await fsp.rename(singleEntry, unwrapTmp);
                    await fsp.rm(this.stagingDir, { recursive: true, force: true });
                    await fsp.rename(unwrapTmp, this.stagingDir);
                    console.verbose.log(`Unwrapped nested directory: ${files[0]}`);
                }
            } else if (!txEnv.isWindows) {
                //Linux artifacts may extract as alpine/ + extra files (e.g. run.sh).
                //If the expected structure is nested inside alpine/, unwrap it.
                const alpineDir = path.join(this.stagingDir, 'alpine');
                const alpineStat = await fsp.stat(alpineDir).catch(() => null);
                if (alpineStat?.isDirectory()) {
                    const nestedBin = path.join(alpineDir, 'opt', 'cfx-server', 'FXServer');
                    const hasBin = await fsp
                        .access(nestedBin)
                        .then(() => true)
                        .catch(() => false);
                    if (hasBin) {
                        console.verbose.log('Unwrapping alpine/ from multi-entry archive...');
                        //Remove all non-alpine entries (e.g. run.sh)
                        for (const f of files) {
                            if (f !== 'alpine') {
                                await fsp.rm(path.join(this.stagingDir, f), { recursive: true, force: true });
                            }
                        }
                        //Now unwrap alpine/ to staging root
                        const unwrapTmp = this.stagingDir + '_unwrap';
                        await fsp.rm(unwrapTmp, { recursive: true, force: true });
                        await fsp.rename(alpineDir, unwrapTmp);
                        await fsp.rm(this.stagingDir, { recursive: true, force: true });
                        await fsp.rename(unwrapTmp, this.stagingDir);
                        console.verbose.log('Unwrapped alpine/ directory.');
                    }
                }
            }

            //Validate the expected artifact structure before proceeding
            if (!txEnv.isWindows) {
                const expectedLdMusl = path.join(this.stagingDir, 'opt', 'cfx-server', 'ld-musl-x86_64.so.1');
                const expectedFxServer = path.join(this.stagingDir, 'opt', 'cfx-server', 'FXServer');
                const [hasLdMusl, hasFxServer] = await Promise.all([
                    fsp
                        .access(expectedLdMusl)
                        .then(() => true)
                        .catch(() => false),
                    fsp
                        .access(expectedFxServer)
                        .then(() => true)
                        .catch(() => false),
                ]);
                if (!hasLdMusl || !hasFxServer) {
                    const listing = await this.listStagingContents();
                    const missing = [!hasLdMusl && 'ld-musl-x86_64.so.1', !hasFxServer && 'FXServer']
                        .filter(Boolean)
                        .join(', ');
                    console.error(`Extracted artifact missing: ${missing}`);
                    console.error(`Staging directory contents:\n${listing}`);
                    throw new Error(
                        `Invalid artifact structure: expected ${missing} at opt/cfx-server/ but not found. ` +
                            'The artifact may be for a different platform or have an incompatible structure.',
                    );
                }
            } else {
                const expectedExe = path.join(this.stagingDir, 'FXServer.exe');
                const hasExe = await fsp
                    .access(expectedExe)
                    .then(() => true)
                    .catch(() => false);
                if (!hasExe) {
                    const listing = await this.listStagingContents();
                    console.error(`Extracted artifact missing FXServer.exe`);
                    console.error(`Staging directory contents:\n${listing}`);
                    throw new Error(
                        'Invalid artifact structure: FXServer.exe not found at the expected location. ' +
                            'The artifact may be corrupted or for a different platform.',
                    );
                }
            }

            //Cleanup the archive
            await fsp.rm(this.updateDir, { recursive: true, force: true });

            this._status = { phase: 'extracted' };
            console.ok(`Artifact downloaded and extracted successfully.`);

            //Automatically proceed to apply
            await this.apply();
        } catch (error) {
            const msg = emsg(error) ?? 'Unknown download error';
            console.error(`Artifact download failed: ${msg}`);
            this._status = { phase: 'error', message: msg };
            await fsp.writeFile(this.failureStatusPath, msg).catch(() => {});
            //Cleanup on failure
            await fsp.rm(this.updateDir, { recursive: true, force: true }).catch(() => {});
            await fsp.rm(this.stagingDir, { recursive: true, force: true }).catch(() => {});
            throw error;
        }
    }

    /**
     * Applies the downloaded update:
     * 1. Stop the game server.
     * 2. On Windows: spawn a detached batch script that kills FXServer, moves citizen/
     *    from old to staging (instant on same NTFS volume), deletes old dir, renames staging.
     *    On Linux: move citizen/ into staging, rename old → backup, rename staging → final.
     */
    async apply() {
        if (this._status.phase !== 'extracted') {
            throw new Error('No downloaded update ready to apply.');
        }

        this._status = { phase: 'applying' };
        const parentDir = path.dirname(this.artifactRootDir);

        try {
            await this.clearPersistedFailureStatus();

            //Check if citizen/ exists in the current artifacts (needs to be preserved)
            //On both platforms, citizen/ is a subdirectory of fxsPath
            const oldCitizenDir = path.join(txEnv.fxsPath, 'citizen');
            const citizenExists = await fsp
                .access(oldCitizenDir)
                .then(() => true)
                .catch(() => false);

            //Stop the game server if running (skip notice delay — we're replacing the whole artifact)
            if (!txCore.fxRunner.isIdle) {
                console.warn('Stopping game server for update...');
                const killError = await txCore.fxRunner.killServer('artifact update', 'fxPanel', false, true);
                if (killError) {
                    throw new Error(`Failed to stop game server: ${killError}`);
                }
            }

            if (txEnv.isWindows) {
                //Windows: spawn a batch script that waits for our PID to die,
                //then swaps citizen/ via move (instant on same volume), deletes
                //the old artifact dir, and renames the staging dir.
                const toWin = (p: string) => p.replace(/\//g, '\\').replace(/\\+$/, '');
                /** Escapes a path for safe use inside a quoted batch string */
                const escapeBatchPath = (p: string) => {
                    return toWin(p)
                        .replace(/%/g, '%%') // percent signs must be doubled
                        .replace(/([\^&<>|])/g, '^$1'); // caret-escape special chars
                };
                const winFxsPath = escapeBatchPath(this.artifactRootDir);
                const winStagingDir = escapeBatchPath(this.stagingDir);
                const winParentDir = escapeBatchPath(parentDir);
                const scriptPath = path.join(parentDir, 'fxs_update_swap.bat');
                const winScriptPath = escapeBatchPath(scriptPath);
                const winFailureStatusPath = escapeBatchPath(this.failureStatusPath);
                const pid = process.pid;

                //Capture the original command line so we can restart after swap
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
                    'title FXServer Artifact Update',
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
                ];

                //Preserve citizen/ using copy-first on Windows.
                //Directory rename/move is commonly blocked by transient locks,
                //while robocopy can still succeed in many of those cases.
                if (citizenExists) {
                    const winOldCitizen = escapeBatchPath(oldCitizenDir);
                    const winNewCitizen = escapeBatchPath(path.join(this.stagingDir, 'citizen'));
                    batLines.push(
                        'echo.',
                        'echo Preserving citizen/ directory...',
                        `if exist "${winNewCitizen}" rmdir /s /q "${winNewCitizen}"`,
                        `robocopy "${winOldCitizen}" "${winNewCitizen}" /E /R:3 /W:1 /NFL /NDL /NJH /NJS /NP >NUL`,
                        'if %ERRORLEVEL% GEQ 8 (',
                        '    echo WARNING: Could not preserve citizen/. Robocopy error %ERRORLEVEL%. Continuing with artifact-provided citizen/.',
                        `    if exist "${winNewCitizen}" rmdir /s /q "${winNewCitizen}"`,
                        ') else (',
                        '    echo citizen/ copied successfully.',
                        `    rmdir /s /q "${winOldCitizen}" >NUL 2>&1`,
                        `    if exist "${winOldCitizen}" echo WARNING: Could not remove old citizen/ source after copy; proceeding anyway.`,
                        ')',
                    );
                }

                batLines.push(
                    'echo.',
                    'echo Removing old artifacts...',
                    'set retries=0',
                    ':deleteloop',
                    `rmdir /s /q "${winFxsPath}" 2>NUL`,
                    `if exist "${winFxsPath}" (`,
                    '    set /a retries+=1',
                    '    if %retries% GEQ 15 (',
                    '        echo WARNING: Could not fully delete old artifact directory. Falling back to in-place copy.',
                    '        goto inplacecopy',
                    '    )',
                    '    echo Waiting for directory to be released... attempt %retries%',
                    '    timeout /t 2 /nobreak >nul',
                    '    goto deleteloop',
                    ')',
                    'echo Old artifacts removed.',
                    'echo Moving new artifacts into place...',
                    `move "${winStagingDir}" "${winFxsPath}"`,
                    'if not errorlevel 1 goto updatesuccess',
                    'echo WARNING: Failed to move staging directory. Falling back to in-place copy...',
                    ':inplacecopy',
                    'echo In-place copy excludes citizen/ to avoid lock-related overwrite failures...',
                    `robocopy "${winStagingDir}" "${winFxsPath}" /E /MOVE /XD citizen /R:5 /W:2 /NFL /NDL /NJH /NJS /NP >NUL`,
                    'if %ERRORLEVEL% GEQ 8 (',
                    '    set "FAIL_REASON=Failed to copy staging directory into place."',
                    '    goto updatefailed',
                    ')',
                    `if exist "${winStagingDir}\\citizen" (`,
                    `    if exist "${winFxsPath}\\citizen" (`,
                    '        echo Keeping existing citizen/ from current install.',
                    '    ) else (',
                    '        echo No existing citizen/ found; copying citizen/ from staging...',
                    `        robocopy "${winStagingDir}\\citizen" "${winFxsPath}\\citizen" /E /R:3 /W:1 /NFL /NDL /NJH /NJS /NP >NUL`,
                    '        if %ERRORLEVEL% GEQ 8 (',
                    '            echo WARNING: Could not copy citizen/ from staging. Robocopy error %ERRORLEVEL%.',
                    '        )',
                    '    )',
                    ')',
                    `if exist "${winStagingDir}" rmdir /s /q "${winStagingDir}"`,
                    `if exist "${winStagingDir}" echo WARNING: Could not fully remove staging directory.`,
                    ':updatesuccess',
                    'echo.',
                    'echo Artifact update applied successfully!',
                    'if exist "%FAILFILE%" del /f /q "%FAILFILE%" >NUL 2>&1',
                    'goto restartfx',
                    ':updatefailed',
                    'echo.',
                    'echo ERROR: %FAIL_REASON%',
                    '> "%FAILFILE%" echo %FAIL_REASON%',
                    'echo Update failed; attempting to restart FXServer with current files...',
                );

                if (restartCmd) {
                    // Write restartCmd to a separate script to avoid command injection
                    // in the batch file from unescaped metacharacters
                    const restartScriptPath = path.join(parentDir, 'fxs_restart_cmd.cmd');
                    const winRestartScript = escapeBatchPath(restartScriptPath);
                    await fsp.writeFile(restartScriptPath, `@echo off\r\ncd /d "${winCwd}"\r\n${restartCmd}\r\n`);
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

                const batContent = batLines.join('\r\n');
                await fsp.writeFile(scriptPath, batContent);

                const child = spawn('cmd.exe', ['/c', `start "FXServer Update" cmd.exe /c "${winScriptPath}"`], {
                    detached: true,
                    stdio: 'ignore',
                    cwd: winParentDir,
                    shell: true,
                });
                child.unref();
                console.ok('Swap script spawned. Exiting process for update...');
            } else {
                //Linux: spawn a detached bash script (like the Windows bat) that:
                //  1. Waits for FXServer (this process) to die
                //  2. Copies citizen/ (opt/cfx-server/citizen) from old into staging
                //  3. Deletes the old alpine/ directory
                //  4. Renames staging to alpine/
                //  5. Cleans up and restarts FXServer
                const pid = process.pid;
                const escapeSh = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;

                //Capture the original command line so we can restart after swap
                let restartCmd = '';
                try {
                    const cmdlineRaw = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
                    const cmdArgs = cmdlineRaw.split('\0').filter(Boolean);
                    restartCmd = cmdArgs.map((a) => escapeSh(a)).join(' ');
                } catch {
                    console.warn('Could not capture command line for auto-restart.');
                }

                const scriptPath = path.join(parentDir, 'fxs_update_swap.sh');
                const logPath = path.join(parentDir, 'fxs_update_swap.log');
                const shArtifactRoot = escapeSh(this.artifactRootDir);
                const shStagingDir = escapeSh(this.stagingDir);
                const shOldCitizen = escapeSh(oldCitizenDir);
                //citizen/ destination inside staging at the same relative path
                const newCitizenDir = path.join(this.stagingDir, 'opt', 'cfx-server', 'citizen');
                const shNewCitizenParent = escapeSh(path.join(this.stagingDir, 'opt', 'cfx-server'));
                const shNewCitizen = escapeSh(newCitizenDir);
                const shNewCitizenBak = escapeSh(newCitizenDir + '.bak');
                const shArtifactRootBak = escapeSh(this.artifactRootDir + '.bak');
                const shExpectedBin = escapeSh(
                    path.join(this.artifactRootDir, 'opt', 'cfx-server', 'ld-musl-x86_64.so.1'),
                );

                const shLines = [
                    '#!/bin/bash',
                    '# FXServer Artifact Update Script',
                    '',
                    '# Ignore signals from parent process group dying',
                    'trap "" HUP',
                    '',
                    '# Log to file while also printing to terminal',
                    `LOGFILE=${escapeSh(logPath)}`,
                    `> "$LOGFILE"`,
                    'log() { echo "$@" | tee -a "$LOGFILE"; }',
                    '',
                    `log "Waiting for FXServer (PID ${pid}) to shut down..."`,
                    `while kill -0 ${pid} 2>/dev/null; do sleep 0.5; done`,
                    `log "FXServer stopped."`,
                    '',
                ];

                //Preserve citizen/ by moving from old into staging
                if (citizenExists) {
                    shLines.push(
                        'log "Preserving citizen/ directory..."',
                        `mkdir -p ${shNewCitizenParent}`,
                        `if [ -d ${shNewCitizen} ]; then`,
                        `    mv ${shNewCitizen} ${shNewCitizenBak}`,
                        'fi',
                        `if mv ${shOldCitizen} ${shNewCitizen}; then`,
                        `    rm -rf ${shNewCitizenBak} 2>/dev/null || true`,
                        '    log "citizen/ moved into staging."',
                        'else',
                        '    log "ERROR: Failed to move citizen/ into staging."',
                        `    if [ -d ${shNewCitizenBak} ]; then`,
                        `        mv ${shNewCitizenBak} ${shNewCitizen}`,
                        '    fi',
                        '    exit 1',
                        'fi',
                        '',
                    );
                }

                shLines.push(
                    'log "Swapping artifacts..."',
                    `if [ -d ${shArtifactRoot} ]; then`,
                    `    mv ${shArtifactRoot} ${shArtifactRootBak} || { log "ERROR: Failed to back up current artifacts."; exit 1; }`,
                    'fi',
                    `if mv ${shStagingDir} ${shArtifactRoot}; then`,
                    `    rm -rf ${shArtifactRootBak} 2>/dev/null || true`,
                    '    log "Artifact update applied successfully!"',
                    'else',
                    '    log "ERROR: Failed to move staging artifacts into place."',
                    `    if [ -d ${shArtifactRootBak} ]; then`,
                    `        mv ${shArtifactRootBak} ${shArtifactRoot}`,
                    '        log "Rolled back to previous artifacts."',
                    '    fi',
                    '    exit 1',
                    'fi',
                );

                if (restartCmd) {
                    const cwd = process.cwd();
                    shLines.push(
                        '',
                        '# Verify binary exists before attempting restart',
                        `if [ ! -f ${shExpectedBin} ]; then`,
                        `    log "ERROR: ld-musl-x86_64.so.1 not found after update!"`,
                        `    log "Expected at: ${shExpectedBin}"`,
                        `    log "Contents of artifact root:"`,
                        `    find ${shArtifactRoot} -maxdepth 3 -type f 2>&1 | tee -a "$LOGFILE" || true`,
                        `    log "Update completed but FXServer cannot start. Please check the artifact."`,
                        `    exit 1`,
                        'fi',
                        '',
                        'log "Restarting FXServer..."',
                        '# Clean up swap script and log before exec replaces this process',
                        `rm -f ${escapeSh(scriptPath)} ${escapeSh(logPath)}`,
                        `cd ${escapeSh(cwd)}`,
                        `exec ${restartCmd}`,
                    );
                } else {
                    shLines.push('', 'log "Could not determine restart command. Please restart FXServer manually."');
                }

                await fsp.writeFile(scriptPath, shLines.join('\n') + '\n', { mode: 0o755 });
                //Use setsid to create a new session so the script survives
                //the parent FXServer process dying (segfault, SIGTERM, etc.)
                //Fall back to plain bash if setsid is not available
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

            //Terminate the FXServer host process.
            //process.exit() alone only exits the embedded Node.js VM.
            const pid = process.pid;
            setTimeout(() => {
                if (txEnv.isWindows) {
                    //On Windows, ExecuteCommand('quit') tells FXServer to shut down.
                    //The batch script also runs taskkill as a safety net.
                    try {
                        ExecuteCommand('quit');
                    } catch {
                        quitProcess(0);
                    }
                } else {
                    //On Linux, 'quit' is not a valid FXServer command.
                    //Send SIGTERM first for a graceful shutdown, then SIGKILL as safety net.
                    try {
                        process.kill(pid, 'SIGTERM');
                    } catch {
                        /* already dead */
                    }
                }
                //Safety net: if the process is still alive after 5s, force kill it
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
            console.error(`Artifact apply failed: ${msg}`);
            this._status = { phase: 'error', message: msg };
            await fsp.writeFile(this.failureStatusPath, msg).catch(() => {});
            throw error;
        }
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
     * Extracts a ZIP archive into `destDir`, validating every entry resolves
     * inside `destDir` before writing (no zip-slip). Replaces the previous
     * PowerShell/unzip shell-out which interpolated paths into a command line.
     */
    private async extractZipSafe(srcPath: string, destDir: string): Promise<void> {
        const destResolved = path.resolve(destDir);
        const allowedPrefix = destResolved + path.sep;
        const zip = new StreamZip.async({ file: srcPath });
        try {
            const entries = await zip.entries();
            for (const entryName of Object.keys(entries)) {
                // Reject absolute paths, drive letters, and null bytes.
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

    /**
     * Lists the top-level contents of the staging directory for diagnostics.
     */
    private async listStagingContents(): Promise<string> {
        try {
            const entries = await fsp.readdir(this.stagingDir, { withFileTypes: true });
            const lines: string[] = [];
            for (const entry of entries) {
                const prefix = entry.isDirectory() ? '[dir] ' : '      ';
                lines.push(`${prefix}${entry.name}`);
                if (entry.isDirectory()) {
                    try {
                        const subEntries = await fsp.readdir(path.join(this.stagingDir, entry.name), {
                            withFileTypes: true,
                        });
                        for (const sub of subEntries.slice(0, 20)) {
                            const subPrefix = sub.isDirectory() ? '[dir] ' : '      ';
                            lines.push(`  ${subPrefix}${sub.name}`);
                        }
                        if (subEntries.length > 20) lines.push(`  ... and ${subEntries.length - 20} more`);
                    } catch {
                        /* ignore */
                    }
                }
            }
            return lines.join('\n');
        } catch {
            return '(could not read staging directory)';
        }
    }
}
