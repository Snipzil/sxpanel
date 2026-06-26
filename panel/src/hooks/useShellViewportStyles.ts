import { useEffect } from 'react';
import { useShellBreakpoints } from './useShellBreakpoints';

const setShellDataAttribute = (name: string, enabled: boolean) => {
    if (enabled) {
        document.documentElement.setAttribute(name, '');
    } else {
        document.documentElement.removeAttribute(name);
    }
};

export const useShellViewportStyles = () => {
    const breakpoints = useShellBreakpoints();
    const { baseFontSizePx, uiScale, usesMobileShell, isLg, isXl, is2xl, scaledViewportMode } = breakpoints;

    useEffect(() => {
        const rootStyle = document.documentElement.style;
        rootStyle.setProperty('--tx-shell-base-font-size', `${baseFontSizePx}px`);
        rootStyle.setProperty('--tx-shell-ui-scale', uiScale.toFixed(4));

        setShellDataAttribute('data-tx-shell-mobile', usesMobileShell);
        setShellDataAttribute('data-tx-shell-lg', isLg);
        setShellDataAttribute('data-tx-shell-xl', isXl);
        setShellDataAttribute('data-tx-shell-2xl', is2xl);
        setShellDataAttribute('data-tx-shell-compact', scaledViewportMode === 'compact');
        setShellDataAttribute('data-tx-shell-expanded', scaledViewportMode === 'expanded');

        return () => {
            rootStyle.removeProperty('--tx-shell-base-font-size');
            rootStyle.removeProperty('--tx-shell-ui-scale');
            document.documentElement.removeAttribute('data-tx-shell-mobile');
            document.documentElement.removeAttribute('data-tx-shell-lg');
            document.documentElement.removeAttribute('data-tx-shell-xl');
            document.documentElement.removeAttribute('data-tx-shell-2xl');
            document.documentElement.removeAttribute('data-tx-shell-compact');
            document.documentElement.removeAttribute('data-tx-shell-expanded');
        };
    }, [baseFontSizePx, uiScale, usesMobileShell, isLg, isXl, is2xl, scaledViewportMode]);

    return breakpoints;
};
