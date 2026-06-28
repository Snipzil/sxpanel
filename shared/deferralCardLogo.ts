/** HTTP path for the deferral-card watermark (PNG — FiveM cannot render SVG in img tags). */
export const DEFERRAL_CARD_WATERMARK_PATH = '/deferral-card-logo.png';

/** Panel UI still uses the SVG at /logo.svg. */
export const DEFERRAL_CARD_LOGO_PATH = '/logo.svg';

/**
 * Extracts embedded PNG bytes from logo.svg (sxPanel ships SVG wrappers around a raster logo).
 */
export function extractPngBufferFromLogoSvg(svgText: string): Buffer | null {
    if (!svgText?.trim()) return null;
    // logo.svg uses Illustrator-style `data:img/png` (not `data:image/png`)
    const match = svgText.match(/data:(?:image|img)\/png;base64,([A-Za-z0-9+/=]+)/i);
    if (!match?.[1]) return null;
    try {
        return Buffer.from(match[1], 'base64');
    } catch {
        return null;
    }
}
