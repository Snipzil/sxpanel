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
    /** Secondary accent, used by MUI's `secondary` palette slot. */
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

// Derived from the web dashboard's dark theme HSL tokens (panel/src/globals.css)
// so the in-game menu reads as part of the same visual family.
const dashboardTokens: MenuTokens = {
    surface: '#0e0e10',
    surfaceRaised: '#161618',
    surfaceHover: '#252528',
    border: 'rgba(161, 161, 170, 0.14)',
    borderStrong: 'rgba(161, 161, 170, 0.28)',
    accent: '#3b82f6',
    accentContrast: '#ffffff',
    accentTint: 'rgba(59, 130, 246, 0.14)',
    accentBorder: 'rgba(59, 130, 246, 0.45)',
    accentSecondary: '#3b82f6',
    textPrimary: '#fafafa',
    textMuted: '#a1a1aa',
    success: '#01a26f',
    warning: '#ffae00',
    error: '#e33131',
    info: '#26b2d9',
    radiusCard: 12,
    radiusRow: 8,
    radiusPill: 999,
};

// Both game variants intentionally share the same palette now — the goal is
// visual consistency with the web dashboard rather than a per-game identity.
export const fivemTokens: MenuTokens = dashboardTokens;
export const redmTokens: MenuTokens = dashboardTokens;

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
            fontFamily: "'Geist Variable', 'Inter', 'Segoe UI', sans-serif",
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

export const menuTheme = buildMenuTheme(fivemTokens, { name: 'fivem', logo: 'images/sxPanel.png' });
export const menuRedmTheme = buildMenuTheme(redmTokens, { name: 'redm', logo: 'images/sxPanel.png' });
