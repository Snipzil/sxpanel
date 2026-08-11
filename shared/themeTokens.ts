/**
 * Canonical list of CSS custom properties a custom theme can override.
 * Keep in sync with the `:root, .dark` block in `panel/src/globals.css` —
 * this file has no build-time link to that stylesheet, it's just where the
 * values were copied from.
 */

export const THEME_COLOR_TOKEN_GROUPS = [
    {
        id: 'base',
        keys: ['background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground'],
    },
    {
        id: 'controls',
        keys: [
            'primary',
            'primary-foreground',
            'secondary',
            'secondary-foreground',
            'muted',
            'muted-foreground',
            'accent',
            'accent-foreground',
            'border',
            'input',
            'ring',
        ],
    },
    {
        id: 'destructive',
        keys: ['destructive', 'destructive-foreground', 'destructive-hint', 'destructive-inline'],
    },
    {
        id: 'warning',
        keys: ['warning', 'warning-foreground', 'warning-hint', 'warning-inline'],
    },
    {
        id: 'success',
        keys: ['success', 'success-foreground', 'success-hint', 'success-inline'],
    },
    {
        id: 'info',
        keys: ['info', 'info-foreground', 'info-hint', 'info-inline'],
    },
] as const;

export type ThemeColorTokenGroupId = (typeof THEME_COLOR_TOKEN_GROUPS)[number]['id'];

export const THEME_COLOR_TOKEN_KEYS = THEME_COLOR_TOKEN_GROUPS.flatMap((group) => group.keys);

export type ThemeColorTokenKey = (typeof THEME_COLOR_TOKEN_KEYS)[number];

export type ThemeColorTokenStyle = Record<ThemeColorTokenKey, string>;

//An "H S% L%" triple, eg "217 91% 60%" - matches how these vars are consumed via hsl(var(--x))
export const HSL_TRIPLE_REGEX = /^\d{1,3}(?:\.\d+)? \d{1,3}(?:\.\d+)?% \d{1,3}(?:\.\d+)?%$/;

export const DEFAULT_DARK_THEME_TOKENS: ThemeColorTokenStyle = {
    background: '240 6% 6%',
    foreground: '0 0% 98%',
    card: '240 5% 9%',
    'card-foreground': '0 0% 98%',
    popover: '240 5% 10%',
    'popover-foreground': '0 0% 98%',
    primary: '0 0% 98%',
    'primary-foreground': '240 6% 6%',
    secondary: '240 4% 15%',
    'secondary-foreground': '0 0% 98%',
    muted: '240 4% 13%',
    'muted-foreground': '240 5% 65%',
    accent: '217 91% 60%',
    'accent-foreground': '0 0% 100%',
    border: '240 4% 16%',
    input: '240 4% 18%',
    ring: '217 91% 60%',
    destructive: '0 76% 54%',
    'destructive-foreground': '0 0% 100%',
    'destructive-hint': '0 50% 15%',
    'destructive-inline': '0 76% 54%',
    warning: '41 100% 50%',
    'warning-foreground': '41 100% 8%',
    'warning-hint': '35 60% 14%',
    'warning-inline': '41 100% 50%',
    success: '161 99% 32%',
    'success-foreground': '161 80% 95%',
    'success-hint': '161 70% 12%',
    'success-inline': '161 99% 32%',
    info: '193 70% 50%',
    'info-foreground': '193 60% 95%',
    'info-hint': '200 50% 14%',
    'info-inline': '193 70% 50%',
};

//sxPanel ships no real light-mode stylesheet yet (see docs/theme.md) - this is
//just a reasonable starting point for admins building a light custom theme.
export const DEFAULT_LIGHT_THEME_TOKENS: ThemeColorTokenStyle = {
    background: '0 0% 100%',
    foreground: '240 6% 10%',
    card: '0 0% 100%',
    'card-foreground': '240 6% 10%',
    popover: '0 0% 100%',
    'popover-foreground': '240 6% 10%',
    primary: '240 6% 10%',
    'primary-foreground': '0 0% 98%',
    secondary: '240 5% 94%',
    'secondary-foreground': '240 6% 10%',
    muted: '240 5% 94%',
    'muted-foreground': '240 4% 40%',
    accent: '217 91% 55%',
    'accent-foreground': '0 0% 100%',
    border: '240 6% 88%',
    input: '240 6% 85%',
    ring: '217 91% 55%',
    destructive: '0 76% 48%',
    'destructive-foreground': '0 0% 100%',
    'destructive-hint': '0 70% 94%',
    'destructive-inline': '0 76% 42%',
    warning: '41 96% 45%',
    'warning-foreground': '41 100% 10%',
    'warning-hint': '41 90% 92%',
    'warning-inline': '32 90% 38%',
    success: '161 90% 30%',
    'success-foreground': '161 80% 97%',
    'success-hint': '161 70% 92%',
    'success-inline': '161 90% 26%',
    info: '193 75% 42%',
    'info-foreground': '193 60% 97%',
    'info-hint': '193 70% 92%',
    'info-inline': '193 75% 36%',
};
