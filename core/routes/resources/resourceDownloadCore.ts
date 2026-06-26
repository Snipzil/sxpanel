import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import fsp from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { finished } from 'node:stream/promises';
import archiver from 'archiver';
import { isValidResourceName, resolveResourceDownloadPath } from './shared';
import { zipResourceDir, type ZipResourceDirResult } from './zipResourceDir';

type ArchiverInstance = ReturnType<typeof archiver>;

export type ResourceZipResult =
    | { ok: true; archive: ArchiverInstance; resourceName: string }
    | { ok: false; error: string; status: number };

export type SpooledResourceZip = {
    path: string;
    size: number;
    resourceName: string;
};

/** Store-only zip — FiveM assets are usually pre-compressed; skipping deflate is much faster. */
export const createResourceZipArchive = (): ArchiverInstance => {
    return archiver('zip', {
        store: true,
        statConcurrency: 32,
    });
};

/**
 * Queues files then finalizes an archive stream.
 * Intended to run in the background while Koa pipes `archive` to the client.
 */
export async function pumpResourceZipStream(
    archive: ArchiverInstance,
    resourceRoot: string,
): Promise<ZipResourceDirResult> {
    const zipResult = await zipResourceDir(archive, resourceRoot);
    if (!zipResult.ok) {
        archive.destroy(new Error(zipResult.error));
        return zipResult;
    }

    await archive.finalize();
    return zipResult;
}

/**
 * Shared zip pipeline used by in-panel download and remote inventory delivery.
 */
export async function prepareResourceZipDownload(resourceName: string): Promise<ResourceZipResult> {
    if (!isValidResourceName(resourceName)) {
        return { ok: false, error: 'Invalid resource name.', status: 400 };
    }

    const resolved = await resolveResourceDownloadPath(resourceName);
    if (!resolved.ok) {
        return resolved;
    }

    let dirStat;
    try {
        dirStat = await fsp.stat(resolved.resourceRoot);
    } catch {
        return { ok: false, error: 'Resource directory not found on disk.', status: 404 };
    }
    if (!dirStat.isDirectory()) {
        return { ok: false, error: 'Resource path is not a directory.', status: 400 };
    }

    const archive = createResourceZipArchive();
    const zipResult = await zipResourceDir(archive, resolved.resourceRoot);
    if (!zipResult.ok) {
        return zipResult;
    }

    return { ok: true, archive, resourceName };
}

/**
 * Materializes a prepared archive to disk so upload clients receive a complete body.
 */
export async function spoolResourceZipArchive(
    archive: ArchiverInstance,
    resourceName: string,
): Promise<SpooledResourceZip> {
    const path = join(tmpdir(), `fxp-inv-${randomUUID()}.zip`);
    const output = createWriteStream(path);

    archive.on('error', (error) => output.destroy(error));
    archive.pipe(output);
    await archive.finalize();
    await finished(output);

    const stat = await fsp.stat(path);
    return { path, size: stat.size, resourceName };
}

export async function removeSpooledResourceZip(spool: SpooledResourceZip): Promise<void> {
    await unlink(spool.path).catch(() => undefined);
}
