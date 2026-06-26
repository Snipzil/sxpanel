import { Button } from '@/components/ui/button';
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import {
    notifyPostInstallFlowChanged,
    POST_INSTALL_FLOW_CHANGED_EVENT,
    POST_INSTALL_FULL_TOUR_DISMISSED_KEY,
    POST_INSTALL_FULL_TOUR_PENDING_KEY,
    POST_INSTALL_TOUR_DISMISSED_KEY,
    POST_INSTALL_TOUR_PENDING_KEY,
    POST_INSTALL_TOUR_REPLAY_EVENT,
    POST_INSTALL_WELCOME_DISMISSED_KEY,
} from './postInstallTourConstants';
import { POST_INSTALL_TOUR_STEPS } from './tourSteps';
import { findNextUsableStepIndex, isUsableTargetElement } from './tourTargetUtils';
import { TourOverlay } from './TourOverlay';
import { useTourTarget } from './useTourTarget';

function readStorageFlag(key: string): boolean {
    try {
        return localStorage.getItem(key) === '1';
    } catch {
        return false;
    }
}

function writeTourDismissed() {
    try {
        localStorage.setItem(POST_INSTALL_TOUR_DISMISSED_KEY, '1');
        localStorage.removeItem(POST_INSTALL_TOUR_PENDING_KEY);
        notifyPostInstallFlowChanged();
    } catch {
        // ignore
    }
}

function markTourPending() {
    try {
        localStorage.setItem(POST_INSTALL_TOUR_PENDING_KEY, '1');
        notifyPostInstallFlowChanged();
    } catch {
        // ignore
    }
}

type PopoverCapableElement = HTMLDivElement & {
    showPopover?: () => void;
    hidePopover?: () => void;
};

function MobileTourFallbackOverlay({ onDismiss }: { onDismiss: () => void }) {
    const rootRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const el = rootRef.current as PopoverCapableElement | null;
        if (!el || typeof el.showPopover !== 'function') return;

        try {
            el.showPopover();
        } catch {
            //
        }

        return () => {
            try {
                el.hidePopover?.();
            } catch {
                //
            }
        };
    }, []);

    return (
        <div
            ref={rootRef}
            id="fxpanel-post-install-tour-mobile"
            popover="manual"
            className="pointer-events-none fixed inset-0 z-[2147483647] m-0 box-border h-[100dvh] w-screen max-w-none border-0 bg-transparent p-0 shadow-none outline-none"
        >
            <div
                className="pointer-events-auto absolute inset-0 z-0 bg-[rgba(6,8,14,0.72)] backdrop-blur-[2px]"
                aria-hidden="true"
            />
            <div className="pointer-events-auto fixed inset-0 z-10 flex items-center justify-center p-4">
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="post-install-tour-mobile-title"
                    className="border-border/70 bg-card max-w-sm overflow-hidden rounded-2xl border shadow-[0_25px_50px_-12px_rgba(0,0,0,0.55)]"
                    style={{ backgroundColor: 'hsl(var(--card))' }}
                >
                    <div
                        className="h-0.5 w-full bg-gradient-to-r from-[#ec1f6e] via-[#ec1f6e]/40 to-transparent"
                        aria-hidden="true"
                    />
                    <div className="p-5 pt-4">
                        <p className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-[0.16em] uppercase">
                            Panel tour
                        </p>
                        <h2
                            id="post-install-tour-mobile-title"
                            className="text-foreground text-lg leading-tight font-semibold tracking-tight"
                        >
                            This tour works best on desktop.
                        </h2>
                        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
                            Open the panel on a larger screen to highlight sidebar navigation, or dismiss to continue on
                            mobile.
                        </p>
                        <Button type="button" className="mt-5 w-full font-medium" onClick={onDismiss}>
                            Dismiss
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * Guided coachmark tour after a successful deployer run (detected via /server/deployer → /server/console).
 * Mount once near the shell root so route transitions stay accurate.
 */
export default function PostInstallTourHost() {
    const [pathname] = useLocation();
    const prevPathRef = useRef<string | null>(null);
    const [, refresh] = useReducer((n: number) => n + 1, 0);

    const [stepIndex, setStepIndex] = useState(0);
    const [mobileFallback, setMobileFallback] = useState(false);
    const stepIndexRef = useRef(stepIndex);

    useEffect(() => {
        stepIndexRef.current = stepIndex;
    }, [stepIndex]);

    useEffect(() => {
        const prev = prevPathRef.current;
        prevPathRef.current = pathname;
        if (prev === '/server/deployer' && pathname === '/server/console') {
            markTourPending();
        }
    }, [pathname]);

    const canShow =
        pathname === '/' &&
        readStorageFlag(POST_INSTALL_TOUR_PENDING_KEY) &&
        !readStorageFlag(POST_INSTALL_TOUR_DISMISSED_KEY) &&
        readStorageFlag(POST_INSTALL_WELCOME_DISMISSED_KEY);

    const dismiss = useCallback(() => {
        writeTourDismissed();
        refresh();
    }, []);

    useEffect(() => {
        const bump = () => refresh();
        window.addEventListener(POST_INSTALL_FLOW_CHANGED_EVENT, bump);
        return () => window.removeEventListener(POST_INSTALL_FLOW_CHANGED_EVENT, bump);
    }, []);

    useEffect(() => {
        if (!canShow) {
            queueMicrotask(() => {
                setMobileFallback(false);
            });
            return;
        }
        queueMicrotask(() => {
            setStepIndex(findNextUsableStepIndex(POST_INSTALL_TOUR_STEPS, 0, 1));
            setMobileFallback(false);
        });
        const timerId = window.setTimeout(() => {
            const first = POST_INSTALL_TOUR_STEPS[0];
            if (!first.targetSelector) return;
            if (!window.matchMedia('(max-width: 1023px)').matches) return;
            const el = document.querySelector(first.targetSelector);
            if (!isUsableTargetElement(el)) {
                setMobileFallback(true);
            }
        }, 200);
        return () => clearTimeout(timerId);
    }, [canShow]);

    useEffect(() => {
        const handler = () => {
            try {
                localStorage.removeItem(POST_INSTALL_WELCOME_DISMISSED_KEY);
                localStorage.removeItem(POST_INSTALL_FULL_TOUR_PENDING_KEY);
                localStorage.removeItem(POST_INSTALL_FULL_TOUR_DISMISSED_KEY);
            } catch {
                //
            }
            notifyPostInstallFlowChanged();
            if (readStorageFlag(POST_INSTALL_TOUR_PENDING_KEY) && !readStorageFlag(POST_INSTALL_TOUR_DISMISSED_KEY)) {
                setStepIndex(findNextUsableStepIndex(POST_INSTALL_TOUR_STEPS, 0, 1));
                setMobileFallback(false);
            }
            refresh();
        };
        window.addEventListener(POST_INSTALL_TOUR_REPLAY_EVENT, handler);
        return () => window.removeEventListener(POST_INSTALL_TOUR_REPLAY_EVENT, handler);
    }, []);

    const devReplayTour = () => {
        if (!import.meta.env.DEV) return;
        try {
            localStorage.removeItem(POST_INSTALL_TOUR_DISMISSED_KEY);
            localStorage.removeItem(POST_INSTALL_WELCOME_DISMISSED_KEY);
            localStorage.removeItem(POST_INSTALL_FULL_TOUR_PENDING_KEY);
            localStorage.removeItem(POST_INSTALL_FULL_TOUR_DISMISSED_KEY);
            localStorage.setItem(POST_INSTALL_TOUR_PENDING_KEY, '1');
        } catch {
            // ignore
        }
        notifyPostInstallFlowChanged();
        refresh();
    };

    const handleContinue = useCallback(() => {
        const i = stepIndexRef.current;
        if (i >= POST_INSTALL_TOUR_STEPS.length - 1) {
            dismiss();
            return;
        }
        setStepIndex(findNextUsableStepIndex(POST_INSTALL_TOUR_STEPS, i + 1, 1));
    }, [dismiss]);

    const handleBack = useCallback(() => {
        const i = stepIndexRef.current;
        if (i <= 0) return;
        setStepIndex(findNextUsableStepIndex(POST_INSTALL_TOUR_STEPS, i - 1, -1));
    }, []);

    useEffect(() => {
        if (!canShow || mobileFallback) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                dismiss();
                return;
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                const i = stepIndexRef.current;
                if (i >= POST_INSTALL_TOUR_STEPS.length - 1) {
                    dismiss();
                    return;
                }
                setStepIndex(findNextUsableStepIndex(POST_INSTALL_TOUR_STEPS, i + 1, 1));
                return;
            }
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                const i = stepIndexRef.current;
                if (i <= 0) return;
                setStepIndex(findNextUsableStepIndex(POST_INSTALL_TOUR_STEPS, i - 1, -1));
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [canShow, mobileFallback, dismiss]);

    const measureTour = canShow && !mobileFallback;
    const stepForMeasure = measureTour
        ? (POST_INSTALL_TOUR_STEPS[stepIndex] ?? POST_INSTALL_TOUR_STEPS[0])
        : POST_INSTALL_TOUR_STEPS[0];
    const targetSelector = measureTour ? (stepForMeasure.targetSelector ?? null) : null;
    const targetRect = useTourTarget(targetSelector, measureTour && targetSelector !== null, stepIndex);

    if (!canShow) {
        if (import.meta.env.DEV && pathname === '/') {
            return (
                <div className="pointer-events-none fixed bottom-16 left-3 z-40 sm:left-4">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="pointer-events-auto border-dashed text-xs"
                        onClick={devReplayTour}
                    >
                        Dev: show post-install tour
                    </Button>
                </div>
            );
        }
        return null;
    }

    if (mobileFallback) {
        return createPortal(<MobileTourFallbackOverlay onDismiss={dismiss} />, document.body);
    }

    const total = POST_INSTALL_TOUR_STEPS.length;
    const isLast = stepIndex >= total - 1;
    const currentStep = POST_INSTALL_TOUR_STEPS[stepIndex] ?? POST_INSTALL_TOUR_STEPS[0];

    return (
        <TourOverlay
            layoutKey={stepIndex}
            targetRect={targetSelector !== null ? targetRect : null}
            tooltipProps={{
                stepIndex,
                stepTotal: total,
                title: currentStep.title,
                description: currentStep.description,
                canGoBack: stepIndex > 0,
                continueLabel: isLast ? 'Done' : 'Continue',
                onSkip: dismiss,
                onBack: handleBack,
                onContinue: handleContinue,
                focusGeneration: stepIndex,
            }}
        />
    );
}
