import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TourTooltipCard, type TourTooltipCardProps } from './TourTooltipCard';
import type { TourTargetRect } from './useTourTarget';

const HOLE_PADDING = 6;
const HOLE_RADIUS = 8;
const RING_OUTER_EXPAND = 2;
/** Nav rows: full-width `<a>` rects are capped so the ring hugs the label area and stays on-screen */
const WIDE_ROW_MAX_INNER_WIDTH = 228;
const WIDE_ROW_MAX_HEIGHT = 52;
const VIEW_MARGIN = 12;
const TOOLTIP_GAP = 14;
const VIEWPORT_EDGE = 6;

const MOTION_DURATION_MS = 320;
const MOTION_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';

type Placement = { left: number; top: number };

type Hole = { left: number; top: number; width: number; height: number };

function buildSpotlightHole(rect: TourTargetRect | null, vw: number, vh: number, fullWidth = false): Hole | null {
    if (!rect || vw <= 0 || vh <= 0) return null;

    let left = rect.left - HOLE_PADDING;
    let top = rect.top - HOLE_PADDING;
    let width = rect.width + HOLE_PADDING * 2;
    let height = rect.height + HOLE_PADDING * 2;

    if (!fullWidth && rect.height <= WIDE_ROW_MAX_HEIGHT && rect.width > WIDE_ROW_MAX_INNER_WIDTH) {
        width = Math.min(width, WIDE_ROW_MAX_INNER_WIDTH + HOLE_PADDING * 2);
    }

    const x2 = left + width;
    const y2 = top + height;
    const cx1 = Math.max(left, VIEWPORT_EDGE);
    const cy1 = Math.max(top, VIEWPORT_EDGE);
    const cx2 = Math.min(x2, vw - VIEWPORT_EDGE);
    const cy2 = Math.min(y2, vh - VIEWPORT_EDGE);
    const cw = Math.max(28, cx2 - cx1);
    const ch = Math.max(28, cy2 - cy1);

    return { left: cx1, top: cy1, width: cw, height: ch };
}

export type TooltipSide = 'east' | 'west' | 'south' | 'north' | 'center';
export type TooltipPreferredSide = Exclude<TooltipSide, 'center'>;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

const fitsViewport = (p: Placement, tw: number, th: number, vw: number, vh: number): boolean => {
    return (
        p.left >= VIEW_MARGIN &&
        p.top >= VIEW_MARGIN &&
        p.left + tw <= vw - VIEW_MARGIN &&
        p.top + th <= vh - VIEW_MARGIN
    );
};

const computeTooltipPlacement = (
    hole: Hole | null,
    vw: number,
    vh: number,
    tw: number,
    th: number,
    preferredSide?: TooltipPreferredSide,
): Placement & { side: TooltipSide } => {
    if (!hole) {
        return {
            left: (vw - tw) / 2,
            top: (vh - th) / 2,
            side: 'center',
        };
    }

    const holeLeft = hole.left;
    const holeTop = hole.top;
    const holeWidth = hole.width;
    const holeHeight = hole.height;
    const holeRight = holeLeft + holeWidth;
    const holeBottom = holeTop + holeHeight;

    const midY = holeTop + holeHeight / 2 - th / 2;
    const midX = holeLeft + holeWidth / 2 - tw / 2;

    const candidatesBySide: Record<TooltipPreferredSide, { p: Placement; side: TooltipSide }> = {
        east: { p: { left: holeRight + TOOLTIP_GAP, top: midY }, side: 'east' },
        south: { p: { left: holeLeft + holeWidth / 2 - tw / 2, top: holeBottom + TOOLTIP_GAP }, side: 'south' },
        west: { p: { left: holeLeft - tw - TOOLTIP_GAP, top: midY }, side: 'west' },
        north: { p: { left: holeLeft + holeWidth / 2 - tw / 2, top: holeTop - th - TOOLTIP_GAP }, side: 'north' },
    };

    const defaultOrder: TooltipPreferredSide[] = ['east', 'south', 'west', 'north'];
    const order: TooltipPreferredSide[] = preferredSide
        ? [preferredSide, ...defaultOrder.filter((s) => s !== preferredSide)]
        : defaultOrder;

    for (const side of order) {
        const { p } = candidatesBySide[side];
        const clamped: Placement = {
            left: clamp(p.left, VIEW_MARGIN, vw - tw - VIEW_MARGIN),
            top: clamp(p.top, VIEW_MARGIN, vh - th - VIEW_MARGIN),
        };
        if (fitsViewport(clamped, tw, th, vw, vh)) {
            return { ...clamped, side };
        }
    }

    const left = clamp(midX, VIEW_MARGIN, vw - tw - VIEW_MARGIN);
    const top = clamp(midY, VIEW_MARGIN, vh - th - VIEW_MARGIN);
    const holeMidX = holeLeft + holeWidth / 2;
    const holeMidY = holeTop + holeHeight / 2;
    const cardMidX = left + tw / 2;
    const cardMidY = top + th / 2;
    const dx = cardMidX - holeMidX;
    const dy = cardMidY - holeMidY;
    const side: TooltipSide = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'east' : 'west') : dy >= 0 ? 'south' : 'north';

    return { left, top, side };
};

function connectorLine(
    hole: Hole,
    side: TooltipSide,
    card: { left: number; top: number; w: number; h: number },
): { x1: number; y1: number; x2: number; y2: number } | null {
    if (side === 'center') return null;
    const hcx = hole.left + hole.width / 2;
    const hcy = hole.top + hole.height / 2;
    const holeRight = hole.left + hole.width;
    const holeBottom = hole.top + hole.height;
    const ccx = card.left + card.w / 2;
    const ccy = card.top + card.h / 2;
    const pad = 6;
    switch (side) {
        case 'east':
            return { x1: holeRight + pad, y1: hcy, x2: card.left - pad, y2: ccy };
        case 'west':
            return { x1: hole.left - pad, y1: hcy, x2: card.left + card.w + pad, y2: ccy };
        case 'south':
            return { x1: hcx, y1: holeBottom + pad, x2: ccx, y2: card.top - pad };
        case 'north':
            return { x1: hcx, y1: hole.top - pad, x2: ccx, y2: card.top + card.h + pad };
        default:
            return null;
    }
}

function usePrefersReducedMotion(): boolean {
    const [reduced, setReduced] = useState(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    });

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
        mq.addEventListener?.('change', handler);
        return () => mq.removeEventListener?.('change', handler);
    }, []);

    return reduced;
}

export type TourOverlayProps = {
    targetRect: TourTargetRect | null;
    tooltipProps: Omit<TourTooltipCardProps, 'className'>;
    /** Sync with step changes for tooltip animation + layout */
    layoutKey: number;
    /** Optional placement bias — try this side first before falling back to auto-fit. */
    preferredSide?: TooltipPreferredSide;
    /**
     * Skip the short/wide row cap that normally trims sidebar nav rectangles.
     * Set this when targeting page-wide elements like a tablist that need to be
     * highlighted in full.
     */
    fullWidthTarget?: boolean;
};

/**
 * Coachmark overlay rendered into a portal at document.body with a max-int z-index.
 *
 * The dim + spotlight is drawn as a single SVG with a `<mask>` cutting the hole
 * out of the dim layer. SVG geometric attributes (x/y/width/height) are CSS-animated
 * so the cutout, ring, and card glide between targets instead of jumping.
 */
export function TourOverlay({ targetRect, tooltipProps, layoutKey, preferredSide, fullWidthTarget }: TourOverlayProps) {
    const cardMeasureRef = useRef<HTMLDivElement>(null);
    const [placement, setPlacement] = useState<Placement>({ left: 0, top: 0 });
    const [tooltipSide, setTooltipSide] = useState<TooltipSide>('east');
    const [cardBox, setCardBox] = useState({ w: 360, h: 220 });
    const [viewport, setViewport] = useState(() => ({
        width: typeof window === 'undefined' ? 0 : window.innerWidth,
        height: typeof window === 'undefined' ? 0 : window.innerHeight,
    }));
    const [animateMotion, setAnimateMotion] = useState(false);
    const maskId = useId();
    const reducedMotion = usePrefersReducedMotion();

    const hole = useMemo(
        () => buildSpotlightHole(targetRect, viewport.width, viewport.height, fullWidthTarget),
        [targetRect, viewport.width, viewport.height, fullWidthTarget],
    );

    useEffect(() => {
        if (!import.meta.env.DEV) return;
        if (targetRect == null) {
            // Help diagnose missing-highlight bugs in dev only.

            console.warn('[PostInstallTour] No targetRect for current step — highlight will be hidden.');
        }
    }, [targetRect]);

    useLayoutEffect(() => {
        const measureAndPlace = () => {
            const card = cardMeasureRef.current;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const tw = card?.offsetWidth ?? 320;
            const th = card?.offsetHeight ?? 200;
            setViewport({ width: vw, height: vh });
            const next = computeTooltipPlacement(
                buildSpotlightHole(targetRect, vw, vh, fullWidthTarget),
                vw,
                vh,
                tw,
                th,
                preferredSide,
            );
            setPlacement({ left: next.left, top: next.top });
            setTooltipSide(next.side);
            setCardBox({ w: tw, h: th });
        };

        measureAndPlace();

        const ro = new ResizeObserver(() => {
            window.requestAnimationFrame(measureAndPlace);
        });
        if (cardMeasureRef.current) {
            ro.observe(cardMeasureRef.current);
        }

        window.addEventListener('resize', measureAndPlace, { passive: true });
        return () => {
            ro.disconnect();
            window.removeEventListener('resize', measureAndPlace);
        };
    }, [targetRect, layoutKey, tooltipProps.title, tooltipProps.description, preferredSide, fullWidthTarget]);

    useEffect(() => {
        // Avoid the spotlight + card sliding in from (0, 0) on the first measurement.
        const id = window.requestAnimationFrame(() => setAnimateMotion(true));
        return () => window.cancelAnimationFrame(id);
    }, []);

    const motionEnabled = animateMotion && !reducedMotion;

    const link =
        hole && tooltipSide !== 'center'
            ? connectorLine(hole, tooltipSide, {
                  left: placement.left,
                  top: placement.top,
                  w: cardBox.w,
                  h: cardBox.h,
              })
            : null;

    const spotlightTransition = motionEnabled
        ? `x ${MOTION_DURATION_MS}ms ${MOTION_EASING}, y ${MOTION_DURATION_MS}ms ${MOTION_EASING}, width ${MOTION_DURATION_MS}ms ${MOTION_EASING}, height ${MOTION_DURATION_MS}ms ${MOTION_EASING}`
        : 'none';

    const cardTransition = motionEnabled
        ? `left ${MOTION_DURATION_MS}ms ${MOTION_EASING}, top ${MOTION_DURATION_MS}ms ${MOTION_EASING}`
        : 'none';

    const linkTransition = motionEnabled
        ? `x1 ${MOTION_DURATION_MS}ms ${MOTION_EASING}, y1 ${MOTION_DURATION_MS}ms ${MOTION_EASING}, x2 ${MOTION_DURATION_MS}ms ${MOTION_EASING}, y2 ${MOTION_DURATION_MS}ms ${MOTION_EASING}`
        : 'none';

    const overlay = (
        <div
            id="fxpanel-post-install-tour-overlay"
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 2147483647,
                pointerEvents: 'none',
            }}
        >
            <svg
                style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    overflow: 'visible',
                }}
                width={viewport.width || '100%'}
                height={viewport.height || '100%'}
                viewBox={`0 0 ${viewport.width || 1} ${viewport.height || 1}`}
                preserveAspectRatio="none"
                aria-hidden="true"
            >
                <defs>
                    <mask id={maskId}>
                        <rect x={0} y={0} width="100%" height="100%" fill="white" />
                        {hole ? (
                            <rect
                                x={hole.left}
                                y={hole.top}
                                width={hole.width}
                                height={hole.height}
                                rx={HOLE_RADIUS}
                                ry={HOLE_RADIUS}
                                fill="black"
                                style={{ transition: spotlightTransition }}
                            />
                        ) : null}
                    </mask>
                </defs>
                <rect
                    x={0}
                    y={0}
                    width="100%"
                    height="100%"
                    fill="rgba(6, 8, 14, 0.76)"
                    mask={`url(#${maskId})`}
                    style={{ pointerEvents: 'auto' }}
                />
                {link ? (
                    <line
                        x1={link.x1}
                        y1={link.y1}
                        x2={link.x2}
                        y2={link.y2}
                        stroke="rgba(255, 255, 255, 0.22)"
                        strokeWidth={1}
                        strokeDasharray="4 6"
                        strokeLinecap="round"
                        style={{ pointerEvents: 'none', transition: linkTransition }}
                    />
                ) : null}
                {hole ? (
                    <>
                        <rect
                            x={hole.left - RING_OUTER_EXPAND}
                            y={hole.top - RING_OUTER_EXPAND}
                            width={hole.width + RING_OUTER_EXPAND * 2}
                            height={hole.height + RING_OUTER_EXPAND * 2}
                            rx={HOLE_RADIUS + RING_OUTER_EXPAND * 0.5}
                            ry={HOLE_RADIUS + RING_OUTER_EXPAND * 0.5}
                            fill="none"
                            stroke="#ec1f6e"
                            strokeOpacity={0.14}
                            strokeWidth={3}
                            style={{
                                pointerEvents: 'none',
                                transition: spotlightTransition,
                            }}
                        >
                            <animate
                                attributeName="stroke-opacity"
                                values="0.08;0.2;0.08"
                                dur="2.8s"
                                repeatCount="indefinite"
                            />
                        </rect>
                        <rect
                            x={hole.left}
                            y={hole.top}
                            width={hole.width}
                            height={hole.height}
                            rx={HOLE_RADIUS}
                            ry={HOLE_RADIUS}
                            fill="none"
                            stroke="#ec1f6e"
                            strokeWidth={1.75}
                            style={{
                                filter: 'drop-shadow(0 0 6px rgba(236,31,110,0.45)) drop-shadow(0 0 14px rgba(236,31,110,0.22))',
                                pointerEvents: 'none',
                                transition: spotlightTransition,
                            }}
                        />
                    </>
                ) : null}
            </svg>

            <div
                ref={cardMeasureRef}
                style={{
                    position: 'fixed',
                    left: placement.left,
                    top: placement.top,
                    pointerEvents: 'auto',
                    zIndex: 1,
                    maxWidth: 'calc(100vw - 24px)',
                    transition: cardTransition,
                    willChange: motionEnabled ? 'left, top' : undefined,
                }}
            >
                <TourTooltipCard key={layoutKey} {...tooltipProps} />
            </div>
        </div>
    );

    return createPortal(overlay, document.body);
}
