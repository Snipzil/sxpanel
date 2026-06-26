import { navigate } from 'wouter/use-browser-location';
import { DEPLOYER_PREVIEW_NAV_EVENT } from './deployerPreviewEvents';
import type { DeployerFlowStep } from './deployerFlowTypes';
import type { TxAdminRecipeEntry } from './txAdminRecipeIndex';
import { loadWizardDraft, saveWizardDraft } from './deployerWizardState';

/** @deprecated Use wizard draft `selectedRecipe` — kept for older imports / HMR chunks */
export type StoredPreviewRecipe = TxAdminRecipeEntry & { rawYaml?: string };

/** @deprecated Use `loadWizardDraft().selectedRecipe` */
export function loadStoredPreviewRecipe(): StoredPreviewRecipe | null {
    return loadWizardDraft().selectedRecipe;
}

/** @deprecated Use `saveWizardDraft` with a `selectedRecipe` patch */
export function saveStoredPreviewRecipe(recipe: StoredPreviewRecipe | null) {
    const draft = loadWizardDraft();
    saveWizardDraft({ ...draft, selectedRecipe: recipe });
}

export type DeployPreviewStep = DeployerFlowStep;

/** Preview walkthrough: edit server.cfg before the deploy run screen. */
const PREVIEW_STEPS: DeployPreviewStep[] = ['game', 'template', 'review', 'input', 'configure', 'run'];

export function isDeployPreviewQueryActive() {
    if (!import.meta.env.DEV) return false;
    return readDevPreviewStep() !== null;
}

export function readDevPreviewStep(): DeployPreviewStep | null {
    if (!import.meta.env.DEV) return null;
    const q = new URLSearchParams(window.location.search).get('devPreview');
    if (q === 'choose') return 'template';
    if (q && PREVIEW_STEPS.includes(q as DeployPreviewStep)) return q as DeployPreviewStep;
    return null;
}

export function goDeployerPreviewStep(step: DeployPreviewStep) {
    const url = new URL(window.location.href);
    url.searchParams.set('devPreview', step);
    navigate(url.pathname + url.search);
    window.dispatchEvent(new Event(DEPLOYER_PREVIEW_NAV_EVENT));
}

export const PREVIEW_STEP_ORDER: DeployPreviewStep[] = PREVIEW_STEPS;

export function nextDeployPreviewStep(current: DeployPreviewStep): DeployPreviewStep | null {
    const i = PREVIEW_STEP_ORDER.indexOf(current);
    if (i < 0 || i >= PREVIEW_STEP_ORDER.length - 1) return null;
    return PREVIEW_STEP_ORDER[i + 1];
}

export function prevDeployPreviewStep(current: DeployPreviewStep): DeployPreviewStep | null {
    const i = PREVIEW_STEP_ORDER.indexOf(current);
    if (i <= 0) return null;
    return PREVIEW_STEP_ORDER[i - 1];
}

export function previewStepRequiresTemplate(step: DeployPreviewStep) {
    return step !== 'game' && step !== 'template';
}

export function previewDraftReadyForReview(draft: {
    game: string | null;
    templateMode: string | null;
    selectedRecipe?: { url?: string } | null;
    remoteRecipeName?: string;
    deployPath?: string;
    localFolderValid?: boolean;
    localCfgValid?: boolean;
}) {
    if (!draft.game || !draft.templateMode) return false;
    if (draft.templateMode === 'local') {
        return Boolean(draft.localFolderValid && draft.localCfgValid);
    }
    const hasDeployPath = Boolean(draft.deployPath?.trim());
    if (draft.templateMode === 'popular') {
        return Boolean(draft.selectedRecipe && hasDeployPath);
    }
    if (draft.templateMode === 'remote') {
        return Boolean(draft.remoteRecipeName && hasDeployPath);
    }
    if (draft.templateMode === 'custom') return hasDeployPath;
    return false;
}
