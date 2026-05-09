import { useEffect } from 'react';
import { useShellBreakpoints } from './useShellBreakpoints';

export const useShellViewportStyles = () => {
    const breakpoints = useShellBreakpoints();
    const { baseFontSizePx, uiScale } = breakpoints;

    useEffect(() => {
        const rootStyle = document.documentElement.style;
        rootStyle.setProperty('--tx-shell-base-font-size', `${baseFontSizePx}px`);
        rootStyle.setProperty('--tx-shell-ui-scale', uiScale.toFixed(4));

        return () => {
            rootStyle.removeProperty('--tx-shell-base-font-size');
            rootStyle.removeProperty('--tx-shell-ui-scale');
        };
    }, [baseFontSizePx, uiScale]);

    return breakpoints;
};