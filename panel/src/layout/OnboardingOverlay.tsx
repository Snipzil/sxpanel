import { lazy, Suspense, useEffect, useReducer, useRef } from 'react';
import { useLocation } from 'wouter';
import GenericSpinner from '@/components/GenericSpinner';
import { LogoFullSquareGreen } from '@/components/Logos';

const SetupPage = lazy(() => import('@/pages/SetupPage'));
const DeployerPage = lazy(() => import('@/pages/Deployer/DeployerPage'));

const ONBOARDING_PATTERN = /^\/server\/(setup|deployer)(\/|$)/;

type OnboardingSlug = 'setup' | 'deployer';
type Phase = 'idle' | 'entering' | 'shown' | 'exiting';

type OverlayState = {
    phase: Phase;
    stickySlug: OnboardingSlug | null;
    panelIn: boolean;
    fading: boolean;
};

type OverlayAction =
    | { type: 'syncMatched'; slug: OnboardingSlug }
    | { type: 'panelIn' }
    | { type: 'panelShown' }
    | { type: 'startExit' }
    | { type: 'finishExit' };

function matchOnboarding(path: string): OnboardingSlug | null {
    const m = ONBOARDING_PATTERN.exec(path);
    return m ? (m[1] as OnboardingSlug) : null;
}

function createInitialState(matched: OnboardingSlug | null, skipSlide: boolean): OverlayState {
    return {
        phase: matched ? (skipSlide ? 'shown' : 'entering') : 'idle',
        stickySlug: matched,
        panelIn: skipSlide,
        fading: false,
    };
}

function overlayReducer(state: OverlayState, action: OverlayAction): OverlayState {
    switch (action.type) {
        case 'syncMatched':
            if (state.phase === 'idle' || state.phase === 'exiting') {
                return {
                    ...state,
                    phase: 'entering',
                    stickySlug: action.slug,
                    panelIn: false,
                    fading: false,
                };
            }

            return {
                ...state,
                stickySlug: action.slug,
                fading: false,
            };
        case 'panelIn':
            return {
                ...state,
                panelIn: true,
            };
        case 'panelShown':
            if (state.phase !== 'entering' || !state.panelIn) return state;
            return {
                ...state,
                phase: 'shown',
            };
        case 'startExit':
            if (state.phase === 'idle') return state;
            return {
                ...state,
                phase: 'exiting',
                fading: true,
            };
        case 'finishExit':
            return {
                phase: 'idle',
                stickySlug: null,
                panelIn: false,
                fading: false,
            };
        default:
            return state;
    }
}

function OnboardingPageFallback() {
    return (
        <div className="flex w-full justify-center py-16">
            <GenericSpinner />
        </div>
    );
}

export default function OnboardingOverlay() {
    const [location] = useLocation();
    const matched = matchOnboarding(location);

    // If AddMasterCallback already played the slide animation, skip ours.
    const skipSlide = useRef(sessionStorage.getItem('fxp_onboarding_instant') === '1');
    if (skipSlide.current) sessionStorage.removeItem('fxp_onboarding_instant');

    const [state, dispatch] = useReducer(overlayReducer, createInitialState(matched, skipSlide.current));
    const { phase, stickySlug, panelIn, fading } = state;

    const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const panelTriggeredRef = useRef(skipSlide.current);

    // Trigger the slide-in whenever phase becomes 'entering'
    useEffect(() => {
        if (phase !== 'entering' || panelTriggeredRef.current) return;
        panelTriggeredRef.current = true;
        // Double rAF: ensures the browser paints the initial off-screen
        // position BEFORE we flip panelIn, so the transition actually runs.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => dispatch({ type: 'panelIn' }));
        });
    }, [phase]);

    useEffect(() => {
        if (matched) {
            if (exitTimerRef.current) {
                clearTimeout(exitTimerRef.current);
                exitTimerRef.current = null;
            }
            if (phase === 'idle' || phase === 'exiting') {
                panelTriggeredRef.current = false;
            }
            dispatch({ type: 'syncMatched', slug: matched });
        } else if (phase !== 'idle') {
            dispatch({ type: 'startExit' });
            exitTimerRef.current = setTimeout(() => {
                panelTriggeredRef.current = false;
                dispatch({ type: 'finishExit' });
            }, 320);
        }
        return () => {
            if (exitTimerRef.current) {
                clearTimeout(exitTimerRef.current);
                exitTimerRef.current = null;
            }
        };
    }, [matched]);

    if (phase === 'idle') return null;

    const showContent = phase === 'shown' || phase === 'exiting';

    return (
        // Layer 1 — instant full-screen cover.
        // Same bg-background colour as the auth shell so there's no flash.
        // Sidebar/header/playerlist never show through this.
        <div
            className="bg-background fixed inset-0 z-50 flex flex-col overflow-hidden"
            style={{ opacity: fading ? 0 : 1, transition: 'opacity 300ms ease-in' }}
        >
            {/* Layer 2 — the panel that slides in from the right.
                bg-card is slightly lighter than bg-background, giving a
                visible edge as it sweeps across. The shadow reinforces depth.
                Height is locked to the viewport; only the content region scrolls. */}
            <div
                className="bg-card flex h-full min-h-0 w-full flex-col"
                style={{
                    transform: panelIn ? 'translateX(0%)' : 'translateX(100%)',
                    transition: 'transform 500ms cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: '-32px 0 80px rgba(0,0,0,0.45)',
                }}
                onTransitionEnd={() => {
                    if (phase === 'entering' && panelIn) dispatch({ type: 'panelShown' });
                }}
            >
                {/* Header bar — always visible once panel arrives */}
                <div className="border-border/40 flex shrink-0 items-center gap-3 border-b px-6 py-4">
                    <LogoFullSquareGreen className="h-8 w-auto opacity-90" />
                    <span className="text-muted-foreground text-xs tracking-wide uppercase">First-time setup</span>
                </div>

                {showContent && stickySlug === 'setup' && (
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                        <div className="animate-in slide-in-from-bottom-8 fade-in-0 flex justify-center px-4 py-6 duration-500 ease-out sm:px-6">
                            <Suspense fallback={<OnboardingPageFallback />}>
                                <SetupPage />
                            </Suspense>
                        </div>
                    </div>
                )}
                {showContent && stickySlug === 'deployer' && (
                    <div className="animate-in slide-in-from-bottom-8 fade-in-0 flex min-h-0 flex-1 justify-center overflow-hidden px-4 py-3 duration-500 ease-out sm:px-6">
                        <div className="h-full min-h-0 w-full max-w-4xl">
                            <Suspense fallback={<OnboardingPageFallback />}>
                                <DeployerPage />
                            </Suspense>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
