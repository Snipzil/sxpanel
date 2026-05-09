import { useEffect, useState } from 'react';

type ScaledViewportMode = 'default' | 'compact' | 'expanded';

const clampNumber = (value: number, min: number, max: number) => {
    return Math.min(max, Math.max(min, value));
};

const getResolutionFontSizePx = (width: number) => {
    return clampNumber(8 + width * 0.0021, 12, 16);
};

type ViewportSnapshot = {
    innerWidth: number;
    visualViewportWidth: number;
    visualViewportHeight: number;
    devicePixelRatio: number;
    outerWidth: number;
    screenWidth: number;
    screenAvailWidth: number;
    screenHeight: number;
    txIsMobile: boolean;
    hasCoarsePointer: boolean;
};

export const getViewportMetricsFromSnapshot = (snapshot: ViewportSnapshot) => {
    const shortestEdge = Math.min(
        snapshot.visualViewportWidth || Infinity,
        snapshot.visualViewportHeight || Infinity,
        snapshot.screenWidth || Infinity,
        snapshot.screenHeight || Infinity,
    );
    const usesMobileShell = snapshot.txIsMobile || (snapshot.hasCoarsePointer && shortestEdge <= 1024);
    const referenceWidth = Math.max(
        Math.round(snapshot.innerWidth * snapshot.devicePixelRatio),
        snapshot.outerWidth,
        snapshot.screenAvailWidth,
        snapshot.screenWidth,
    );
    const physicalViewportWidth = Math.round(snapshot.innerWidth * snapshot.devicePixelRatio);
    const zoomNeutralWidth = Math.max(snapshot.screenAvailWidth, snapshot.screenWidth, 0);
    const hasCompactScaledViewportMismatch = !usesMobileShell && snapshot.innerWidth < 640 && referenceWidth >= 1280;
    const hasExpandedScaledViewportMismatch =
        !usesMobileShell &&
        snapshot.innerWidth >= 1280 &&
        referenceWidth >= 1280 &&
        snapshot.innerWidth >= Math.max(Math.round(referenceWidth * 1.1), referenceWidth + 160);
    const scaledViewportMode: ScaledViewportMode = hasCompactScaledViewportMismatch
        ? 'compact'
        : hasExpandedScaledViewportMismatch
          ? 'expanded'
          : 'default';
    const hasScaledViewportMismatch = scaledViewportMode !== 'default';
    const hasZoomScaleMismatch =
        !usesMobileShell &&
                zoomNeutralWidth >= 1280 &&
        physicalViewportWidth >= Math.round(referenceWidth * 0.94) &&
                Math.abs(snapshot.innerWidth / zoomNeutralWidth - 1) >= 0.08;
    const effectiveWidth = usesMobileShell ? snapshot.visualViewportWidth : hasScaledViewportMismatch ? referenceWidth : snapshot.innerWidth;
    const resolutionWidth = usesMobileShell
        ? snapshot.visualViewportWidth
        : hasZoomScaleMismatch || scaledViewportMode === 'expanded'
                    ? zoomNeutralWidth || effectiveWidth
                    : effectiveWidth;
    const uiScale = usesMobileShell || !hasZoomScaleMismatch
        ? 1
                : clampNumber(snapshot.innerWidth / zoomNeutralWidth, 0.8, 1.25);
    const baseFontSizePx = getResolutionFontSizePx(Math.max(resolutionWidth, 320));

    return {
        effectiveWidth,
        hasScaledViewportMismatch,
        hasZoomScaleMismatch,
        scaledViewportMode,
        baseFontSizePx,
        uiScale,
        usesMobileShell,
    };
};

const getViewportMetrics = () => {
    if (typeof window === 'undefined') {
        return {
            effectiveWidth: 0,
            hasScaledViewportMismatch: false,
            hasZoomScaleMismatch: false,
            scaledViewportMode: 'default' as const,
            baseFontSizePx: 12,
            uiScale: 1,
            usesMobileShell: false,
        };
    }

    const innerWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const innerHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const hasCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;

    return getViewportMetricsFromSnapshot({
        innerWidth,
        visualViewportWidth: Math.round(window.visualViewport?.width || innerWidth),
        visualViewportHeight: Math.round(window.visualViewport?.height || innerHeight),
        devicePixelRatio: window.devicePixelRatio || 1,
        outerWidth: window.outerWidth || 0,
        screenWidth: window.screen?.width || 0,
        screenAvailWidth: window.screen?.availWidth || 0,
        screenHeight: window.screen?.height || 0,
        txIsMobile: window.txIsMobile,
        hasCoarsePointer,
    });
};

const getBreakpoints = () => {
    const { effectiveWidth, hasScaledViewportMismatch, hasZoomScaleMismatch, scaledViewportMode, baseFontSizePx, uiScale, usesMobileShell } =
        getViewportMetrics();

    return {
        effectiveWidth,
        hasScaledViewportMismatch,
        hasZoomScaleMismatch,
        scaledViewportMode,
        baseFontSizePx,
        uiScale,
        usesMobileShell,
        isSm: effectiveWidth >= 640,
        isLg: !usesMobileShell && effectiveWidth >= 1024,
        isXl: !usesMobileShell && effectiveWidth >= 1280,
        is2xl: !usesMobileShell && effectiveWidth >= 1400,
    };
};

export const useShellBreakpoints = () => {
    const [breakpoints, setBreakpoints] = useState(getBreakpoints);

    useEffect(() => {
        const updateBreakpoints = () => setBreakpoints(getBreakpoints());
        const viewport = window.visualViewport;

        updateBreakpoints();
        window.addEventListener('resize', updateBreakpoints);
        viewport?.addEventListener('resize', updateBreakpoints);
        viewport?.addEventListener('scroll', updateBreakpoints);

        return () => {
            window.removeEventListener('resize', updateBreakpoints);
            viewport?.removeEventListener('resize', updateBreakpoints);
            viewport?.removeEventListener('scroll', updateBreakpoints);
        };
    }, []);

    return breakpoints;
};
