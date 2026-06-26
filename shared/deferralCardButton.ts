import { z } from 'zod';

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/;
const RGB_COLOR_RE = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/;

export const DeferralButtonContentSchema = z.object({
    label: z.string().min(1).max(64).default('Open link'),
    url: z.string().min(1).max(2048).default('{discordInvite}'),
    backgroundColor: z.string().default('#5865F2'),
    textColor: z.string().default('#ffffff'),
});
export type DeferralButtonContent = z.infer<typeof DeferralButtonContentSchema>;

export const DEFAULT_DEFERRAL_BUTTON_CONTENT: DeferralButtonContent = {
    label: 'Join Discord',
    url: '{discordInvite}',
    backgroundColor: '#5865F2',
    textColor: '#ffffff',
};

export function parseDeferralButtonContent(raw: string | undefined | null): DeferralButtonContent {
    if (!raw?.trim()) return { ...DEFAULT_DEFERRAL_BUTTON_CONTENT };
    try {
        const parsed = DeferralButtonContentSchema.safeParse(JSON.parse(raw));
        if (parsed.success) return parsed.data;
    } catch {
        /* legacy / hand-edited */
    }
    return { ...DEFAULT_DEFERRAL_BUTTON_CONTENT };
}

export function serializeDeferralButtonContent(
    data: DeferralButtonContent,
    options?: { sanitizeColors?: boolean },
): string {
    const sanitizeColors = options?.sanitizeColors !== false;
    const bgRaw = data.backgroundColor?.trim() || DEFAULT_DEFERRAL_BUTTON_CONTENT.backgroundColor;
    const textRaw = data.textColor?.trim() || DEFAULT_DEFERRAL_BUTTON_CONTENT.textColor;
    return JSON.stringify({
        label: data.label.trim() || DEFAULT_DEFERRAL_BUTTON_CONTENT.label,
        url: data.url.trim() || DEFAULT_DEFERRAL_BUTTON_CONTENT.url,
        backgroundColor: sanitizeColors
            ? sanitizeDeferralButtonColor(bgRaw, DEFAULT_DEFERRAL_BUTTON_CONTENT.backgroundColor)
            : bgRaw,
        textColor: sanitizeColors
            ? sanitizeDeferralButtonColor(textRaw, DEFAULT_DEFERRAL_BUTTON_CONTENT.textColor)
            : textRaw,
    });
}

/** Sanitizes button JSON before persisting to server config. */
export function finalizeDeferralButtonContent(raw: string | undefined | null): string {
    return serializeDeferralButtonContent(parseDeferralButtonContent(raw), { sanitizeColors: true });
}

/** Safe CSS color for inline deferral button styles. */
export function sanitizeDeferralButtonColor(value: string | undefined, fallback: string): string {
    const trimmed = value?.trim() ?? '';
    if (HEX_COLOR_RE.test(trimmed)) return trimmed;
    const rgb = RGB_COLOR_RE.exec(trimmed);
    if (rgb) {
        const clamp = (n: string) => Math.min(255, Math.max(0, Number.parseInt(n, 10)));
        const r = clamp(rgb[1]!);
        const g = clamp(rgb[2]!);
        const b = clamp(rgb[3]!);
        if (rgb[0]!.startsWith('rgba')) {
            const a = Math.min(1, Math.max(0, Number.parseFloat(rgb[4] ?? '1')));
            return `rgba(${r},${g},${b},${a})`;
        }
        return `rgb(${r},${g},${b})`;
    }
    return fallback;
}

/** Normalizes #rgb to #rrggbb for &lt;input type="color"&gt;. */
export function normalizeDeferralButtonColorForPicker(value: string | undefined, fallback: string): string {
    const pick = (candidate: string) => {
        const safe = sanitizeDeferralButtonColor(candidate, fallback);
        if (/^#[0-9A-Fa-f]{3}$/.test(safe)) {
            return `#${safe[1]}${safe[1]}${safe[2]}${safe[2]}${safe[3]}${safe[3]}`.toLowerCase();
        }
        if (/^#[0-9A-Fa-f]{6}$/.test(safe)) return safe.toLowerCase();
        return null;
    };
    return pick(value ?? '') ?? pick(fallback) ?? '#5865f2';
}

/** Only http(s) links — used for in-game deferral buttons (opens in the player's browser). */
export function sanitizeDeferralButtonUrl(url: string): string {
    const trimmed = url.trim();
    if (!trimmed) return '';
    const tryParse = (value: string) => {
        try {
            const u = new URL(value);
            if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
            return u.href;
        } catch {
            return '';
        }
    };
    return tryParse(trimmed) || tryParse(`https://${trimmed.replace(/^\/+/, '')}`);
}

export function escapeDeferralButtonLabel(label: string): string {
    return label.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

const DEFERRAL_BUTTON_BASE_STYLE = [
    'display:inline-block',
    'box-sizing:border-box',
    'max-width:100%',
    'padding:10px 18px',
    'text-decoration:none',
    'border-radius:8px',
    'font-weight:700',
    'font-size:16px',
    'line-height:1.25',
    'text-align:center',
    'white-space:nowrap',
    'cursor:pointer',
] as const;

/** @deprecated Use buildDeferralButtonAnchorStyle — kept for studio style parsing fallback. */
export const DEFERRAL_BUTTON_ANCHOR_STYLE = buildDeferralButtonAnchorStyle(DEFAULT_DEFERRAL_BUTTON_CONTENT);

export function buildDeferralButtonAnchorStyle(
    colors: Pick<DeferralButtonContent, 'backgroundColor' | 'textColor'> = DEFAULT_DEFERRAL_BUTTON_CONTENT,
): string {
    const bg = sanitizeDeferralButtonColor(colors.backgroundColor, DEFAULT_DEFERRAL_BUTTON_CONTENT.backgroundColor);
    const color = sanitizeDeferralButtonColor(colors.textColor, DEFAULT_DEFERRAL_BUTTON_CONTENT.textColor);
    return [...DEFERRAL_BUTTON_BASE_STYLE, `background:${bg}`, `color:${color}`].join(';');
}

export function renderDeferralButtonAnchorHtml(
    label: string,
    url: string,
    colors: Pick<DeferralButtonContent, 'backgroundColor' | 'textColor'> = DEFAULT_DEFERRAL_BUTTON_CONTENT,
    containerStyle = '',
): string {
    const safeHref = sanitizeDeferralButtonUrl(url);
    if (!safeHref) return '';
    const safeHrefAttr = safeHref.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
    const safeLabel = escapeDeferralButtonLabel(label);
    const anchorStyle = buildDeferralButtonAnchorStyle(colors);
    const style = containerStyle ? `${containerStyle};${anchorStyle}` : anchorStyle;
    return `<a href="${safeHrefAttr}" style="${style}">${safeLabel}</a>`;
}
