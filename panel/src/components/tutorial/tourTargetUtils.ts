import type { TourStep } from './tourSteps';

export const isUsableTargetElement = (el: Element | null): el is HTMLElement => {
    if (!el || !(el instanceof HTMLElement)) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    return true;
};

export const findNextUsableStepIndex = (steps: TourStep[], start: number, direction: 1 | -1): number => {
    const lastIndex = steps.length - 1;
    let i = start;
    while (i >= 0 && i <= lastIndex) {
        const step = steps[i];
        if (!step.targetSelector) {
            return i;
        }
        const el = document.querySelector(step.targetSelector);
        if (isUsableTargetElement(el)) {
            return i;
        }
        if (import.meta.env.DEV) {
            console.warn(
                `[PostInstallTour] Skipping step "${step.title}": target not found or not visible (${step.targetSelector})`,
            );
        }
        i += direction;
    }
    return direction > 0 ? lastIndex : 0;
};
