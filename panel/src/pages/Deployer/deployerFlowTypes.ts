import type { DeployerDataResp } from './deployerTypes';
import type { TxAdminRecipeEntry } from './txAdminRecipeIndex';

/** Full install wizard (setup + deployer) shown in DeployerPage. */
export type DeployerFlowStep = 'game' | 'template' | 'review' | 'input' | 'run' | 'configure';

export type GameId = 'fivem' | 'redm';

export type TemplateMode = 'popular' | 'remote' | 'custom' | 'local';

export type DeployerWizardDraft = {
    game: GameId | null;
    templateMode: TemplateMode | null;
    serverName: string;
    selectedRecipe: (TxAdminRecipeEntry & { rawYaml?: string }) | null;
    remoteRecipeUrl: string;
    remoteRecipeName: string;
    deployPath: string;
    isTrustedSource: boolean;
    /** Existing server (local) path */
    dataFolder: string;
    cfgFile: string;
    detectedConfig?: string;
    localFolderValid: boolean;
    localCfgValid: boolean;
};

/** Wizard stepper order (configure before deploy — matches post-variables UX). */
export const DEPLOYER_FLOW_STEPS: { key: DeployerFlowStep; label: string }[] = [
    { key: 'game', label: 'Game' },
    { key: 'template', label: 'Template' },
    { key: 'review', label: 'Review' },
    { key: 'input', label: 'Variables' },
    { key: 'configure', label: 'server.cfg' },
    { key: 'run', label: 'Deploy' },
];

export function deployerDataStepToFlowStep(step: DeployerDataResp['step']): DeployerFlowStep {
    return step;
}

export function flowStepIndex(step: DeployerFlowStep): number {
    return DEPLOYER_FLOW_STEPS.findIndex((s) => s.key === step);
}
