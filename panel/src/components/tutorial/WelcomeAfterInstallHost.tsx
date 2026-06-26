import { Button } from '@/components/ui/button';
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import {
    notifyPostInstallFlowChanged,
    POST_INSTALL_FLOW_CHANGED_EVENT,
    POST_INSTALL_FULL_TOUR_DISMISSED_KEY,
    POST_INSTALL_FULL_TOUR_PENDING_KEY,
    POST_INSTALL_TOUR_DISMISSED_KEY,
    POST_INSTALL_TOUR_PENDING_KEY,
    POST_INSTALL_WELCOME_DISMISSED_KEY,
} from './postInstallTourConstants';

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

/**
 * First visit to the dashboard after deployer: welcome card before the sidebar coachmark tour.
 */
export default function WelcomeAfterInstallHost() {
    const [pathname] = useLocation();
    const [, refresh] = useReducer((n: number) => n + 1, 0);
    const basicBtnRef = useRef<HTMLButtonElement>(null);

    const pending = readFlag(POST_INSTALL_TOUR_PENDING_KEY);
    const welcomeDismissed = readFlag(POST_INSTALL_WELCOME_DISMISSED_KEY);
    const tourDismissed = readFlag(POST_INSTALL_TOUR_DISMISSED_KEY);

    const show = pathname === '/' && pending && !welcomeDismissed && !tourDismissed;

    useLayoutEffect(() => {
        if (!show) return;
        basicBtnRef.current?.focus();
    }, [show]);

    const dismissWelcomeOnly = useCallback(() => {
        writeFlag(POST_INSTALL_WELCOME_DISMISSED_KEY, '1');
        notifyPostInstallFlowChanged();
        refresh();
    }, []);

    const skipIntro = useCallback(() => {
        writeFlag(POST_INSTALL_WELCOME_DISMISSED_KEY, '1');
        writeFlag(POST_INSTALL_TOUR_DISMISSED_KEY, '1');
        writeFlag(POST_INSTALL_TOUR_PENDING_KEY, null);
        writeFlag(POST_INSTALL_FULL_TOUR_PENDING_KEY, null);
        notifyPostInstallFlowChanged();
        refresh();
    }, []);

    const startBasicTour = useCallback(() => {
        dismissWelcomeOnly();
    }, [dismissWelcomeOnly]);

    const startFullTour = useCallback(() => {
        writeFlag(POST_INSTALL_WELCOME_DISMISSED_KEY, '1');
        writeFlag(POST_INSTALL_TOUR_PENDING_KEY, null);
        writeFlag(POST_INSTALL_FULL_TOUR_PENDING_KEY, '1');
        writeFlag(POST_INSTALL_FULL_TOUR_DISMISSED_KEY, null);
        notifyPostInstallFlowChanged();
        refresh();
    }, []);

    useEffect(() => {
        const bump = () => refresh();
        window.addEventListener(POST_INSTALL_FLOW_CHANGED_EVENT, bump);
        return () => window.removeEventListener(POST_INSTALL_FLOW_CHANGED_EVENT, bump);
    }, []);

    useEffect(() => {
        if (!show) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                skipIntro();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [show, skipIntro]);

    if (!show) return null;

    const ui = (
        <div
            className="fixed inset-0 flex items-center justify-center p-4 backdrop-blur-[2px]"
            role="presentation"
            style={{
                zIndex: 2147483647,
                backgroundColor: 'rgba(6, 8, 14, 0.78)',
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="fxpanel-welcome-title"
                aria-describedby="fxpanel-welcome-desc"
                style={{ backgroundColor: 'hsl(var(--card))', position: 'relative', zIndex: 1 }}
                className="border-border/60 bg-card w-full max-w-lg rounded-xl border shadow-[0_22px_44px_-16px_rgba(0,0,0,0.65)]"
            >
                <div
                    className="h-px w-full bg-gradient-to-r from-transparent via-[#ec1f6e]/55 to-transparent"
                    aria-hidden="true"
                />
                <div className="px-6 py-5">
                    <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
                        First run
                    </p>
                    <h2
                        id="fxpanel-welcome-title"
                        className="text-foreground mt-2 text-xl leading-tight font-semibold tracking-tight"
                    >
                        Welcome to fxPanel
                    </h2>
                    <p id="fxpanel-welcome-desc" className="text-muted-foreground mt-3 text-sm leading-relaxed">
                        Your server is ready. Take a quick spin through the sidebar with the Basic tour, or pick the
                        Full tour for a guided walkthrough across every major page. You can also skip and explore on
                        your own.
                    </p>
                    <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                        <Button
                            type="button"
                            variant="ghost-muted"
                            size="sm"
                            className="sm:order-1"
                            onClick={skipIntro}
                        >
                            Skip intro
                        </Button>
                        <Button
                            ref={basicBtnRef}
                            type="button"
                            variant="outline-muted"
                            size="sm"
                            className="sm:order-2"
                            onClick={startBasicTour}
                        >
                            Basic tour
                        </Button>
                        <Button type="button" size="sm" className="sm:order-3" onClick={startFullTour}>
                            Full tour
                        </Button>
                    </div>
                    <p className="text-muted-foreground/70 mt-3 text-center text-[11px] sm:text-right">
                        Press Esc to skip intro
                    </p>
                </div>
            </div>
        </div>
    );

    return createPortal(ui, document.body);
}
