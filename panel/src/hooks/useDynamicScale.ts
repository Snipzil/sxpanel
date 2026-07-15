import { useLayoutEffect, useRef } from 'react';

/**
 * Dynamically scales a content element down (via CSS `zoom`) so it always fits
 * inside its container without introducing a page-level scrollbar.
 *
 * - Never scales *up* past 1 (we only shrink when content would overflow).
 * - Honors a minimum zoom floor so text never becomes unreadable; if the
 *   content still overflows at the minimum, the container keeps its normal
 *   scroll behaviour as a fallback.
 * - Re-measures on container resize, content resize, and window resize.
 *
 * NOTE: CSS `zoom` is non-standard and historically had limited support in
 * Firefox (it gained support in Firefox 126, May 2024). For older browsers
 * we feature-detect support and fall back to `transform: scale()` with
 * `transform-origin: 0 0`. The transform fallback does NOT reflow layout, so
 * the container's effective height is adjusted to compensate.
 */
// Feature-detect once at module load.
const supportsZoom: boolean = (() => {
    if (typeof document === 'undefined') return true;
    const el = document.createElement('div');
    return 'zoom' in el.style;
})();

export function useDynamicScale<C extends HTMLElement, E extends HTMLElement>(options?: {
    minScale?: number;
    maxScale?: number;
    enabled?: boolean;
}) {
    const containerRef = useRef<C | null>(null);
    const contentRef = useRef<E | null>(null);
    const minScale = options?.minScale ?? 0.6;
    const maxScale = options?.maxScale ?? 1;
    const enabled = options?.enabled ?? true;

    useLayoutEffect(() => {
        const container = containerRef.current;
        const content = contentRef.current;
        if (!container || !content) return;

        const resetScale = () => {
            if (supportsZoom) {
                content.style.zoom = '';
            } else {
                Object.assign(content.style, {
                    transform: '',
                    transformOrigin: '',
                    width: '',
                    height: '',
                });
            }
        };

        if (!enabled) {
            resetScale();
            return;
        }

        let raf = 0;
        let lastScale = NaN;
        const measure = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                // Reset scaling so we can measure the natural unscaled size.
                resetScale();

                const naturalW = content.scrollWidth;
                // offsetWidth (not clientWidth): clientWidth shrinks when a vertical
                // scrollbar appears, and since `zoom` scales height too, a shrink can
                // remove that scrollbar, growing clientWidth, growing the scale back —
                // an infinite resize/zoom oscillation that crashes components (e.g.
                // ScrollArea) sensitive to layout thrash.
                const availW = container.offsetWidth;
                if (naturalW <= 0 || availW <= 0) {
                    return;
                }

                // Only scale based on width. Vertical overflow scrolls normally —
                // tall pages (Insights, Player Drops, etc.) should not be squished
                // to fit in the viewport height.
                const fitW = availW / naturalW;
                const rawScale = Math.min(maxScale, fitW);
                const scale = Math.max(minScale, rawScale);

                // Fast-guard: skip re-applying when the computed scale is unchanged
                // to avoid a ResizeObserver feedback loop with content observation.
                if (scale === lastScale) return;
                lastScale = scale;

                // Only apply when we actually need to shrink.
                if (scale >= 1) {
                    return;
                }

                if (supportsZoom) {
                    content.style.zoom = String(scale);
                } else {
                    // Fallback for browsers without `zoom` support.
                    // `transform: scale()` doesn't affect layout flow, so we
                    // explicitly compensate width/height to avoid scrollbars.
                    content.style.transformOrigin = '0 0';
                    Object.assign(content.style, {
                        transformOrigin: '0 0',
                        transform: `scale(${scale})`,
                        width: `${100 / scale}%`,
                    });
                    // Measure height after applying the new width so any
                    // reflow/wrapping caused by the width change is reflected.
                    const naturalH = content.scrollHeight;
                    content.style.height = `${naturalH * scale}px`;
                }
            });
        };

        measure();

        const ro = new ResizeObserver(measure);
        ro.observe(container);

        // Watch for DOM mutations in the content that may change its natural
        // size (e.g. new children, text changes) without observing the content
        // element itself in the ResizeObserver — that avoids feedback loops
        // caused by the style changes measure() applies to content.
        const mo = new MutationObserver(measure);
        mo.observe(content, { childList: true, subtree: true, characterData: true });

        window.addEventListener('resize', measure);

        return () => {
            cancelAnimationFrame(raf);
            ro.disconnect();
            mo.disconnect();
            window.removeEventListener('resize', measure);
            resetScale();
        };
    }, [enabled, minScale, maxScale]);

    return { containerRef, contentRef };
}
