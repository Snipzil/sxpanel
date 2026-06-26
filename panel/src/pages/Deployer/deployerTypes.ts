export type RecipeInfo = {
    isTrustedSource: boolean;
    name: string;
    author: string;
    description: string;
    raw: string;
};

export type InputVar = {
    name: string;
    value: string;
    description: string;
};

export type DeployerDefaults = {
    autofilled: boolean;
    license: string;
    mysqlHost: string;
    mysqlPort: string;
    mysqlUser: string;
    mysqlPassword: string;
    mysqlDatabase: string;
};

export type DeployerDataResp = {
    redirect?: string;
    error?: string;
    step: 'review' | 'input' | 'run' | 'configure';
    deploymentID: string;
    requireDBConfig: boolean;
    requiresGithubToken: boolean;
    defaultLicenseKey: string;
    recipe?: RecipeInfo;
    defaults?: DeployerDefaults;
    inputVars?: InputVar[];
    deployPath?: string;
    serverCFG?: string;
};

export type StatusResp = {
    success?: boolean;
    refresh?: boolean;
    progress: number;
    log: string[];
    status: 'running' | 'done' | 'failed';
};

export type ActionResp = {
    success?: boolean;
    type?: string;
    message?: string;
    refresh?: boolean;
    markdown?: boolean;
};
