import fs from 'node:fs';
import path from 'node:path';
import type { InitializedCtx } from '@modules/WebServer/ctxTypes';
import { txDevEnv, txEnv } from '@core/globalData';
import { extractPngBufferFromLogoSvg } from '@shared/deferralCardLogo';

let cachedPng: Buffer | null | undefined;

function getLogoSvgPath(): string {
    if (txDevEnv.ENABLED) {
        return path.join(txDevEnv.SRC_PATH, 'panel', 'public', 'logo.svg');
    }
    return path.join(txEnv.txaPath, 'panel', 'logo.svg');
}

function loadWatermarkPng(): Buffer | null {
    if (cachedPng !== undefined) return cachedPng;
    try {
        const svg = fs.readFileSync(getLogoSvgPath(), 'utf8');
        cachedPng = extractPngBufferFromLogoSvg(svg);
    } catch {
        cachedPng = null;
    }
    return cachedPng;
}

/** Serves the sxPanel watermark as PNG (FiveM cannot render SVG in img tags). */
export default async function deferralCardLogo(ctx: InitializedCtx) {
    const png = loadWatermarkPng();
    if (!png?.length) {
        ctx.status = 404;
        return;
    }
    ctx.type = 'image/png';
    ctx.set('Cache-Control', 'public, max-age=86400');
    ctx.body = png;
}
