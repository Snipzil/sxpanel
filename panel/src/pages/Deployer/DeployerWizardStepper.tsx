import { CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DEPLOYER_FLOW_STEPS, flowStepIndex, type DeployerFlowStep } from './deployerFlowTypes';

/**
 * Labeled horizontal stepper rendered inside the wizard header band.
 * Labels are visible from the sm breakpoint (V1 hid them behind tooltips);
 * mobile keeps a compact "Step X of Y — label" line instead.
 */
export function DeployerWizardStepper({
    currentStep,
    interactive,
    onStepClick,
}: {
    currentStep: DeployerFlowStep;
    interactive?: boolean;
    onStepClick?: (step: DeployerFlowStep) => void;
}) {
    const activeIndex = flowStepIndex(currentStep);
    const currentMeta = DEPLOYER_FLOW_STEPS[activeIndex];

    const isStepDone = (key: DeployerFlowStep) =>
        (currentStep === 'configure' && key === 'run') ||
        (currentStep === 'run' && key === 'configure' ? false : flowStepIndex(key) < flowStepIndex(currentStep));

    return (
        <div className="space-y-1.5">
            <ol className="flex items-center" aria-label="Install progress">
                {DEPLOYER_FLOW_STEPS.map((meta, i) => {
                    const isActive = meta.key === currentStep;
                    const isDone = isStepDone(meta.key);
                    const isLast = i === DEPLOYER_FLOW_STEPS.length - 1;

                    const dot = (
                        <span
                            className={cn(
                                'flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-colors',
                                isDone && 'bg-primary text-primary-foreground',
                                isActive && !isDone && 'border-primary text-primary bg-background border-2',
                                !isActive && !isDone && 'border-border text-muted-foreground bg-background border',
                            )}
                            aria-hidden="true"
                        >
                            {isDone ? <CheckIcon className="size-3" /> : i + 1}
                        </span>
                    );

                    const label = (
                        <span
                            className={cn(
                                'hidden truncate text-xs sm:inline',
                                isActive ? 'text-foreground font-semibold' : 'text-muted-foreground',
                                isDone && 'text-foreground/80',
                            )}
                        >
                            {meta.label}
                        </span>
                    );

                    return (
                        <li
                            key={meta.key}
                            className={cn('flex min-w-0 items-center', !isLast && 'flex-1')}
                            aria-current={isActive ? 'step' : undefined}
                        >
                            {interactive && onStepClick ? (
                                <button
                                    type="button"
                                    onClick={() => onStepClick(meta.key)}
                                    aria-label={`Go to step ${i + 1}: ${meta.label}`}
                                    className={cn(
                                        'focus-visible:ring-ring flex min-w-0 items-center gap-1.5 rounded-full p-0.5 transition-colors focus-visible:ring-2 focus-visible:outline-hidden',
                                        isActive && 'ring-primary/30 ring-2',
                                        !isActive && 'hover:bg-muted/40',
                                    )}
                                >
                                    {dot}
                                    {label}
                                </button>
                            ) : (
                                <span className="flex min-w-0 items-center gap-1.5 p-0.5">
                                    {dot}
                                    {label}
                                </span>
                            )}
                            {!isLast && (
                                <span
                                    className={cn(
                                        'mx-1.5 h-px min-w-3 flex-1 sm:mx-2',
                                        isDone ? 'bg-primary/60' : 'bg-border',
                                    )}
                                    aria-hidden="true"
                                />
                            )}
                        </li>
                    );
                })}
            </ol>
            <p className="text-muted-foreground text-center text-[11px] sm:hidden">
                Step {activeIndex + 1} of {DEPLOYER_FLOW_STEPS.length}
                {currentMeta ? (
                    <>
                        {' '}
                        — <span className="text-foreground font-medium">{currentMeta.label}</span>
                    </>
                ) : null}
            </p>
        </div>
    );
}
