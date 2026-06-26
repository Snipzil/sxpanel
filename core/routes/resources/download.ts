const modulename = 'WebServer:ResourcesDownload';

import consoleFactory from '@lib/console';

import { AuthedCtx } from '@modules/WebServer/ctxTypes';

import fsp from 'node:fs/promises';

import { spawnNativeResourceZip } from './nativeResourceZip';

import { createResourceZipArchive, pumpResourceZipStream } from './resourceDownloadCore';

import { isValidResourceName, resolveResourceDownloadPath } from './shared';

const console = consoleFactory(modulename);

const getRequestParam = (ctx: AuthedCtx, key: string) => {
    const body = ctx.request.body;

    if (body && typeof body === 'object') {
        const value = (body as Record<string, unknown>)[key];

        if (typeof value === 'string') return value;
    }

    return ctx.query[key];
};

const isNativeZipAvailable = (resourceRoot: string) => {
    const nativeZip = spawnNativeResourceZip(resourceRoot);

    return Promise.race([
        new Promise<false>((resolve) => {
            nativeZip.child.once('error', () => resolve(false));
        }),

        new Promise<true>((resolve) => {
            setImmediate(() => resolve(true));
        }),
    ]).then((available) => ({ available, nativeZip }));
};

const streamArchiverFallback = (ctx: AuthedCtx, resourceRoot: string, name: string): void => {
    const archive = createResourceZipArchive();

    ctx.attachment(`${name}.zip`);

    ctx.type = 'application/zip';

    ctx.set('Cache-Control', 'no-store');

    ctx.body = archive;

    archive.on('error', (error) => {
        console.error(`Resource zip stream error for "${name}": ${error.message}`);

        if (!ctx.res.writableEnded) {
            ctx.res.destroy();
        }
    });

    archive.on('end', () => {
        ctx.admin.logAction(`Downloaded resource "${name}"`, 'resource.download');

        console.log(`[${ctx.admin.name}] Downloaded resource "${name}" (archiver fallback).`);
    });

    void pumpResourceZipStream(archive, resourceRoot).then((zipResult) => {
        if (zipResult.ok) {
            return;
        }

        if (!ctx.res.headersSent) {
            ctx.status = zipResult.status;

            ctx.body = { error: zipResult.error };

            return;
        }

        if (!ctx.res.writableEnded) {
            ctx.res.destroy();
        }
    });
};

/**

 * GET /resources/download?name=<resourceName>&path=<resourcePath>

 * Streams a single resource folder to the browser as a zip.

 */

export default async function ResourcesDownload(ctx: AuthedCtx) {
    if (!ctx.admin.hasPermission('commands.resources.download')) {
        return ctx.send({ error: "You don't have permission to download resources." });
    }

    const resourceName = getRequestParam(ctx, 'name');

    if (!isValidResourceName(resourceName)) {
        ctx.status = 400;

        return ctx.send({ error: 'Invalid resource name.' });
    }

    const resolved = await resolveResourceDownloadPath(resourceName, getRequestParam(ctx, 'path'));

    if (!resolved.ok) {
        ctx.status = resolved.status;

        return ctx.send({ error: resolved.error });
    }

    try {
        const dirStat = await fsp.stat(resolved.resourceRoot);

        if (!dirStat.isDirectory()) {
            ctx.status = 400;

            return ctx.send({ error: 'Resource path is not a directory.' });
        }
    } catch {
        ctx.status = 404;

        return ctx.send({ error: 'Resource directory not found on disk.' });
    }

    const name = resourceName;

    const { available, nativeZip } = await isNativeZipAvailable(resolved.resourceRoot);

    if (!available) {
        console.warn(`Native zip unavailable for "${name}", using archiver fallback.`);

        streamArchiverFallback(ctx, resolved.resourceRoot, name);

        return;
    }

    ctx.attachment(`${name}.zip`);

    ctx.type = 'application/zip';

    ctx.set('Cache-Control', 'no-store');

    ctx.body = nativeZip.stdout;

    void nativeZip.done.then((result) => {
        if (result.ok) {
            ctx.admin.logAction(`Downloaded resource "${name}"`, 'resource.download');

            console.log(`[${ctx.admin.name}] Downloaded resource "${name}".`);

            return;
        }

        console.error(`Native zip failed for "${name}": ${result.error}`);

        if (!ctx.res.writableEnded) {
            ctx.res.destroy();
        }
    });
}
