import { describe, it, expect } from 'vitest';
import {
    gifDataUriToBuffer,
    isDeferralGifDataUri,
    pngDataUriToBuffer,
    isDeferralHttpImageDataUri,
    normalizeDeferralImageContent,
    normalizeDeferralSvgContent,
    sanitizeSvgMarkup,
    svgTextToDataUri,
    renderDeferralInlineSvgMarkup,
} from './deferralCardSvg';

const TINY_GIF_B64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const TINY_GIF_URI = `data:image/gif;base64,${TINY_GIF_B64}`;
const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const TINY_PNG_URI = `data:image/png;base64,${TINY_PNG_B64}`;

describe('deferralCardSvg', () => {
    it('strips script tags from svg', () => {
        const raw =
            '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="10" height="10"/></svg>';
        const out = sanitizeSvgMarkup(raw);
        expect(out).not.toContain('script');
        expect(out).toContain('<rect');
    });

    it('builds a data uri', () => {
        const uri = svgTextToDataUri('<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>');
        expect(uri.startsWith('data:image/svg+xml,')).toBe(true);
    });

    it('normalizes inline svg markup to data uri', () => {
        const uri = normalizeDeferralSvgContent('<svg xmlns="http://www.w3.org/2000/svg"><text>hi</text></svg>');
        expect(uri.startsWith('data:image/svg+xml,')).toBe(true);
    });

    it('embeds inline svg for deferral HTML', () => {
        const uri = svgTextToDataUri('<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>');
        const html = renderDeferralInlineSvgMarkup(uri, 'width:48px;height:48px');
        expect(html).toContain('<circle');
        expect(html).not.toContain('data:image');
    });

    it('recognizes and decodes png data uris', () => {
        expect(isDeferralHttpImageDataUri(TINY_PNG_URI)).toBe(true);
        expect(normalizeDeferralImageContent(TINY_PNG_URI)).toBe(TINY_PNG_URI);
        const buf = pngDataUriToBuffer(TINY_PNG_URI);
        expect(buf?.length).toBeGreaterThan(0);
        expect(buf?.subarray(0, 4).toString('hex')).toBe('89504e47');
    });

    it('recognizes and decodes gif data uris', () => {
        expect(isDeferralGifDataUri(TINY_GIF_URI)).toBe(true);
        expect(isDeferralHttpImageDataUri(TINY_GIF_URI)).toBe(true);
        expect(normalizeDeferralImageContent(TINY_GIF_URI)).toBe(TINY_GIF_URI);
        const buf = gifDataUriToBuffer(TINY_GIF_URI);
        expect(buf?.length).toBeGreaterThan(0);
        expect(buf?.subarray(0, 6).toString()).toBe('GIF89a');
    });
});
