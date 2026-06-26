import { expect, suite, it } from 'vitest';
import { getViewportMetricsFromSnapshot } from './useShellBreakpoints';

suite('getViewportMetricsFromSnapshot', () => {
    it('keeps normal desktop widths untouched', () => {
        const result = getViewportMetricsFromSnapshot({
            innerWidth: 1920,
            visualViewportWidth: 1920,
            visualViewportHeight: 1080,
            devicePixelRatio: 1,
            outerWidth: 1920,
            screenWidth: 1920,
            screenAvailWidth: 1920,
            screenHeight: 1080,
            txIsMobile: false,
            hasCoarsePointer: false,
        });

        expect(result.scaledViewportMode).toBe('default');
        expect(result.hasScaledViewportMismatch).toBe(false);
        expect(result.hasZoomScaleMismatch).toBe(false);
        expect(result.layoutWidth).toBe(1920);
        expect(result.effectiveWidth).toBe(1920);
        expect(result.uiScale).toBe(1);
        expect(result.baseFontSizePx).toBeCloseTo(12.032, 3);
    });

    it('treats severely cramped desktop viewports as compact mismatches', () => {
        const result = getViewportMetricsFromSnapshot({
            innerWidth: 600,
            visualViewportWidth: 600,
            visualViewportHeight: 1080,
            devicePixelRatio: 2,
            outerWidth: 1920,
            screenWidth: 1920,
            screenAvailWidth: 1920,
            screenHeight: 1080,
            txIsMobile: false,
            hasCoarsePointer: false,
        });

        expect(result.scaledViewportMode).toBe('compact');
        expect(result.hasScaledViewportMismatch).toBe(true);
        expect(result.hasZoomScaleMismatch).toBe(false);
        expect(result.layoutWidth).toBe(600);
        expect(result.effectiveWidth).toBe(600);
        expect(result.referenceWidth).toBe(1920);
        expect(result.uiScale).toBe(1);
    });

    it('treats zoomed-out desktop viewports as expanded mismatches', () => {
        const result = getViewportMetricsFromSnapshot({
            innerWidth: 2133,
            visualViewportWidth: 2133,
            visualViewportHeight: 1200,
            devicePixelRatio: 0.9,
            outerWidth: 1920,
            screenWidth: 1920,
            screenAvailWidth: 1920,
            screenHeight: 1080,
            txIsMobile: false,
            hasCoarsePointer: false,
        });

        expect(result.scaledViewportMode).toBe('expanded');
        expect(result.hasScaledViewportMismatch).toBe(true);
        expect(result.hasZoomScaleMismatch).toBe(true);
        expect(result.layoutWidth).toBe(2133);
        expect(result.effectiveWidth).toBe(2133);
        expect(result.uiScale).toBeCloseTo(1.1109, 3);
        expect(result.baseFontSizePx).toBeCloseTo(12.032, 3);
    });

    it('scales desktop UI down when the browser is zoomed in without changing the underlying resolution tier', () => {
        const result = getViewportMetricsFromSnapshot({
            innerWidth: 1536,
            visualViewportWidth: 1536,
            visualViewportHeight: 864,
            devicePixelRatio: 1.25,
            outerWidth: 1536,
            screenWidth: 1920,
            screenAvailWidth: 1920,
            screenHeight: 1080,
            txIsMobile: false,
            hasCoarsePointer: false,
        });

        expect(result.scaledViewportMode).toBe('default');
        expect(result.hasScaledViewportMismatch).toBe(false);
        expect(result.hasZoomScaleMismatch).toBe(true);
        expect(result.layoutWidth).toBe(1536);
        expect(result.effectiveWidth).toBe(1536);
        expect(result.uiScale).toBeCloseTo(0.8, 3);
        expect(result.baseFontSizePx).toBeCloseTo(12.032, 3);
    });

    it('does not treat a manually narrowed desktop window as browser zoom', () => {
        const result = getViewportMetricsFromSnapshot({
            innerWidth: 1600,
            visualViewportWidth: 1600,
            visualViewportHeight: 900,
            devicePixelRatio: 1,
            outerWidth: 1620,
            screenWidth: 1920,
            screenAvailWidth: 1920,
            screenHeight: 1080,
            txIsMobile: false,
            hasCoarsePointer: false,
        });

        expect(result.scaledViewportMode).toBe('default');
        expect(result.hasScaledViewportMismatch).toBe(false);
        expect(result.hasZoomScaleMismatch).toBe(false);
        expect(result.layoutWidth).toBe(1600);
        expect(result.effectiveWidth).toBe(1600);
        expect(result.uiScale).toBe(1);
        expect(result.baseFontSizePx).toBeCloseTo(12.032, 3);
    });

    it('does not treat desktop display scaling as browser zoom', () => {
        const result = getViewportMetricsFromSnapshot({
            innerWidth: 1280,
            visualViewportWidth: 1280,
            visualViewportHeight: 720,
            devicePixelRatio: 1.5,
            outerWidth: 1280,
            screenWidth: 1280,
            screenAvailWidth: 1280,
            screenHeight: 720,
            txIsMobile: false,
            hasCoarsePointer: false,
        });

        expect(result.scaledViewportMode).toBe('default');
        expect(result.hasScaledViewportMismatch).toBe(false);
        expect(result.hasZoomScaleMismatch).toBe(false);
        expect(result.layoutWidth).toBe(1280);
        expect(result.effectiveWidth).toBe(1280);
        expect(result.uiScale).toBe(1);
        expect(result.baseFontSizePx).toBeCloseTo(12.032, 3);
    });

    it('scales root font up on native 4K viewports', () => {
        const result = getViewportMetricsFromSnapshot({
            innerWidth: 3840,
            visualViewportWidth: 3840,
            visualViewportHeight: 2160,
            devicePixelRatio: 1,
            outerWidth: 3840,
            screenWidth: 3840,
            screenAvailWidth: 3840,
            screenHeight: 2160,
            txIsMobile: false,
            hasCoarsePointer: false,
        });

        expect(result.scaledViewportMode).toBe('default');
        expect(result.uiScale).toBe(1);
        expect(result.baseFontSizePx).toBe(20);
    });

    it('scales root font moderately on QHD viewports', () => {
        const result = getViewportMetricsFromSnapshot({
            innerWidth: 2560,
            visualViewportWidth: 2560,
            visualViewportHeight: 1440,
            devicePixelRatio: 1,
            outerWidth: 2560,
            screenWidth: 2560,
            screenAvailWidth: 2560,
            screenHeight: 1440,
            txIsMobile: false,
            hasCoarsePointer: false,
        });

        expect(result.baseFontSizePx).toBe(14);
    });

    it('uses layout width for a 1366x768 laptop', () => {
        const result = getViewportMetricsFromSnapshot({
            innerWidth: 1366,
            visualViewportWidth: 1366,
            visualViewportHeight: 768,
            devicePixelRatio: 1,
            outerWidth: 1366,
            screenWidth: 1366,
            screenAvailWidth: 1366,
            screenHeight: 768,
            txIsMobile: false,
            hasCoarsePointer: false,
        });

        expect(result.layoutWidth).toBe(1366);
        expect(result.baseFontSizePx).toBeCloseTo(12, 3);
    });

    it('uses layout width for a split window at 900px on a 1920 screen', () => {
        const result = getViewportMetricsFromSnapshot({
            innerWidth: 900,
            visualViewportWidth: 900,
            visualViewportHeight: 1080,
            devicePixelRatio: 1,
            outerWidth: 920,
            screenWidth: 1920,
            screenAvailWidth: 1920,
            screenHeight: 1080,
            txIsMobile: false,
            hasCoarsePointer: false,
        });

        expect(result.layoutWidth).toBe(900);
        expect(result.scaledViewportMode).toBe('default');
        expect(result.referenceWidth).toBe(1920);
    });

    it('scales rem layout up when the browser is zoomed out to 25%', () => {
        const result = getViewportMetricsFromSnapshot({
            innerWidth: 7680,
            visualViewportWidth: 7680,
            visualViewportHeight: 4320,
            devicePixelRatio: 0.25,
            outerWidth: 1920,
            screenWidth: 1920,
            screenAvailWidth: 1920,
            screenHeight: 1080,
            txIsMobile: false,
            hasCoarsePointer: false,
        });

        expect(result.scaledViewportMode).toBe('expanded');
        expect(result.hasZoomScaleMismatch).toBe(true);
        expect(result.layoutWidth).toBe(7680);
        expect(result.uiScale).toBe(4);
        expect(result.baseFontSizePx).toBeCloseTo(12.032, 3);
    });
});
