// =============================================
// Menu design system — single source of truth
//
// Semantic tokens (per game) + a shared theme builder. Components should
// consume colors via the MUI theme (`theme.tokens.*` / `theme.palette.*`)
// instead of importing hex values directly.
// =============================================
import { createTheme, type Theme } from '@mui/material/styles';

export interface MenuTokens {
    /** Deepest background — the menu card and pill tab bar. */
    readonly surface: string;
    /** Raised panels — list rows, inner cards, tooltips. */
    readonly surfaceRaised: string;
    /** Hover state for raised panels. */
    readonly surfaceHover: string;
    /** Hairline border for cards and rows. */
    readonly border: string;
    /** Emphasized border (focused/hovered outlines). */
    readonly borderStrong: string;
    /** Brand accent — active pill, selected rows. */
    readonly accent: string;
    /** Text/icon color rendered on top of the accent. */
    readonly accentContrast: string;
    /** Faint accent wash for selected-row backgrounds. */
    readonly accentTint: string;
    /** Accent-colored border for selected rows. */
    readonly accentBorder: string;
    /** Secondary accent (kept for RedM purple highlights). */
    readonly accentSecondary: string;
    readonly textPrimary: string;
    readonly textMuted: string;
    readonly success: string;
    readonly warning: string;
    readonly error: string;
    readonly info: string;
    /** Outer card radius. */
    readonly radiusCard: number;
    /** List-row / inner panel radius. */
    readonly radiusRow: number;
    /** Fully-rounded pill radius. */
    readonly radiusPill: number;
}

export const fivemTokens: MenuTokens = {
    surface: '#0c0e16',
    surfaceRaised: '#161923',
    surfaceHover: '#1c202e',
    border: 'rgba(124, 134, 171, 0.18)',
    borderStrong: 'rgba(124, 134, 171, 0.34)',
    accent: '#f40552',
    accentContrast: '#ffffff',
    accentTint: 'rgba(244, 5, 82, 0.12)',
    accentBorder: 'rgba(244, 5, 82, 0.45)',
    accentSecondary: '#f40552',
    textPrimary: '#f1f1e4',
    textMuted: '#9ea4bd',
    success: '#01a370',
    warning: '#ffae00',
    error: '#e33131',
    info: '#2b9bc5',
    radiusCard: 16,
    radiusRow: 10,
    radiusPill: 999,
};

export const redmTokens: MenuTokens = {
    surface: '#241f19',
    surfaceRaised: '#332e27',
    surfaceHover: '#4b3b2e',
    border: 'rgba(230, 213, 201, 0.16)',
    borderStrong: 'rgba(230, 213, 201, 0.32)',
    accent: '#f4df88',
    accentContrast: '#241900',
    accentTint: 'rgba(244, 223, 136, 0.12)',
    accentBorder: 'rgba(244, 223, 136, 0.5)',
    accentSecondary: '#c68ed9',
    textPrimary: '#e8e1dc',
    textMuted: '#e6d5c9',
    success: '#57d58d',
    warning: '#f5b041',
    error: '#d52c1a',
    info: '#5bace1',
    radiusCard: 16,
    radiusRow: 10,
    radiusPill: 999,
};

interface MenuThemeMeta {
    readonly name: string;
    readonly logo: string;
}

/**
 * Builds the MUI theme for a game variant from its semantic tokens, with all
 * shared component overrides centralized here.
 */
const buildMenuTheme = (tokens: MenuTokens, meta: MenuThemeMeta): Theme => {
    return createTheme({
        name: meta.name,
        logo: meta.logo,
        tokens,
        typography: {
            fontFamily: "'Inter Variable', 'Inter', 'Segoe UI', sans-serif",
            button: {
                textTransform: 'none',
                fontWeight: 600,
            },
        },
        shape: {
            borderRadius: tokens.radiusRow,
        },
        palette: {
            mode: 'dark',
            primary: {
                main: tokens.accent,
                contrastText: tokens.accentContrast,
            },
            secondary: {
                main: tokens.accentSecondary,
            },
            success: {
                main: tokens.success,
            },
            warning: {
                main: tokens.warning,
            },
            error: {
                main: tokens.error,
            },
            info: {
                main: tokens.info,
            },
            background: {
                default: tokens.surface,
                paper: tokens.surfaceRaised,
            },
            action: {
                selected: tokens.accentTint,
            },
            text: {
                primary: tokens.textPrimary,
                secondary: tokens.textMuted,
            },
            divider: tokens.border,
        },
        components: {
            MuiPaper: {
                styleOverrides: {
                    root: {
                        backgroundImage: 'unset',
                    },
                },
            },
            MuiListItem: {
                styleOverrides: {
                    root: {
                        borderRadius: tokens.radiusRow,
                        border: `1px solid ${tokens.border}`,
                        backgroundColor: tokens.surfaceRaised,
                        '&.Mui-selected': {
                            backgroundColor: tokens.accentTint,
                            border: `1px solid ${tokens.accentBorder}`,
                        },
                    },
                },
            },
            MuiListItemButton: {
                styleOverrides: {
                    root: {
                        borderRadius: tokens.radiusRow,
                        border: `1px solid ${tokens.border}`,
                        backgroundColor: tokens.surfaceRaised,
                        minHeight: 32,
                        paddingTop: 4,
                        paddingBottom: 4,
                        paddingLeft: 8,
                        paddingRight: 28,
                        transition: 'background-color 120ms ease, border-color 120ms ease',
                        '&:hover': {
                            backgroundColor: tokens.surfaceHover,
                        },
                        '&.Mui-selected, &.Mui-selected:hover': {
                            backgroundColor: tokens.accentTint,
                            border: `1px solid ${tokens.accentBorder}`,
                        },
                    },
                    dense: {
                        paddingTop: 4,
                        paddingBottom: 4,
                    },
                },
            },
            MuiListItemIcon: {
                styleOverrides: {
                    root: {
                        minWidth: 28,
                        '& svg': {
                            fontSize: 17,
                        },
                    },
                },
            },
            MuiListItemSecondaryAction: {
                styleOverrides: {
                    root: {
                        right: 6,
                        '& svg': {
                            fontSize: 15,
                        },
                    },
                },
            },
            MuiButton: {
                styleOverrides: {
                    root: {
                        borderRadius: 8,
                    },
                },
            },
            MuiChip: {
                styleOverrides: {
                    root: {
                        borderRadius: 6,
                        fontWeight: 500,
                    },
                },
            },
            MuiDialog: {
                styleOverrides: {
                    paper: {
                        backgroundColor: tokens.surface,
                        backgroundImage: 'unset',
                        border: `1px solid ${tokens.border}`,
                        borderRadius: tokens.radiusCard,
                    },
                },
            },
            MuiTooltip: {
                styleOverrides: {
                    tooltip: {
                        backgroundColor: tokens.surfaceRaised,
                        border: `1px solid ${tokens.border}`,
                        color: tokens.textPrimary,
                        fontSize: 12,
                    },
                },
            },
            MuiOutlinedInput: {
                styleOverrides: {
                    notchedOutline: {
                        borderColor: tokens.border,
                    },
                },
            },
        },
    });
};

/** Inner content width for the main menu card and pill bar. */
export const MENU_MAIN_CONTENT_WIDTH = 288;

/**
 * Shared outer width for the pill tab bar and main menu card.
 * Content width + horizontal padding (`px={1.5}` → 12px × 2) + 1px border × 2.
 */
export const MENU_MAIN_COLUMN_WIDTH = MENU_MAIN_CONTENT_WIDTH + 26;

export const menuTheme = buildMenuTheme(fivemTokens, { name: 'fivem', logo: 'images/txadmin.png' });
export const menuRedmTheme = buildMenuTheme(redmTokens, { name: 'redm', logo: 'images/txadmin-redm.png' });
