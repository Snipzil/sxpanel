import type { DeployerWizardDraft } from './deployerFlowTypes';

const WIZARD_DRAFT_KEY = 'sxpanel-deployer-wizard-draft';

export const EMPTY_WIZARD_DRAFT: DeployerWizardDraft = {
    game: null,
    templateMode: null,
    serverName: '',
    selectedRecipe: null,
    remoteRecipeUrl: '',
    remoteRecipeName: '',
    deployPath: '',
    isTrustedSource: true,
    dataFolder: '',
    cfgFile: '',
    localFolderValid: false,
    localCfgValid: false,
};

export function loadWizardDraft(): DeployerWizardDraft {
    try {
        const raw = sessionStorage.getItem(WIZARD_DRAFT_KEY);
        if (!raw) return { ...EMPTY_WIZARD_DRAFT };
        return { ...EMPTY_WIZARD_DRAFT, ...JSON.parse(raw) };
    } catch {
        return { ...EMPTY_WIZARD_DRAFT };
    }
}

export function saveWizardDraft(draft: DeployerWizardDraft) {
    try {
        sessionStorage.setItem(WIZARD_DRAFT_KEY, JSON.stringify(draft));
    } catch {
        // ignore
    }
}

export function clearWizardDraft() {
    try {
        sessionStorage.removeItem(WIZARD_DRAFT_KEY);
    } catch {
        // ignore
    }
}

export function buildDefaultDeployPath(recipeName: string, dataPath = 'C:\\FXServer\\txData') {
    const sanitized = recipeName
        .replace(/[^a-zA-Z0-9]/g, '')
        .substring(0, 12)
        .toLowerCase();
    const ts = Date.now().toString(16);
    return `${dataPath}/${sanitized}_${ts}.base`;
}
