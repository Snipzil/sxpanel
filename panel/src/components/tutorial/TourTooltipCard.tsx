import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { XIcon } from 'lucide-react';
import {
    type KeyboardEvent as ReactKeyboardEvent,
    type RefObject,
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';

const FOCUSABLE_SELECTOR =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const getVisibleFocusables = (root: HTMLElement): HTMLElement[] => {
    return [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    });
};

const useFocusTrap = (active: boolean, containerRef: RefObject<HTMLElement | null>) => {
    useEffect(() => {
        if (!active) return;
        const container = containerRef.current;
        if (!container) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return;
            const focusables = getVisibleFocusables(container);
            if (focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey) {
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            } else if (document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [active, containerRef]);
};

export type TourTooltipCardProps = {
    stepIndex: number;
    stepTotal: number;
    title: string;
    description: string;
    canGoBack: boolean;
    continueLabel: string;
    onSkip: () => void;
    onBack: () => void;
    onContinue: () => void;
    /** Bump to move focus to Continue */
    focusGeneration: number;
    /** Override the default 360px width (e.g. when the card sits beside a modal). */
    width?: number;
    className?: string;
};

const tourControlFocusClass =
    'focus-visible:ring-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/45';

export function TourTooltipCard({
    stepIndex,
    stepTotal,
    title,
    description,
    canGoBack,
    continueLabel,
    onSkip,
    onBack,
    onContinue,
    focusGeneration,
    width,
    className,
}: TourTooltipCardProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const continueRef = useRef<HTMLButtonElement>(null);
    const skipPendingTimerRef = useRef<number | null>(null);
    const [skipPending, setSkipPending] = useState(false);
    const baseId = useId();
    const titleId = `${baseId}-title`;
    const descId = `${baseId}-desc`;
    const liveId = `${baseId}-live`;

    useFocusTrap(true, rootRef);

    useLayoutEffect(() => {
        continueRef.current?.focus();
    }, [focusGeneration]);

    useEffect(() => {
        return () => {
            if (skipPendingTimerRef.current !== null) {
                window.clearTimeout(skipPendingTimerRef.current);
                skipPendingTimerRef.current = null;
            }
        };
    }, []);

    const handleSkipClick = () => {
        if (skipPending) {
            if (skipPendingTimerRef.current !== null) {
                window.clearTimeout(skipPendingTimerRef.current);
                skipPendingTimerRef.current = null;
            }
            setSkipPending(false);
            onSkip();
            return;
        }
        setSkipPending(true);
        skipPendingTimerRef.current = window.setTimeout(() => {
            skipPendingTimerRef.current = null;
            setSkipPending(false);
        }, 3000);
    };

    const onCardKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Enter') {
            const t = e.target as HTMLElement | null;
            if (t?.closest('button, a, input, textarea, select')) {
                return;
            }
            e.preventDefault();
            onContinue();
        }
    };

    const stepHuman = stepIndex + 1;

    return (
        <div
            ref={rootRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            onKeyDown={onCardKeyDown}
            style={{
                backgroundColor: 'hsl(var(--card))',
                width: width ?? undefined,
            }}
            className={cn(
                'animate-in zoom-in-95 fade-in-0 border-border/60 bg-card relative max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border shadow-[0_22px_44px_-16px_rgba(0,0,0,0.65)] duration-200',
                width === undefined && 'w-[360px]',
                className,
            )}
        >
            <p id={liveId} className="sr-only" aria-live="polite" aria-atomic="true">
                Step {stepHuman} of {stepTotal}: {title}
            </p>
            <div
                className="h-px w-full bg-gradient-to-r from-transparent via-[#ec1f6e]/55 to-transparent"
                aria-hidden="true"
            />
            <div className="border-border/50 flex items-center justify-between gap-3 border-b px-4 py-3">
                <div className="flex min-w-0 flex-1 items-baseline gap-x-2">
                    <p className="text-muted-foreground text-[11px] leading-none font-semibold tracking-[0.14em] uppercase">
                        Panel tour
                    </p>
                    <span
                        className="text-muted-foreground/70 text-[11px] leading-none font-medium tabular-nums"
                        aria-hidden="true"
                    >
                        {stepHuman}/{stepTotal}
                    </span>
                </div>
                <Button
                    type="button"
                    variant={skipPending ? 'outline-muted' : 'ghost-muted'}
                    size="sm"
                    onClick={handleSkipClick}
                    aria-label={skipPending ? 'Confirm skip tour — click again to dismiss' : 'Skip tour'}
                    aria-pressed={skipPending}
                    title={skipPending ? 'Click again to skip the tour' : 'Skip tour (Esc)'}
                    className={cn(
                        tourControlFocusClass,
                        'h-8 shrink-0 gap-1 rounded-md px-2 text-xs font-medium transition-colors',
                        !skipPending && 'text-muted-foreground hover:text-foreground',
                        skipPending && 'text-foreground border-[#ec1f6e]/55 hover:bg-[#ec1f6e]/10',
                    )}
                >
                    {skipPending ? 'Click again' : 'Skip'}
                    {skipPending ? null : <XIcon className="size-3.5 opacity-80" aria-hidden="true" />}
                </Button>
            </div>
            <div className="px-4 py-4">
                <h2 id={titleId} className="text-foreground text-base leading-tight font-semibold tracking-tight">
                    {title}
                </h2>
                <p id={descId} className="text-muted-foreground mt-2 text-sm leading-relaxed">
                    {description}
                </p>
                <div className="mt-4 flex items-center justify-end gap-2">
                    {canGoBack ? (
                        <Button
                            type="button"
                            variant="outline-muted"
                            size="sm"
                            onClick={onBack}
                            className={tourControlFocusClass}
                        >
                            Back
                        </Button>
                    ) : null}
                    <Button
                        ref={continueRef}
                        type="button"
                        size="sm"
                        className={cn(tourControlFocusClass, 'min-w-[5.25rem] font-medium')}
                        onClick={onContinue}
                    >
                        {continueLabel}
                    </Button>
                </div>
            </div>
        </div>
    );
}
