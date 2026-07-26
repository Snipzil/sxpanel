import { spawn, type ChildProcessByStdio } from 'node:child_process';

import type { Readable } from 'node:stream';

import { RESOURCE_ZIP_SKIP_DIRECTORY_NAMES } from './shared';

type NativeTarChildProcess = ChildProcessByStdio<null, Readable, Readable>;

export type NativeResourceZipProcess = {
    stdout: Readable;

    done: Promise<{ ok: true } | { ok: false; error: string }>;

    child: NativeTarChildProcess;
};

/**

 * Whether the system `tar` binary can write the zip container format.

 * Only bsdtar (libarchive) supports `--format=zip`; GNU tar rejects it immediately

 * with a non-zero exit. Probed once and cached for the process lifetime.

 */

let cachedZipCapability: Promise<boolean> | null = null;

const probeNativeZipCapability = (): Promise<boolean> => {
    return new Promise((resolve) => {
        const child = spawn('tar', ['--format=zip', '--help'], {
            stdio: ['ignore', 'ignore', 'ignore'],

            windowsHide: true,
        });

        child.once('error', () => resolve(false));

        child.once('close', (code) => resolve(code === 0));
    });
};

export const isNativeZipCapable = (): Promise<boolean> => {
    if (!cachedZipCapability) {
        cachedZipCapability = probeNativeZipCapability();
    }

    return cachedZipCapability;
};

/**

 * Streams a store-only zip via the system `tar` binary (bsdtar on Windows).

 * Starts emitting bytes immediately — no Node-side file queue.

 * Caller must check `isNativeZipCapable()` first: without `--format=zip` support

 * this silently writes a plain tar stream instead (no error, no PK signature).

 */

export const spawnNativeResourceZip = (resourceRoot: string): NativeResourceZipProcess => {
    const args: string[] = ['--format=zip'];

    for (const dirName of RESOURCE_ZIP_SKIP_DIRECTORY_NAMES) {
        args.push('--exclude', dirName);
    }

    args.push('-c', '-f', '-', '-C', resourceRoot, '.');

    const child = spawn('tar', args, {
        stdio: ['ignore', 'pipe', 'pipe'],

        windowsHide: true,
    });

    const done = new Promise<{ ok: true } | { ok: false; error: string }>((resolve) => {
        let stderr = '';

        child.stderr?.on('data', (chunk: Buffer) => {
            stderr += chunk.toString();
        });

        child.on('error', (error) => {
            resolve({ ok: false, error: error.message });
        });

        child.on('close', (code) => {
            if (code === 0) {
                resolve({ ok: true });

                return;
            }

            resolve({
                ok: false,

                error: stderr.trim() || `tar exited with code ${code ?? 'unknown'}`,
            });
        });
    });

    return { stdout: child.stdout, done, child };
};
