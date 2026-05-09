const modulename = 'WebServer:ServeStaticMw';
import path from 'node:path';
import consoleFactory from '@lib/console';
import type { Next } from 'koa';
import type { RawKoaCtx } from '../ctxTypes';
import { txDevEnv, txEnv } from '@core/globalData';
import { getCompressedFile, type CompressionResult } from './serveStaticMw';
const console = consoleFactory(modulename);

type RuntimeFile = CompressionResult & {
    mime: string;
};
type RuntimeFileCached = RuntimeFile & {
    name: string;
    date: string;
};

class LimitedCacheArray extends Array<RuntimeFileCached> {
    constructor(public readonly limit: number) {
        super();
    }
    add(name: string, file: RuntimeFile) {
        if (this.length >= this.limit) this.shift();
        const toCache: RuntimeFileCached = {
            name,
            date: new Date().toUTCString(),
            ...file,
        };
        super.push(toCache);
        return toCache;
    }
}
const runtimeCache = new LimitedCacheArray(50);

const iconMimeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

const getServerIcon = async (fileName: string): Promise<RuntimeFile | undefined> => {
    const fileRegex = /^icon-(?<hash>[a-f0-9]{16})(?<ext>\.(?:png|jpe?g|gif|webp|svg|ico))(?:\?.*|$)/i;
    const match = fileName.match(fileRegex);
    const iconHash = match?.groups?.hash;
    const iconExt = match?.groups?.ext?.toLowerCase();
    if (!iconHash || !iconExt) return undefined;
    const mime = iconMimeMap[iconExt];
    if (!mime) return undefined;
    const localPath = path.resolve(txEnv.txaPath, '.runtime', `icon-${iconHash}${iconExt}`);
    const fileData = await getCompressedFile(localPath);
    return {
        ...fileData,
        mime,
    };
};

const serveFile = async (ctx: RawKoaCtx, file: RuntimeFileCached) => {
    ctx.type = file.mime;
    if (ctx.acceptsEncodings('gzip', 'identity') === 'gzip') {
        ctx.set('Content-Encoding', 'gzip');
        ctx.body = file.gz;
    } else {
        ctx.body = file.raw;
    }
    if (txDevEnv.ENABLED) {
        ctx.set('Cache-Control', `public, max-age=0`);
    } else {
        ctx.set('Cache-Control', `public, max-age=1800`); //30 minutes
        ctx.set('Last-Modified', file.date);
    }
};

/**
 * Middleware responsible for serving all the /.runtime/ files
 */
export default async function serveRuntimeMw(ctx: RawKoaCtx, next: Next) {
    //Middleware pre-condition
    if (!ctx.path.startsWith('/.runtime/') || ctx.method !== 'GET') {
        return await next();
    }

    const fileNameRegex = /^\/\.runtime\/(?<file>[^\/#\?]{3,64})/;
    const fileName = ctx.path.match(fileNameRegex)?.groups?.file;
    if (!fileName) {
        return await next();
    }

    //Try to serve from cache first
    for (let i = 0; i < runtimeCache.length; i++) {
        const currCachedFile = runtimeCache[i];
        if (currCachedFile.name === fileName) {
            serveFile(ctx, currCachedFile);
            return;
        }
    }

    const handleError = (error: any) => {
        console.verbose.error(`Failed serve runtime file: ${fileName}`);
        console.verbose.dir(error);
        ctx.status = 500;
        ctx.body = 'Internal Server Error';
    };

    //Server icon
    let runtimeFile: RuntimeFile | undefined;
    try {
        runtimeFile = await getServerIcon(fileName);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            return handleError(error);
        }
    }

    //If the file was not found
    if (runtimeFile) {
        const cached = runtimeCache.add(fileName, runtimeFile);
        serveFile(ctx, cached);
    } else {
        ctx.status = 404;
        ctx.body = 'File not found';
    }
}
