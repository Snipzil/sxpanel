import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import SetupPage from '@/pages/SetupPage';
import DeployerPage from '@/pages/DeployerPage';
import { LogoFullSquareGreen } from '@/components/Logos';
import { cn } from '@/lib/utils';

const ONBOARDING_PATTERN = /^\/server\/(setup|deployer)(\/|$)/;

type OnboardingSlug = 'setup' | 'deployer';
type Phase = 'idle' | 'entering' | 'shown' | 'exiting';

function matchOnboarding(path: string): OnboardingSlug | null {
    const m = ONBOARDING_PATTERN.exec(path);
    return m ? (m[1] as OnboardingSlug) : null;
}

export default function OnboardingOverlay() {
    const [location] = useLocation();
    const matched = matchOnboarding(location);

    // If AddMasterCallback already played the slide animation, skip ours.
    const skipSlide = useRef(sessionStorage.getItem('fxp_onboarding_instant') === '1');
    if (skipSlide.current) sessionStorage.removeItem('fxp_onboarding_instant');

    const initialPhase: Phase = matched ? (skipSlide.current ? 'shown' : 'entering') : 'idle';
    const [phase, setPhase] = useState<Phase>(initialPhase);
    const [stickySlug, setStickySlug] = useState<OnboardingSlug | null>(matched);

    // CSS-transition-driven slide. Two separate pieces of state so the
    // background layer and the panel layer can animate independently.
    const [panelIn, setPanelIn] = useState(skipSlide.current); // skip if flagged
    const [fading, setFading] = useState(false);

    const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const panelTriggeredRef = useRef(skipSlide.current);

    // Trigger the slide-in whenever phase becomes 'entering'
    useEffect(() => {
        if (phase !== 'entering' || panelTriggeredRef.current) return;
        panelTriggeredRef.current = true;
        // Double rAF: ensures the browser paints the initial off-screen
        // position BEFORE we flip panelIn, so the transition actually runs.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => setPanelIn(true));
        });
    }, [phase]);

    useEffect(() => {
        if (matched) {
            if (exitTimerRef.current) {
                clearTimeout(exitTimerRef.current);
                exitTimerRef.current = null;
            }
            setStickySlug(matched);
            setFading(false);
            if (phase === 'idle' || phase === 'exiting') {
                panelTriggeredRef.current = false;
                setPanelIn(false);
                setPhase('entering');
            }
        } else if (phase !== 'idle') {
            setFading(true);
            exitTimerRef.current = setTimeout(() => {
                setPhase('idle');
                setStickySlug(null);
                setPanelIn(false);
                setFading(false);
                panelTriggeredRef.current = false;
            }, 320);
            setPhase('exiting');
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
            className="bg-background fixed inset-0 z-50 overflow-hidden"
            style={{ opacity: fading ? 0 : 1, transition: 'opacity 300ms ease-in' }}
        >
            {/* Layer 2 — the panel that slides in from the right.
                bg-card is slightly lighter than bg-background, giving a
                visible edge as it sweeps across. The shadow reinforces depth. */}
            <div
                className="bg-card flex min-h-screen w-full flex-col overflow-auto"
                style={{
                    transform: panelIn ? 'translateX(0%)' : 'translateX(100%)',
                    transition: 'transform 500ms cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: '-32px 0 80px rgba(0,0,0,0.45)',
                }}
                onTransitionEnd={() => {
                    if (phase === 'entering' && panelIn) setPhase('shown');
                }}
            >
                {/* Header bar — always visible once panel arrives */}
                <div className="border-border/40 flex shrink-0 items-center gap-3 border-b px-6 py-4">
                    <LogoFullSquareGreen className="h-8 w-auto opacity-90" />
                    <span className="text-muted-foreground text-xs tracking-wide uppercase">First-time setup</span>
                </div>

                {/* Setup content flies up after the panel finishes sliding */}
                {showContent && (
                    <div className="animate-in slide-in-from-bottom-8 fade-in-0 flex flex-1 justify-center duration-500 ease-out">
                        {stickySlug === 'setup' && <SetupPage />}
                        {stickySlug === 'deployer' && <DeployerPage />}
                    </div>
                )}
            </div>
        </div>
    );
}
