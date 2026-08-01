import { HSL_TRIPLE_REGEX } from '@shared/themeTokens';

/**
 * Converts a "H S% L%" triple (eg "217 91% 60%", as stored/consumed via
 * hsl(var(--x))) to a "#rrggbb" hex string for use in <input type="color">.
 */
export function hslTripleToHex(hslTriple: string): string {
    const match = hslTriple.trim().match(/^(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
    if (!match) return '#000000';
    const h = Number(match[1]);
    const s = Number(match[2]) / 100;
    const l = Number(match[3]) / 100;

    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));

    const toHex = (n: number) =>
        Math.round(f(n) * 255)
            .toString(16)
            .padStart(2, '0');

    return `#${toHex(0)}${toHex(8)}${toHex(4)}`;
}

/**
 * Converts a "#rrggbb" (or "#rgb") hex string to a "H S% L%" triple for
 * storage in a custom theme's style record.
 */
export function hexToHslTriple(hex: string): string {
    const normalized = hex.trim().replace(/^#/, '');
    const full =
        normalized.length === 3
            ? normalized
                  .split('')
                  .map((c) => c + c)
                  .join('')
            : normalized;
    const r = parseInt(full.slice(0, 2), 16) / 255;
    const g = parseInt(full.slice(2, 4), 16) / 255;
    const b = parseInt(full.slice(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;

    let h = 0;
    let s = 0;
    const d = max - min;
    if (d !== 0) {
        s = d / (1 - Math.abs(2 * l - 1));
        switch (max) {
            case r:
                h = ((g - b) / d) % 6;
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            default:
                h = (r - g) / d + 4;
        }
        h *= 60;
        if (h < 0) h += 360;
    }

    const round1 = (n: number) => Math.round(n * 10) / 10;
    return `${round1(h)} ${round1(s * 100)}% ${round1(l * 100)}%`;
}

export function isValidHslTriple(value: string): boolean {
    return HSL_TRIPLE_REGEX.test(value.trim());
}
