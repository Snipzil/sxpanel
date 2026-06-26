import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

import { RESOURCE_ZIP_SKIP_DIRECTORY_NAMES } from './shared';

export type NativeResourceZipProcess = {
    stdout: ChildProcessWithoutNullStreams['stdout'];

    done: Promise<{ ok: true } | { ok: false; error: string }>;

    child: ChildProcessWithoutNullStreams;
};

/**

 * Streams a store-only zip via the system `tar` binary (bsdtar on Windows).

 * Starts emitting bytes immediately — no Node-side file queue.

 */

export const spawnNativeResourceZip = (resourceRoot: string): NativeResourceZipProcess => {
    const args: string[] = [];

    for (const dirName of RESOURCE_ZIP_SKIP_DIRECTORY_NAMES) {
        args.push('--exclude', dirName);
    }

    args.push('-a', '-c', '-f', '-', '-C', resourceRoot, '.');

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
