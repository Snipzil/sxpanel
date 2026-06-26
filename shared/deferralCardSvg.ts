/** Max raw SVG file size (stored as data URI in whitelist config — keep SVGs lean). */
export const DEFERRAL_SVG_MAX_BYTES = 256 * 1024;

/** Max PNG size (raster uploads served over HTTP in-game, not inlined). */
export const DEFERRAL_PNG_MAX_BYTES = 1024 * 1024;

/** Max GIF size (animated GIFs are served over HTTP in-game, not inlined). */
export const DEFERRAL_GIF_MAX_BYTES = 1024 * 1024;

const UNSAFE_TAG = /<\s*(script|iframe|object|embed|foreignObject|use)\b[^>]*>[\s\S]*?<\/\s*\1\s*>/gi;
const UNSAFE_SELF_TAG = /<\s*(script|iframe|object|embed|foreignObject)\b[^>]*\/?>/gi;
const EVENT_ATTR = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_HREF = /\s+(href|xlink:href)\s*=\s*("|')\s*javascript:[^"']*\2/gi;

/**
 * Strips dangerous markup from user SVG before embedding in deferral HTML.
 */
export function sanitizeSvgMarkup(raw: string): string {
    let svg = raw.trim();
    if (!svg) return '';
    if (!/<svg[\s>]/i.test(svg)) return '';
    svg = svg.replaceAll(UNSAFE_TAG, '');
    svg = svg.replaceAll(UNSAFE_SELF_TAG, '');
    svg = svg.replaceAll(EVENT_ATTR, '');
    svg = svg.replaceAll(JS_HREF, '');
    return svg.trim();
}

export function isDeferralPngDataUri(src: string | undefined | null): boolean {
    if (!src || typeof src !== 'string') return false;
    return src.trim().startsWith('data:image/png;base64,');
}

export function isDeferralGifDataUri(src: string | undefined | null): boolean {
    if (!src || typeof src !== 'string') return false;
    return src.trim().startsWith('data:image/gif;base64,');
}

/** PNG or GIF stored on custom_image — served via deferral-card-assets in-game. */
export function isDeferralHttpImageDataUri(src: string | undefined | null): boolean {
    return isDeferralPngDataUri(src) || isDeferralGifDataUri(src);
}

/** Decodes a PNG data URI stored on a custom_image element (for HTTP asset routes). */
export function pngDataUriToBuffer(src: string | undefined | null): Buffer | null {
    if (!src?.trim() || !isDeferralPngDataUri(src)) return null;
    const b64 = src.trim().slice('data:image/png;base64,'.length);
    try {
        return Buffer.from(b64, 'base64');
    } catch {
        return null;
    }
}

/** Decodes a GIF data URI stored on a custom_image element (for HTTP asset routes). */
export function gifDataUriToBuffer(src: string | undefined | null): Buffer | null {
    if (!src?.trim() || !isDeferralGifDataUri(src)) return null;
    const b64 = src.trim().slice('data:image/gif;base64,'.length);
    try {
        return Buffer.from(b64, 'base64');
    } catch {
        return null;
    }
}

function isGifFileHeader(bytes: Uint8Array): boolean {
    if (bytes.length < 6) return false;
    const sig = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!, bytes[4]!, bytes[5]!);
    return sig === 'GIF87a' || sig === 'GIF89a';
}

function isPngFileHeader(bytes: Uint8Array): boolean {
    return (
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
    );
}

/** Browser-only: blob URL for large GIF previews (avoids data-URI decode on every React render). */
export function deferralImageDataUriToObjectUrl(src: string | undefined | null): string | null {
    if (typeof URL === 'undefined' || typeof atob === 'undefined') return null;
    const trimmed = src?.trim();
    if (!trimmed || !isDeferralHttpImageDataUri(trimmed)) return null;
    const match = /^data:(image\/(?:gif|png));base64,(.+)$/i.exec(trimmed);
    if (!match?.[1] || !match[2]) return null;
    try {
        const binary = atob(match[2]);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return URL.createObjectURL(new Blob([bytes], { type: match[1].toLowerCase() }));
    } catch {
        return null;
    }
}

function bytesToBase64(bytes: Uint8Array): string {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(bytes).toString('base64');
    }
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary);
}

/**
 * Rasterizes SVG to a PNG data URI (browser only — used before save and in studio).
 */
export async function svgTextToPngDataUriBrowser(svg: string, maxPx = 384): Promise<string> {
    if (typeof document === 'undefined') return '';

    return new Promise((resolve) => {
        const img = new Image();
        const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        const objectUrl = URL.createObjectURL(blob);

        img.onload = () => {
            try {
                const naturalW = img.naturalWidth || maxPx;
                const naturalH = img.naturalHeight || maxPx;
                const scale = Math.min(1, maxPx / Math.max(naturalW, naturalH, 1));
                const width = Math.max(1, Math.round(naturalW * scale));
                const height = Math.max(1, Math.round(naturalH * scale));
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve('');
                    return;
                }
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/png'));
            } catch {
                resolve('');
            } finally {
                URL.revokeObjectURL(objectUrl);
            }
        };

        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            resolve('');
        };

        img.src = objectUrl;
    });
}

/** Converts a stored SVG data URI to PNG (browser only). */
export async function svgDataUriToPngDataUriBrowser(svgDataUri: string, maxPx = 384): Promise<string> {
    const svg = dataUriToSvgText(svgDataUri);
    if (!svg) return '';
    return svgTextToPngDataUriBrowser(svg, maxPx);
}

export function svgTextToDataUri(svg: string): string {
    const encoded = encodeURIComponent(svg).replaceAll("'", '%27').replaceAll('"', '%22');
    return `data:image/svg+xml,${encoded}`;
}

/** Decodes a stored deferral SVG data URI back to sanitized markup (for HTTP asset routes). */
export function dataUriToSvgText(src: string | undefined | null): string {
    if (!src?.trim()) return '';
    const trimmed = src.trim();
    if (!isDeferralSvgDataUri(trimmed)) return '';
    if (trimmed.startsWith('data:image/svg+xml;base64,')) {
        const b64 = trimmed.slice('data:image/svg+xml;base64,'.length);
        try {
            const binary =
                typeof Buffer !== 'undefined'
                    ? Buffer.from(b64, 'base64').toString('utf8')
                    : decodeURIComponent(escape(atob(b64)));
            return sanitizeSvgMarkup(binary);
        } catch {
            return '';
        }
    }
    const payload = trimmed.slice('data:image/svg+xml,'.length);
    try {
        return sanitizeSvgMarkup(decodeURIComponent(payload));
    } catch {
        return '';
    }
}

/**
 * Embeds sanitized SVG markup in deferral HTML (FiveM blocks data: on img; HTTP may be unreachable).
 */
export function renderDeferralInlineSvgMarkup(stored: string, containerStyle: string): string {
    const svg = dataUriToSvgText(stored);
    if (!svg) return '';
    const sized = svg.replace(/<svg\b/i, '<svg style="width:100%;height:100%;display:block"');
    return `<div style="${containerStyle};line-height:0;overflow:hidden">${sized}</div>`;
}

export function isDeferralSvgDataUri(src: string | undefined | null): boolean {
    if (!src || typeof src !== 'string') return false;
    const trimmed = src.trim();
    return trimmed.startsWith('data:image/svg+xml,') || trimmed.startsWith('data:image/svg+xml;base64,');
}

export function deferralCustomImageHasPreview(src: string | undefined | null): boolean {
    if (!src?.trim()) return false;
    return isDeferralHttpImageDataUri(src) || isDeferralSvgDataUri(src);
}

/**
 * Normalizes stored image content to a safe data URI for FiveM deferral cards.
 */
export function normalizeDeferralSvgContent(content: string | undefined | null): string {
    if (!content?.trim()) return '';
    const trimmed = content.trim();
    if (isDeferralSvgDataUri(trimmed)) {
        if (trimmed.startsWith('data:image/svg+xml;base64,')) {
            return trimmed;
        }
        const payload = trimmed.slice('data:image/svg+xml,'.length);
        try {
            const decoded = decodeURIComponent(payload);
            const sanitized = sanitizeSvgMarkup(decoded);
            return sanitized ? svgTextToDataUri(sanitized) : '';
        } catch {
            return '';
        }
    }
    const sanitized = sanitizeSvgMarkup(trimmed);
    return sanitized ? svgTextToDataUri(sanitized) : '';
}

export type ReadDeferralSvgResult = { ok: true; dataUri: string; pngDataUri: string } | { ok: false; error: string };

/**
 * Normalizes custom_image content (PNG for in-game, or SVG while editing).
 */
export function normalizeDeferralImageContent(content: string | undefined | null): string {
    if (!content?.trim()) return '';
    const trimmed = content.trim();
    if (isDeferralPngDataUri(trimmed) || isDeferralGifDataUri(trimmed)) return trimmed;
    return normalizeDeferralSvgContent(trimmed);
}

/**
 * Reads an SVG file from the panel file picker (browser only).
 */
export type ReadDeferralImageResult = { ok: true; content: string } | { ok: false; error: string };

export async function readDeferralPngFile(file: File): Promise<ReadDeferralImageResult> {
    const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
    if (!isPng) {
        return { ok: false, error: 'Only .png files are supported for raster uploads.' };
    }
    if (file.size > DEFERRAL_PNG_MAX_BYTES) {
        return { ok: false, error: `PNG must be under ${Math.round(DEFERRAL_PNG_MAX_BYTES / 1024)} KB.` };
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isPngFileHeader(bytes)) {
        return { ok: false, error: 'Could not read a valid PNG from that file.' };
    }
    return { ok: true, content: `data:image/png;base64,${bytesToBase64(bytes)}` };
}

export async function readDeferralGifFile(file: File): Promise<ReadDeferralImageResult> {
    const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
    if (!isGif) {
        return { ok: false, error: 'Only .gif files are supported for animated uploads.' };
    }
    if (file.size > DEFERRAL_GIF_MAX_BYTES) {
        return { ok: false, error: `GIF must be under ${Math.round(DEFERRAL_GIF_MAX_BYTES / 1024)} KB.` };
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isGifFileHeader(bytes)) {
        return { ok: false, error: 'Could not read a valid GIF from that file.' };
    }
    const normalized = normalizeGifFrameDelays(bytes);
    return { ok: true, content: `data:image/gif;base64,${bytesToBase64(normalized)}` };
}

/**
 * Some exporters store per-frame delays far too high (animation looks frozen/sluggish in CEF).
 * Clamp each Graphic Control Extension delay to a sane maximum (hundredths of a second).
 */
function normalizeGifFrameDelays(bytes: Uint8Array): Uint8Array {
    const maxDelayCs = 20; // 200ms per frame cap
    const minDelayCs = 2; // 20ms floor when delay was 0
    const out = new Uint8Array(bytes);
    const gce = 0x21;
    const extIntroducer = 0xf9;

    for (let i = 0; i < out.length - 7; i++) {
        if (out[i] !== gce || out[i + 1] !== extIntroducer || out[i + 2] !== 4) continue;
        const delayLo = i + 4;
        const delayHi = i + 5;
        let delay = out[delayLo]! | (out[delayHi]! << 8);
        if (delay === 0) delay = minDelayCs;
        else if (delay > maxDelayCs) delay = maxDelayCs;
        out[delayLo] = delay & 0xff;
        out[delayHi] = (delay >> 8) & 0xff;
    }
    return out;
}

/**
 * Reads SVG, PNG, or GIF from the panel file picker (browser only).
 * SVG is rasterized to PNG for storage; PNG/GIF are stored as-is for HTTP serving in-game.
 */
export async function readDeferralImageFile(file: File): Promise<ReadDeferralImageResult> {
    const name = file.name.toLowerCase();
    if (file.type === 'image/gif' || name.endsWith('.gif')) return readDeferralGifFile(file);
    if (file.type === 'image/png' || name.endsWith('.png')) return readDeferralPngFile(file);

    const svgResult = await readDeferralSvgFile(file);
    if (!svgResult.ok) return svgResult;
    return { ok: true, content: svgResult.pngDataUri };
}

export async function readDeferralSvgFile(file: File): Promise<ReadDeferralSvgResult> {
    const isSvg = file.type === 'image/svg+xml' || file.type === 'text/xml' || file.name.toLowerCase().endsWith('.svg');
    if (!isSvg) {
        return { ok: false, error: 'Only .svg files are supported.' };
    }
    if (file.size > DEFERRAL_SVG_MAX_BYTES) {
        return { ok: false, error: `SVG must be under ${Math.round(DEFERRAL_SVG_MAX_BYTES / 1024)} KB.` };
    }
    const raw = await file.text();
    const sanitized = sanitizeSvgMarkup(raw);
    if (!sanitized) {
        return { ok: false, error: 'Could not read a valid SVG from that file.' };
    }
    const dataUri = svgTextToDataUri(sanitized);
    const pngDataUri = await svgTextToPngDataUriBrowser(sanitized);
    if (!pngDataUri) {
        return { ok: false, error: 'Could not rasterize SVG for FiveM (try a simpler file).' };
    }
    return { ok: true, dataUri, pngDataUri };
}
