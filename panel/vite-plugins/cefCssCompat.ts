import type { PluginOption } from 'vite';

/**
 * FiveM NUI uses CEF ~Chrome 103, which lacks `color-mix()` (Chrome 111+).
 * Tailwind v4 emits a full-opacity hsl() fallback plus a color-mix rule inside
 * `@supports`; CEF applies only the fallback — e.g. `bg-accent/10` renders as
 * solid accent pink and icons disappear on matching text/background colors.
 *
 * This module is the **build-time** half of the panel CEF compat layer.
 * @see panel/src/cef-compat/index.ts
 */

const HSL_VAR_COLOR_MIX_RE = /color-mix\(in oklab,\s*hsl\(var\((--[a-z0-9-]+)\)\)\s+(\d+(?:\.\d+)?)%,\s*transparent\)/g;

const PALETTE_VAR_COLOR_MIX_RE =
    /color-mix\(in oklab,\s*var\(--(color-[a-z0-9-]+)\)\s+(\d+(?:\.\d+)?)%,\s*transparent\)/g;

const CURRENTCOLOR_COLOR_MIX_RE = /color-mix\(in oklab,\s*currentcolor\s+(\d+(?:\.\d+)?)%,\s*transparent\)/gi;

const PALETTE_VAR_DEF_RE = /--(color-[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})/g;

const expandHex = (hex: string): string => {
    const h = hex.slice(1);
    if (h.length !== 3) return h;
    return h
        .split('')
        .map((c) => c + c)
        .join('');
};

const hexToRgba = (hex: string, alpha: number): string => {
    const full = expandHex(hex);
    const n = Number.parseInt(full, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r},${g},${b},${alpha})`;
};

const parsePaletteColorVars = (css: string): Map<string, string> => {
    const map = new Map<string, string>();
    for (const match of css.matchAll(PALETTE_VAR_DEF_RE)) {
        map.set(match[1], match[2]);
    }
    return map;
};

const transformHslVarColorMix = (css: string): string => {
    return css.replace(HSL_VAR_COLOR_MIX_RE, 'hsl(var($1) / calc($2 / 100))');
};

const transformPaletteVarColorMix = (css: string, paletteColors: Map<string, string>): string => {
    return css.replace(PALETTE_VAR_COLOR_MIX_RE, (_match, varName: string, pct: string) => {
        const hex = paletteColors.get(varName);
        if (!hex) return `var(--${varName})`;
        return hexToRgba(hex, Number(pct) / 100);
    });
};

const transformCurrentColorMix = (css: string): string => {
    // Placeholder / inherit-opacity cases — approximate with theme muted foreground.
    return css.replace(CURRENTCOLOR_COLOR_MIX_RE, 'hsl(var(--muted-foreground) / calc($1 / 100))');
};

const hoistColorMixSupportsBlocks = (css: string): string => {
    const marker = '@supports (color:color-mix(in lab, red, red)){';
    let result = '';
    let cursor = 0;

    while (cursor < css.length) {
        const start = css.indexOf(marker, cursor);
        if (start === -1) {
            result += css.slice(cursor);
            break;
        }

        result += css.slice(cursor, start);

        let depth = 1;
        let index = start + marker.length;
        const contentStart = index;

        while (index < css.length && depth > 0) {
            const char = css[index];
            if (char === '{') depth += 1;
            else if (char === '}') depth -= 1;
            index += 1;
        }

        if (depth !== 0) {
            result += css.slice(start);
            break;
        }

        result += css.slice(contentStart, index - 1);
        cursor = index;
    }

    return result;
};

/** Tailwind emits a full-opacity fallback rule before the @supports color-mix rule. */
const RULE_RE = /\.[^{}]+\{[^}]+\}/g;

const parseOpacityRule = (
    rule: string,
): { selector: string; property: string; token: string; hasCalcOpacity: boolean } | null => {
    const match = rule.match(/^(\.[^{]+)\{([a-z-]+):hsl\(var\((--[a-z0-9-]+)\)(?:\s*\/\s*calc\([^)]+\))?\)\}$/);
    if (!match) return null;
    return {
        selector: match[1],
        property: match[2],
        token: match[3],
        hasCalcOpacity: rule.includes('/ calc('),
    };
};

/**
 * Drops duplicate fallback-only opacity rules when an equivalent CEF-safe calc rule
 * exists for the same selector — avoids relying on source order in minified CSS.
 * Skips grouped selectors (comma-separated) so `.border-success,.border-success\/30`
 * keeps working for the non-opacity variant.
 */
export const dedupeFallbackOpacityRules = (css: string): string => {
    const rules = css.match(RULE_RE) ?? [];
    const safeKeys = new Set<string>();

    for (const rule of rules) {
        const parsed = parseOpacityRule(rule);
        if (parsed?.hasCalcOpacity && !parsed.selector.includes(',')) {
            safeKeys.add(`${parsed.selector}|${parsed.property}|${parsed.token}`);
        }
    }

    if (safeKeys.size === 0) return css;

    return css.replace(RULE_RE, (rule) => {
        const parsed = parseOpacityRule(rule);
        if (!parsed || parsed.hasCalcOpacity || parsed.selector.includes(',')) return rule;
        const key = `${parsed.selector}|${parsed.property}|${parsed.token}`;
        return safeKeys.has(key) ? '' : rule;
    });
};

/**
 * Rewrites Tailwind v4 CSS so opacity utilities work in FiveM CEF (~Chrome 103).
 */
export const transformCssForCef = (css: string): string => {
    const paletteColors = parsePaletteColorVars(css);
    let out = hoistColorMixSupportsBlocks(css);
    out = transformHslVarColorMix(out);
    out = transformPaletteVarColorMix(out, paletteColors);
    out = transformCurrentColorMix(out);
    return out;
};

/**
 * Post-processes emitted panel CSS — part of the panel CEF compatibility layer.
 */
export function cefCssCompat(): PluginOption {
    return {
        name: 'cef-css-compat',
        apply: 'build',
        generateBundle(_options, bundle) {
            for (const chunk of Object.values(bundle)) {
                if (chunk.type !== 'asset' || !chunk.fileName.endsWith('.css')) continue;
                const source = typeof chunk.source === 'string' ? chunk.source : chunk.source.toString();
                chunk.source = transformCssForCef(source);
            }
        },
    };
}
