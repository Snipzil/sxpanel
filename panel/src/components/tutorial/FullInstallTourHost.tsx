import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { isDevMockStatusOptInEnabled, setDevMockStatusOptInEnabled } from '@/lib/devFlags';
import { FULL_INSTALL_TOUR_STEPS, type FullTourStep, type FullTourTargetSpec } from './fullTourSteps';
import {
    notifyPostInstallFlowChanged,
    POST_INSTALL_FLOW_CHANGED_EVENT,
    POST_INSTALL_FULL_TOUR_DISMISSED_KEY,
    POST_INSTALL_FULL_TOUR_PENDING_KEY,
} from './postInstallTourConstants';
import { TourOverlay } from './TourOverlay';
import { useTourTarget } from './useTourTarget';

const TARGET_POLL_INTERVAL_MS = 60;
const TARGET_POLL_DEFAULT_TIMEOUT_MS = 1500;

function readFlag(key: string): boolean {
    try {
        return localStorage.getItem(key) === '1';
    } catch {
        return false;
    }
}

function writeFlag(key: string, value: '1' | null) {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    } catch {
        //
    }
}

function isElementUsable(el: Element | null): el is HTMLElement {
    if (!el || !(el instanceof HTMLElement)) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
}

function resolveTarget(spec: FullTourTargetSpec): HTMLElement | null {
    if (!spec) return null;
    try {
        const el = typeof spec === 'string' ? document.querySelector(spec) : spec();
        return isElementUsable(el) ? el : null;
    } catch {
        return null;
    }
}

/**
 * Full guided tour. Navigates real pages, opts into the existing dev-mock data
 * flag for the duration of the tour so the dashboard / players / etc. show
 * representative numbers, then restores the flag on exit.
 *
 * Mounted from MainShell alongside the basic tour and welcome card; only
 * actually renders when its pending flag is set.
 */
export default function FullInstallTourHost() {
    const [pathname, setLocation] = useLocation();
    const [, refresh] = useReducer((n: number) => n + 1, 0);

    const pending = readFlag(POST_INSTALL_FULL_TOUR_PENDING_KEY);
    const dismissed = readFlag(POST_INSTALL_FULL_TOUR_DISMISSED_KEY);
    const active = pending && !dismissed;

    const [stepIndex, setStepIndex] = useState(0);
    const stepIndexRef = useRef(stepIndex);
    useEffect(() => {
        stepIndexRef.current = stepIndex;
    }, [stepIndex]);

    /** Sentinel: target is being polled / scrolled into view; suppress the overlay until it lands. */
    const [waitingForTarget, setWaitingForTarget] = useState(false);

    /**
     * Tour-only mock data:
     * - Force the dev-mock flag on while the tour is active so dashboards / players
     *   show representative numbers instead of zeroed empties.
     * - On tour exit (done / skip / esc), ALWAYS clear the mock flag — even if the
     *   user had it enabled before starting the tour. The full tour is intended
     *   for first-run users who don't want to be left looking at fake data.
     */
    useEffect(() => {
        if (!active) return;
        if (!isDevMockStatusOptInEnabled()) {
            setDevMockStatusOptInEnabled(true);
        }
        return () => {
            if (isDevMockStatusOptInEnabled()) {
                setDevMockStatusOptInEnabled(false);
            }
        };
    }, [active]);

    useEffect(() => {
        const bump = () => refresh();
        window.addEventListener(POST_INSTALL_FLOW_CHANGED_EVENT, bump);
        return () => window.removeEventListener(POST_INSTALL_FLOW_CHANGED_EVENT, bump);
    }, []);

    const close = useCallback(() => {
        writeFlag(POST_INSTALL_FULL_TOUR_PENDING_KEY, null);
        writeFlag(POST_INSTALL_FULL_TOUR_DISMISSED_KEY, '1');
        notifyPostInstallFlowChanged();
        refresh();
    }, []);

    const currentStep: FullTourStep | undefined = FULL_INSTALL_TOUR_STEPS[stepIndex];
    const total = FULL_INSTALL_TOUR_STEPS.length;
    const isLast = stepIndex >= total - 1;

    useEffect(() => {
        if (!active || !currentStep) return;
        if (currentStep.route && pathname !== currentStep.route) {
            setWaitingForTarget(true);
            setLocation(currentStep.route);
            return;
        }
        if (currentStep.hash !== undefined && window.location.hash.slice(1) !== currentStep.hash) {
            const newUrl = `${window.location.pathname}#${currentStep.hash}`;
            window.history.replaceState({}, '', newUrl);
            window.dispatchEvent(new HashChangeEvent('hashchange'));
        }
    }, [active, currentStep, pathname, setLocation]);

    /**
     * Run the step's `setup` once the page has navigated, then run `teardown` when
     * the step changes (or the tour exits). Setup is delayed slightly so the new
     * route's components have a chance to mount before we click into them.
     */
    useEffect(() => {
        if (!active || !currentStep) return;
        if (currentStep.route && pathname !== currentStep.route) return;
        if (!currentStep.setup) return;

        let cancelled = false;
        const t = window.setTimeout(() => {
            if (cancelled) return;
            try {
                currentStep.setup?.();
            } catch (err) {
                if (import.meta.env.DEV) {
                    console.warn('[FullInstallTour] step setup threw', err);
                }
            }
        }, 80);

        return () => {
            cancelled = true;
            window.clearTimeout(t);
            try {
                currentStep.teardown?.();
            } catch (err) {
                if (import.meta.env.DEV) {
                    console.warn('[FullInstallTour] step teardown threw', err);
                }
            }
        };
    }, [active, currentStep, pathname]);

    useEffect(() => {
        if (!active || !currentStep) return;

        if (!currentStep.target) {
            setWaitingForTarget(false);
            return;
        }

        if (currentStep.route && pathname !== currentStep.route) {
            return;
        }

        const deadline = Date.now() + (currentStep.awaitTargetMs ?? TARGET_POLL_DEFAULT_TIMEOUT_MS);
        let cancelled = false;
        let pollTimer: number | null = null;

        setWaitingForTarget(true);

        const tryFind = () => {
            if (cancelled) return;
            const el = resolveTarget(currentStep.target);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setWaitingForTarget(false);
                return;
            }
            if (Date.now() >= deadline) {
                setWaitingForTarget(false);
                return;
            }
            pollTimer = window.setTimeout(tryFind, TARGET_POLL_INTERVAL_MS);
        };

        const initial = window.setTimeout(tryFind, TARGET_POLL_INTERVAL_MS);

        return () => {
            cancelled = true;
            if (pollTimer !== null) window.clearTimeout(pollTimer);
            window.clearTimeout(initial);
        };
    }, [active, currentStep, pathname, stepIndex]);

    const handleContinue = useCallback(() => {
        const i = stepIndexRef.current;
        if (i >= FULL_INSTALL_TOUR_STEPS.length - 1) {
            close();
            return;
        }
        setStepIndex(i + 1);
    }, [close]);

    const handleBack = useCallback(() => {
        const i = stepIndexRef.current;
        if (i <= 0) return;
        setStepIndex(i - 1);
    }, []);

    useEffect(() => {
        if (!active) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                close();
                return;
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                handleContinue();
                return;
            }
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                handleBack();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [active, handleContinue, handleBack, close]);

    const targetSpec: FullTourTargetSpec =
        active && currentStep && !waitingForTarget && currentStep.target ? currentStep.target : null;
    const targetRect = useTourTarget(targetSpec, targetSpec !== null, stepIndex);

    if (!active || !currentStep) return null;

    return (
        <TourOverlay
            layoutKey={stepIndex}
            targetRect={targetSpec !== null ? targetRect : null}
            preferredSide={currentStep.preferredSide}
            fullWidthTarget={currentStep.fullWidthTarget}
            tooltipProps={{
                stepIndex,
                stepTotal: total,
                title: currentStep.title,
                description: currentStep.description,
                canGoBack: stepIndex > 0,
                continueLabel: isLast ? 'Done' : 'Continue',
                onSkip: close,
                onBack: handleBack,
                onContinue: handleContinue,
                focusGeneration: stepIndex,
                width: currentStep.cardWidth,
            }}
        />
    );
}
