/**
 * Runtime detection helpers for FiveM CEF / NUI panel embedding.
 *
 * Use these instead of scattering `!window.txConsts.isWebInterface` checks when
 * the intent is specifically “running inside the in-game menu iframe”.
 */

/**
 * True when the panel is served through FiveM NUI (not the external browser).
 * Includes standalone NUI pages and the menu iframe embed.
 */
export const isFiveMNuiPanel = (): boolean => {
    return typeof window !== 'undefined' && window.txConsts?.isWebInterface === false;
};

/**
 * True when the panel SPA runs inside the in-game menu iframe (Panel tab).
 * Subset of {@link isFiveMNuiPanel} — excludes full-screen NUI-only flows.
 */
export const isCefPanelEmbed = (): boolean => {
    return isFiveMNuiPanel() && typeof window !== 'undefined' && window.parent !== window;
};

/** Alias kept for readability in CEF-specific code paths. */
export const isCefPanelRuntime = isFiveMNuiPanel;
