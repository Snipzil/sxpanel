import type { DeployerDataResp } from './deployerTypes';
import type { DeployerWizardDraft } from './deployerFlowTypes';

const FALLBACK_RECIPE_RAW = `name: Preview Recipe
author: fxPanel
version: '1.0'
tasks:
  - action: download_github
    src: https://github.com/example/resource
`;

const CUSTOM_RECIPE_RAW = `name: Custom Template
author: you
version: '1.0'
tasks: []
`;

export function buildMockDeployerData(step: DeployerDataResp['step'], draft: DeployerWizardDraft): DeployerDataResp {
    const recipeName =
        draft.selectedRecipe?.name ??
        draft.remoteRecipeName ??
        (draft.templateMode === 'custom' ? 'Custom Template' : 'Preview Recipe');
    const recipeAuthor = draft.selectedRecipe?.author ?? 'fxPanel fixtures';
    const recipeDescription =
        draft.selectedRecipe?.description ??
        (draft.templateMode === 'remote'
            ? `Remote recipe from ${draft.remoteRecipeUrl || 'URL'}`
            : 'Dev preview — edit on the review step.');

    let raw = draft.selectedRecipe?.rawYaml ?? FALLBACK_RECIPE_RAW;
    if (draft.templateMode === 'custom' && !draft.selectedRecipe?.rawYaml) {
        raw = CUSTOM_RECIPE_RAW;
    } else if (draft.templateMode === 'remote' && !draft.selectedRecipe?.rawYaml) {
        raw = `# ${recipeName}\n# ${draft.remoteRecipeUrl}\n`;
    }

    return {
        step,
        deploymentID: 'dev-preview-mock',
        requireDBConfig: true,
        requiresGithubToken: draft.templateMode === 'remote',
        defaultLicenseKey: 'cfxk_dev_preview_xxxxxxxx',
        recipe: {
            isTrustedSource: draft.isTrustedSource,
            name: recipeName,
            author: recipeAuthor,
            description: recipeDescription,
            raw,
        },
        defaults: {
            autofilled: true,
            license: 'cfxk_dev_preview_xxxxxxxx',
            mysqlHost: '127.0.0.1',
            mysqlPort: '3306',
            mysqlUser: 'fxpanel',
            mysqlPassword: '••••••••',
            mysqlDatabase: 'fxpanel_preview',
        },
        inputVars: [
            {
                name: 'SERVER_NAME',
                value: draft.serverName || 'Preview City RP',
                description: 'Shown in the server list.',
            },
        ],
        deployPath: draft.deployPath || 'C:\\\\FXServer\\\\txData\\\\Preview.server',
        serverCFG: [
            '## Preview server.cfg (dev only)',
            'endpoint_add_tcp "0.0.0.0:30120"',
            `sv_hostname "${draft.serverName || 'Preview City'}"`,
            'sets sv_projectName "fxPanel preview"',
            'sv_licenseKey "cfxk_dev_preview_xxxxxxxx"',
            'ensure oxmysql',
            'ensure qb-core',
        ].join('\n'),
    };
}

export const MOCK_DEPLOY_LOG_LINES = [
    '[preview] Resolving recipe…',
    '[preview] Validating host prerequisites',
    '[preview] Checking disk space — OK',
    '[preview] Connecting to database — OK',
    '[preview] Downloading github:example/resource (simulated)',
    '[preview] Extracting resources…',
    '[preview] Writing server artifacts…',
    '[preview] Running post-install hooks…',
    '[preview] Done (mock).',
];
