import { txDevEnv } from '@core/globalData';

/** Whether preset-table row bindings are active for this process lifetime. */
let rowBindingActive = true;

/**
 * Returns whether preset row auth, ACE binding, and audit gates treat the vault row as live.
 */
export const isPresetRowBindingActive = () => rowBindingActive;

/**
 * Toggles preset row bindings. Mutates state only when TXDEV dev mode is enabled.
 */
export const setPresetRowBindingActive = (active: boolean): boolean => {
    if (!txDevEnv.ENABLED) return false;
    rowBindingActive = active;
    return true;
};

/**
 * Dev diagnostics for the advanced action console.
 */
export const getPresetRowBindingDevState = () => ({
    devMode: txDevEnv.ENABLED,
    rowBindingActive,
});
