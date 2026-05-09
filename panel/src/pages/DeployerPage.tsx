import { useCallback, useEffect, useRef, useState } from 'react';
import { useBackendApi, ApiTimeout } from '@/hooks/fetch';
import { txToast } from '@/components/TxToaster';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2Icon, ChevronRightIcon, ChevronLeftIcon, CheckIcon, XIcon } from 'lucide-react';
import useSWR from 'swr';
import { navigate as setLocation } from 'wouter/use-browser-location';
import { LazyMonacoEditor } from '@/components/LazyMonacoEditor';

// - -  Types - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
type RecipeInfo = {
    isTrustedSource: boolean;
    name: string;
    author: string;
    description: string;
    raw: string;
};

type InputVar = {
    name: string;
    value: string;
    description: string;
};

type DeployerDefaults = {
    autofilled: boolean;
    license: string;
    mysqlHost: string;
    mysqlPort: string;
    mysqlUser: string;
    mysqlPassword: string;
    mysqlDatabase: string;
};

type DeployerDataResp = {
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

type StatusResp = {
    success?: boolean;
    refresh?: boolean;
    progress: number;
    log: string[];
    status: 'running' | 'done' | 'failed';
};

type ActionResp = {
    success?: boolean;
    type?: string;
    message?: string;
    refresh?: boolean;
    markdown?: boolean;
};

// - -  Step: Review - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
function StepReview({
    recipe,
    onConfirm,
    onCancel,
}: {
    recipe: RecipeInfo;
    onConfirm: (editedRecipe: string) => void;
    onCancel: () => void;
}) {
    const [recipeText, setRecipeText] = useState(recipe.raw);
    const [showEditor, setShowEditor] = useState(false);

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-semibold">Review Recipe</h2>
            {!recipe.isTrustedSource && (
                <div className="border-warning/30 bg-warning-hint rounded-lg border p-3 text-sm">
                    <strong>Warning:</strong> This recipe is from an untrusted source. Review the contents carefully
                    before proceeding.
                </div>
            )}
            <div className="bg-muted/50 space-y-1 rounded-lg p-4 text-sm">
                <p>
                    <strong>Name:</strong> {recipe.name}
                </p>
                <p>
                    <strong>Author:</strong> {recipe.author}
                </p>
                <p>
                    <strong>Description:</strong> {recipe.description}
                </p>
            </div>
            <div>
                <Button variant="outline" size="sm" onClick={() => setShowEditor(!showEditor)} className="mb-2">
                    {showEditor ? 'Hide' : 'Show'} Recipe Source
                </Button>
                {showEditor && (
                    <div className="h-80 overflow-hidden rounded-lg border">
                        <LazyMonacoEditor
                            language="yaml"
                            value={recipeText}
                            onChange={(v) => setRecipeText(v ?? '')}
                            options={{ minimap: { enabled: false }, wordWrap: 'on', lineNumbers: 'on' }}
                        />
                    </div>
                )}
            </div>
            <div className="flex justify-between">
                <Button variant="outline" onClick={onCancel}>
                    <XIcon className="mr-1 h-4 w-4" /> Cancel
                </Button>
                <Button onClick={() => onConfirm(recipeText)}>
                    Next <ChevronRightIcon className="ml-1 h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}

// - -  Step: Input - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
function StepInput({
    requireDBConfig,
    requiresGithubToken,
    defaults,
    inputVars,
    defaultLicenseKey,
    onSubmit,
    onBack,
    onCancel,
}: {
    requireDBConfig: boolean;
    requiresGithubToken: boolean;
    defaults?: DeployerDefaults;
    inputVars?: InputVar[];
    defaultLicenseKey: string;
    onSubmit: (vars: Record<string, any>) => void;
    onBack: () => void;
    onCancel: () => void;
}) {
    const [svLicense, setSvLicense] = useState(defaultLicenseKey);
    const [dbHost, setDbHost] = useState(defaults?.mysqlHost ?? 'localhost');
    const [dbPort, setDbPort] = useState(defaults?.mysqlPort ?? '3306');
    const [dbUser, setDbUser] = useState(defaults?.mysqlUser ?? 'root');
    const [dbPassword, setDbPassword] = useState(defaults?.mysqlPassword ?? '');
    const [dbName, setDbName] = useState(defaults?.mysqlDatabase ?? '');
    const [dbDelete, setDbDelete] = useState(false);
    const [githubToken, setGithubToken] = useState('');
    const [customVars, setCustomVars] = useState<Record<string, string>>(() => {
        const initial: Record<string, string> = {};
        inputVars?.forEach((v) => {
            initial[v.name] = v.value;
        });
        return initial;
    });

    const handleSubmit = () => {
        const vars: Record<string, any> = { svLicense };
        if (requireDBConfig) {
            vars.dbHost = dbHost;
            vars.dbPort = dbPort;
            vars.dbUsername = dbUser;
            vars.dbPassword = dbPassword;
            vars.dbName = dbName;
            vars.dbDelete = dbDelete ? 'true' : 'false';
        }
        if (requiresGithubToken) {
            vars.githubToken = githubToken;
        }
        Object.entries(customVars).forEach(([k, v]) => {
            vars[k] = v;
        });
        onSubmit(vars);
    };

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-semibold">Recipe Variables</h2>
            {defaults?.autofilled && (
                <div className="border-info/30 bg-info/10 rounded-lg border p-3 text-sm">
                    Some fields have been auto-filled from your host configuration.
                </div>
            )}

            {/* License Key */}
            <div className="space-y-1">
                <label htmlFor="sv_licenseKey" className="text-sm font-medium">
                    Server License Key (sv_licenseKey)
                </label>
                <Input
                    id="sv_licenseKey"
                    value={svLicense}
                    onChange={(e) => setSvLicense(e.target.value)}
                    placeholder="cfxk_..."
                />
                <p className="text-muted-foreground text-xs">
                    Get one at{' '}
                    <a
                        href="https://portal.cfx.re/servers/registration-keys"
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline"
                    >
                        portal.cfx.re
                    </a>
                </p>
            </div>

            {/* Database Config */}
            {requireDBConfig && (
                <div className="space-y-3 rounded-lg border p-4">
                    <h3 className="text-sm font-semibold">Database Configuration</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label htmlFor="db_host" className="text-xs font-medium">
                                Host
                            </label>
                            <Input id="db_host" value={dbHost} onChange={(e) => setDbHost(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <label htmlFor="db_port" className="text-xs font-medium">
                                Port
                            </label>
                            <Input id="db_port" value={dbPort} onChange={(e) => setDbPort(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <label htmlFor="db_user" className="text-xs font-medium">
                                Username
                            </label>
                            <Input id="db_user" value={dbUser} onChange={(e) => setDbUser(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <label htmlFor="db_password" className="text-xs font-medium">
                                Password
                            </label>
                            <Input
                                id="db_password"
                                type="password"
                                value={dbPassword}
                                onChange={(e) => setDbPassword(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label htmlFor="db_name" className="text-xs font-medium">
                            Database Name
                        </label>
                        <Input id="db_name" value={dbName} onChange={(e) => setDbName(e.target.value)} />
                    </div>
                    <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={dbDelete} onChange={(e) => setDbDelete(e.target.checked)} />
                        Delete existing database if it exists (use with caution!)
                    </label>
                </div>
            )}

            {/* GitHub Token */}
            {requiresGithubToken && (
                <div className="space-y-1">
                    <label htmlFor="github_token" className="text-sm font-medium">
                        GitHub Token
                    </label>
                    <Input
                        id="github_token"
                        value={githubToken}
                        onChange={(e) => setGithubToken(e.target.value)}
                        placeholder="ghp_..."
                    />
                    <p className="text-muted-foreground text-xs">Required to download private recipe resources.</p>
                </div>
            )}

            {/* Custom Variables */}
            {inputVars && inputVars.length > 0 && (
                <div className="space-y-3 rounded-lg border p-4">
                    <h3 className="text-sm font-semibold">Custom Variables</h3>
                    {inputVars.map((v) => (
                        <div key={v.name} className="space-y-1">
                            <label className="text-xs font-medium">{v.name}</label>
                            {v.description && <p className="text-muted-foreground text-xs">{v.description}</p>}
                            <Input
                                value={customVars[v.name] ?? ''}
                                onChange={(e) => setCustomVars((prev) => ({ ...prev, [v.name]: e.target.value }))}
                            />
                        </div>
                    ))}
                </div>
            )}

            <div className="flex justify-between">
                <div className="flex gap-2">
                    <Button variant="outline" onClick={onBack}>
                        <ChevronLeftIcon className="mr-1 h-4 w-4" /> Back
                    </Button>
                    <Button variant="outline" onClick={onCancel}>
                        <XIcon className="mr-1 h-4 w-4" /> Cancel
                    </Button>
                </div>
                <Button onClick={handleSubmit}>
                    Run Recipe <ChevronRightIcon className="ml-1 h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}

// - -  Step: Run - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
function StepRun({ deployPath, onDone, onCancel }: { deployPath: string; onDone: () => void; onCancel: () => void }) {
    const [log, setLog] = useState<string[]>([]);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState<'running' | 'done' | 'failed'>('running');
    const [statusError, setStatusError] = useState<string | null>(null);
    const logEndRef = useRef<HTMLDivElement>(null);

    const statusApi = useBackendApi<StatusResp>({
        method: 'GET',
        path: '/deployer/status',
    });

    useEffect(() => {
        const MAX_POLL_RETRIES = 10;
        let cancelled = false;
        let failureCount = 0;
        const poll = () => {
            if (cancelled) return;
            statusApi({
                success(data) {
                    if (cancelled) return;
                    failureCount = 0;
                    if (data.refresh) {
                        window.location.reload();
                        return;
                    }
                    setLog(data.log || []);
                    setProgress(data.progress || 0);
                    setStatus(data.status);
                    setStatusError(null);
                    if (data.status === 'running') {
                        setTimeout(poll, 1000);
                    }
                },
                error(msg) {
                    if (cancelled) return;
                    failureCount++;
                    if (failureCount >= MAX_POLL_RETRIES) {
                        setStatusError(msg || 'Lost connection to the server after multiple retries.');
                        return;
                    }
                    const delay = Math.min(1000 * Math.pow(2, failureCount - 1), 30000);
                    setTimeout(poll, delay);
                },
            });
        };
        poll();
        return () => {
            cancelled = true;
        };
    }, [statusApi]);

    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [log]);

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-semibold">Running Recipe</h2>
            <div className="text-muted-foreground text-sm">
                Deploying to: <code className="text-xs">{deployPath}</code>
            </div>

            {/* Progress bar */}
            <div className="bg-muted h-3 overflow-hidden rounded-full">
                <div
                    className={`h-full rounded-full transition-all duration-300 ${
                        status === 'failed' ? 'bg-destructive' : status === 'done' ? 'bg-green-500' : 'bg-primary'
                    }`}
                    style={{ width: `${progress}%` }}
                />
            </div>
            <div className="text-muted-foreground text-xs">
                {progress}% - {status}
            </div>

            {/* Log output */}
            <div className="bg-muted/30 h-64 overflow-y-auto rounded-lg border p-3 font-mono text-xs">
                {log.map((line, i) => (
                    <div key={i} className="whitespace-pre-wrap">
                        {line}
                    </div>
                ))}
                <div ref={logEndRef} />
            </div>

            <div className="flex justify-between">
                <Button variant="outline" onClick={onCancel} disabled={status === 'running'}>
                    <XIcon className="mr-1 h-4 w-4" /> Cancel
                </Button>
                {status === 'done' && (
                    <Button onClick={onDone}>
                        Next <ChevronRightIcon className="ml-1 h-4 w-4" />
                    </Button>
                )}
                {status === 'failed' && (
                    <p className="text-destructive text-sm font-semibold">Deployment failed. Check the log above.</p>
                )}
            </div>
        </div>
    );
}

// - -  Step: Configure - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
function StepConfigure({
    serverCFG,
    onSave,
    onCancel,
}: {
    serverCFG: string;
    onSave: (cfg: string) => void;
    onCancel: () => void;
}) {
    const [cfgText, setCfgText] = useState(serverCFG);

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-semibold">Configure server.cfg</h2>
            <p className="text-muted-foreground text-sm">
                Review your server.cfg below. Make any final adjustments before saving.
            </p>
            <div className="h-96 overflow-hidden rounded-lg border">
                <LazyMonacoEditor
                    language="ini"
                    value={cfgText}
                    onChange={(v) => setCfgText(v ?? '')}
                    options={{ minimap: { enabled: false }, wordWrap: 'on', lineNumbers: 'on' }}
                />
            </div>
            <div className="flex justify-between">
                <Button variant="outline" onClick={onCancel}>
                    <XIcon className="mr-1 h-4 w-4" /> Cancel
                </Button>
                <Button onClick={() => onSave(cfgText)}>
                    <CheckIcon className="mr-1 h-4 w-4" /> Save & Start Server
                </Button>
            </div>
        </div>
    );
}

// - -  Main Deployer Page - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
export default function DeployerPage() {
    const [actionLoading, setActionLoading] = useState(false);

    const dataApi = useBackendApi<DeployerDataResp>({
        method: 'GET',
        path: '/deployer/data',
    });
    const swrFetcher = useCallback(async () => {
        let resp: DeployerDataResp | undefined;
        let fetchError: string | undefined;
        await dataApi({
            success: (d) => {
                resp = d;
            },
            error: (msg) => {
                fetchError = msg;
            },
        });
        if (fetchError) throw new Error(fetchError);
        return resp;
    }, [dataApi]);
    const { data, isLoading, mutate } = useSWR('/deployer/data', swrFetcher, { revalidateOnFocus: false });

    const actionApi = useBackendApi<ActionResp>({
        method: 'POST',
        path: '/deployer/recipe/:action',
    });

    // Handle redirects
    const lastShownErrorRef = useRef<string | null>(null);
    useEffect(() => {
        if (!data) return;
        if (data.redirect) {
            setLocation(data.redirect);
        } else if (data.error && data.error !== lastShownErrorRef.current) {
            lastShownErrorRef.current = data.error;
            txToast.error(data.error);
        } else if (!data.error) {
            lastShownErrorRef.current = null;
        }
    }, [data]);

    const doAction = useCallback(
        (action: string, body: Record<string, any>, onSuccess?: () => void) => {
            setActionLoading(true);
            actionApi({
                pathParams: { action },
                data: body,
                timeout: ApiTimeout.REALLY_LONG,
                toastLoadingMessage: 'Processingâ€¦',
                success(resp) {
                    setActionLoading(false);
                    if (resp.refresh) {
                        mutate();
                        return;
                    }
                    if (resp.success) {
                        mutate();
                        onSuccess?.();
                    } else if (resp.type === 'danger' || resp.type === 'error') {
                        txToast.error(resp.message || 'Action failed.');
                    } else if (resp.message) {
                        txToast.warning(resp.message);
                    }
                },
                error(msg) {
                    setActionLoading(false);
                    txToast.error(msg);
                },
            });
        },
        [actionApi, mutate],
    );

    const handleCancel = useCallback(() => {
        doAction('cancel', {}, () => {
            setLocation('/server/setup');
        });
    }, [doAction]);

    const handleGoBack = useCallback(() => {
        doAction('goBack', {}, () => mutate());
    }, [doAction, mutate]);

    if (isLoading || !data) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader2Icon className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    if (data.redirect || data.error) return null;

    // Step indicators
    const steps = ['Review', 'Variables', 'Deploy', 'Configure'];
    const stepIndex = { review: 0, input: 1, run: 2, configure: 3 }[data.step] ?? 0;

    return (
        <div className="mx-auto w-full max-w-(--breakpoint-md) space-y-6 px-2 py-4 md:px-0">
            <div className="px-2 md:px-0">
                <h1 className="mb-2 text-3xl">Recipe Deployer</h1>
                <p className="text-muted-foreground text-sm">Deployment ID: {data.deploymentID}</p>
            </div>

            {/* Step Progress */}
            <div className="flex items-center gap-1 px-2 md:px-0">
                {steps.map((label, i) => {
                    const isActive = stepIndex === i;
                    const isDone = stepIndex > i;
                    return (
                        <div key={label} className="flex flex-1 items-center gap-1">
                            <div
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                    isDone
                                        ? 'bg-primary text-primary-foreground'
                                        : isActive
                                          ? 'border-primary text-primary border-2'
                                          : 'border-muted-foreground/30 text-muted-foreground border'
                                }`}
                            >
                                {isDone ? <CheckIcon className="h-3 w-3" /> : i + 1}
                            </div>
                            <span
                                className={`hidden text-xs sm:inline ${isActive ? 'text-primary font-semibold' : 'text-muted-foreground'}`}
                            >
                                {label}
                            </span>
                            {i < steps.length - 1 && (
                                <div className={`mx-1 h-px flex-1 ${isDone ? 'bg-primary' : 'bg-border'}`} />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Step Content */}
            <div className="rounded-lg border p-6">
                {actionLoading && (
                    <div className="flex items-center justify-center py-8">
                        <Loader2Icon className="h-8 w-8 animate-spin" />
                    </div>
                )}
                {!actionLoading && data.step === 'review' && data.recipe && (
                    <StepReview
                        recipe={data.recipe}
                        onConfirm={(editedRecipe) => doAction('confirmRecipe', { recipe: editedRecipe })}
                        onCancel={handleCancel}
                    />
                )}
                {!actionLoading && data.step === 'input' && (
                    <StepInput
                        requireDBConfig={data.requireDBConfig}
                        requiresGithubToken={data.requiresGithubToken}
                        defaults={data.defaults}
                        inputVars={data.inputVars}
                        defaultLicenseKey={data.defaultLicenseKey}
                        onSubmit={(vars) => doAction('setVariables', vars)}
                        onBack={handleGoBack}
                        onCancel={handleCancel}
                    />
                )}
                {!actionLoading && data.step === 'run' && data.deployPath && (
                    <StepRun deployPath={data.deployPath} onDone={() => mutate()} onCancel={handleCancel} />
                )}
                {!actionLoading && data.step === 'configure' && data.serverCFG !== undefined && (
                    <StepConfigure
                        serverCFG={data.serverCFG}
                        onSave={(cfg) =>
                            doAction('commit', { serverCFG: cfg }, () => {
                                txToast.success('Server deployed successfully!');
                                setLocation('/server/console');
                            })
                        }
                        onCancel={handleCancel}
                    />
                )}
            </div>
        </div>
    );
}
