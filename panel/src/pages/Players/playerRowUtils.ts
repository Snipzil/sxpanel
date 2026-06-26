import { PlayerTag, TagDefinition, AUTO_TAG_DEFINITIONS } from '@shared/socketioTypes';

const FALLBACK_TAG_LOOKUP: Record<string, { label: string; color: string; priority: number }> = {
    staff: { label: 'Staff', color: '#EF4444', priority: 1 },
    problematic: { label: 'Problematic', color: '#FB923C', priority: 2 },
    newplayer: { label: 'Newcomer', color: '#A3E635', priority: 3 },
};

export const buildTagLookup = (defs: TagDefinition[]) => {
    const lookup: Record<string, { label: string; color: string; priority: number }> = { ...FALLBACK_TAG_LOOKUP };
    for (const d of defs) {
        if (d.enabled === false) {
            delete lookup[d.id];
        } else {
            lookup[d.id] = { label: d.label, color: d.color, priority: d.priority };
        }
    }
    return lookup;
};

export const getTopTag = (
    tags: PlayerTag[],
    lookup: Record<string, { label: string; color: string; priority: number }>,
) => {
    if (!tags.length) return null;
    return tags.reduce((top, tag) => {
        const topPriority = lookup[top]?.priority ?? 999;
        const tagPriority = lookup[tag]?.priority ?? 999;
        return tagPriority < topPriority ? tag : top;
    });
};

export const deriveTagStyles = (hex: string) => {
    const sanitized = hex.startsWith('#') ? hex.slice(1) : hex;
    const normalized =
        sanitized.length === 3
            ? sanitized
                  .split('')
                  .map((char) => `${char}${char}`)
                  .join('')
            : sanitized;
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);

    return {
        backgroundColor: `rgba(${r}, ${g}, ${b}, 0.14)`,
        borderColor: `rgba(${r}, ${g}, ${b}, 0.32)`,
        accentColor: hex,
    };
};

export const DEFAULT_TAG_LOOKUP = () => buildTagLookup(AUTO_TAG_DEFINITIONS);

/**
 * Short monospace-friendly hint for the primary license id.
 */
export const formatLicenseHint = (license: string) => {
    const t = license.trim();
    if (t.length <= 28) return t;
    return `${t.slice(0, 14)}…${t.slice(-10)}`;
};

export const formatRelativeLastSeen = (ts: number) => {
    const now = Date.now();
    const ms = ts < 10_000_000_000 ? ts * 1000 : ts;
    const diffSec = Math.round((ms - now) / 1000);
    const rtf = new Intl.RelativeTimeFormat(window.txBrowserLocale, { numeric: 'auto' });
    const abs = Math.abs(diffSec);
    if (abs < 45) return rtf.format(0, 'second');
    if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
    if (abs < 86_400) return rtf.format(Math.round(diffSec / 3600), 'hour');
    if (abs < 604_800) return rtf.format(Math.round(diffSec / 86_400), 'day');
    if (abs < 2_629_800) return rtf.format(Math.round(diffSec / 604_800), 'week');
    return rtf.format(Math.round(diffSec / 2_629_800), 'month');
};
