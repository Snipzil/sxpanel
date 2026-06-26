import { useEffect, useLayoutEffect, useState } from 'react';
import { isUsableTargetElement } from './tourTargetUtils';

export type TourTargetRect = {
    left: number;
    top: number;
    width: number;
    height: number;
};

/**
 * Either a CSS selector string OR a function that returns the element to highlight.
 * Functions enable resolution by text content, structural position, and other heuristics
 * that CSS selectors can't express.
 */
export type TourTargetSpec = string | (() => HTMLElement | null) | null;

const resolveTarget = (spec: TourTargetSpec): HTMLElement | null => {
    if (!spec) return null;
    try {
        const el = typeof spec === 'string' ? document.querySelector(spec) : spec();
        return isUsableTargetElement(el) ? el : null;
    } catch {
        return null;
    }
};

export const useTourTarget = (
    spec: TourTargetSpec,
    enabled: boolean,
    /** Bumps when the active step changes so we scroll the target into view again */
    scrollSignal: number,
): TourTargetRect | null => {
    const [rect, setRect] = useState<TourTargetRect | null>(null);

    useLayoutEffect(() => {
        if (!enabled || !spec) {
            return;
        }
        const el = resolveTarget(spec);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [spec, enabled, scrollSignal]);

    useEffect(() => {
        if (!enabled || !spec) {
            queueMicrotask(() => {
                setRect(null);
            });
            return;
        }

        const el = resolveTarget(spec);
        if (!el) {
            queueMicrotask(() => {
                setRect(null);
            });
            return;
        }

        const update = () => {
            const current = resolveTarget(spec);
            if (!current) {
                setRect(null);
                return;
            }
            const r = current.getBoundingClientRect();
            setRect({ left: r.left, top: r.top, width: r.width, height: r.height });
        };

        queueMicrotask(() => {
            update();
        });

        const ro = new ResizeObserver(() => {
            window.requestAnimationFrame(update);
        });
        ro.observe(el);

        const onScrollOrResize = () => {
            window.requestAnimationFrame(update);
        };
        window.addEventListener('scroll', onScrollOrResize, { capture: true, passive: true });
        window.addEventListener('resize', onScrollOrResize, { passive: true });

        return () => {
            ro.disconnect();
            window.removeEventListener('scroll', onScrollOrResize, true);
            window.removeEventListener('resize', onScrollOrResize);
        };
    }, [spec, enabled, scrollSignal]);

    return rect;
};
