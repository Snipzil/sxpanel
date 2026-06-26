import type { ReactNode } from 'react';
import { RocketIcon } from 'lucide-react';
import { DeployerWizardStepper } from './DeployerWizardStepper';
import type { DeployerFlowStep } from './deployerFlowTypes';

/**
 * Wizard chrome for the install/deploy flow — a single V2 header band
 * (icon tile + title + integrated labeled stepper) above the step content
 * card, replacing the previous three stacked mini-cards.
 */
export function DeployerWizardShell({
    currentStep,
    subtitle,
    previewBanner,
    interactiveStepper,
    onStepClick,
    children,
}: {
    currentStep: DeployerFlowStep;
    subtitle?: string;
    previewBanner?: ReactNode;
    interactiveStepper?: boolean;
    onStepClick?: (step: DeployerFlowStep) => void;
    children: ReactNode;
}) {
    return (
        <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col gap-3">
            {/* Header band with integrated stepper */}
            <div className="border-border/60 bg-card shrink-0 rounded-xl border shadow-sm">
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-xl">
                            <RocketIcon className="text-foreground size-5" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-foreground truncate text-lg font-semibold tracking-tight">
                                Server install
                            </h1>
                            <p className="text-muted-foreground mt-0.5 truncate text-xs">
                                {subtitle ?? 'Recipe deployer'}
                            </p>
                        </div>
                    </div>
                    {previewBanner}
                </div>
                <div className="border-border/40 border-t px-4 py-3">
                    <DeployerWizardStepper
                        currentStep={currentStep}
                        interactive={interactiveStepper}
                        onStepClick={onStepClick}
                    />
                </div>
            </div>

            {/* Step content card */}
            <div className="border-border/60 bg-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border p-4 shadow-sm">
                {children}
            </div>
        </div>
    );
}
