import type { ITerminalInitOnlyOptions, ITerminalOptions, ITheme } from '@xterm/xterm';

/**
 * Resolve an HSL CSS custom property to a hex string.
 * Expects the variable value in the format "H S% L%" (space-separated, no commas).
 */
function hslVarToHex(varName: string, fallback: string): string {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    if (!raw) return fallback;
    const parts = raw.split(/\s+/);
    if (parts.length < 3) return fallback;
    const h = parseFloat(parts[0]);
    const s = parseFloat(parts[1]) / 100;
    const l = parseFloat(parts[2]) / 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color)
            .toString(16)
            .padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

//From legacy systemLog.ejs, based on the ANSI-UP colors
function buildTheme(): ITheme {
    const isDark = document.documentElement.classList.contains('dark');
    return {
        background: hslVarToHex('--card', isDark ? '#1C202E' : '#F0EFF3'),
        foreground: hslVarToHex('--card-foreground', isDark ? '#F8F8F8' : '#16192A'),
        cursor: hslVarToHex('--card-foreground', isDark ? '#F8F8F8' : '#16192A'),
        cursorAccent: hslVarToHex('--card', isDark ? '#1C202E' : '#F0EFF3'),
        selectionBackground: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
        selectionForeground: undefined,
        black: isDark ? '#000000' : '#1E1E1E',
        brightBlack: isDark ? '#555555' : '#6E6E6E',
        red: isDark ? '#D62341' : '#C72030',
        brightRed: isDark ? '#FF5370' : '#E04058',
        green: isDark ? '#9ECE58' : '#2E8B3E',
        brightGreen: isDark ? '#C3E88D' : '#45A054',
        yellow: isDark ? '#FAED70' : '#7A6200',
        brightYellow: isDark ? '#FFCB6B' : '#8A7000',
        blue: isDark ? '#396FE2' : '#1E47A8',
        brightBlue: isDark ? '#82AAFF' : '#3562C0',
        magenta: isDark ? '#BB80B3' : '#8A3090',
        brightMagenta: isDark ? '#C792EA' : '#A04DA8',
        cyan: isDark ? '#2DDAFD' : '#0E7080',
        brightCyan: isDark ? '#89DDFF' : '#1A8C9E',
        white: isDark ? '#D0D0D0' : '#2E2E2E',
        brightWhite: isDark ? '#FFFFFF' : '#111111',
    };
}

const terminalOptions: ITerminalOptions | ITerminalInitOnlyOptions = {
    theme: buildTheme(),
    convertEol: true,
    cursorBlink: true,
    cursorStyle: 'bar',
    disableStdin: true,
    drawBoldTextInBrightColors: false,
    fontFamily: 'JetBrains Mono Variable, monospace',
    fontSize: 14,
    lineHeight: 1.1,
    fontWeight: document.documentElement.classList.contains('dark') ? '300' : '400',
    fontWeightBold: '600',
    letterSpacing: 0.8,
    scrollback: 5000,
    // scrollback: 2500, //more or less equivalent to the legacy 250kb limit
    allowProposedApi: true,
    allowTransparency: true,
    overviewRuler: {
        width: 15,
    },
};

export default terminalOptions;
export { buildTheme };
