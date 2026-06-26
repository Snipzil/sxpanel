import { useReducer, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-react';
import TxAnchor from '@/components/TxAnchor';
import { cn } from '@/lib/utils';
import type { DeployerDefaults, InputVar } from './deployerTypes';
import { deployerStepActionsClass, deployerStepBodyClass } from './deployerLayout';

const CFX_LICENSE_KEYS_URL = 'https://portal.cfx.re/servers/registration-keys';

type StepInputState = {
    svLicense: string;
    dbHost: string;
    dbPort: string;
    dbUser: string;
    dbPassword: string;
    dbName: string;
    dbDelete: boolean;
    githubToken: string;
    customVars: Record<string, string>;
};

function reduceStepInputState(state: StepInputState, action: Partial<StepInputState>): StepInputState {
    return { ...state, ...action };
}

function buildSubmitPayload(
    state: StepInputState,
    requireDBConfig: boolean,
    requiresGithubToken: boolean,
): Record<string, string> {
    const vars: Record<string, string> = { svLicense: state.svLicense };
    if (requireDBConfig) {
        vars.dbHost = state.dbHost;
        vars.dbPort = state.dbPort;
        vars.dbUsername = state.dbUser;
        vars.dbPassword = state.dbPassword;
        vars.dbName = state.dbName;
        vars.dbDelete = state.dbDelete ? 'true' : 'false';
    }
    if (requiresGithubToken) {
        vars.githubToken = state.githubToken;
    }
    Object.entries(state.customVars).forEach(([k, v]) => {
        vars[k] = v;
    });
    return vars;
}

function Field({
    id,
    label,
    hint,
    children,
    className,
}: {
    id: string;
    label: string;
    hint?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <div className={cn('space-y-1.5', className)}>
            <Label htmlFor={id} className="text-foreground text-xs font-medium">
                {label}
            </Label>
            {children}
            {hint && <p className="text-muted-foreground text-[11px] leading-snug">{hint}</p>}
        </div>
    );
}

function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
    return (
        <section className="border-border/60 space-y-3 rounded-lg border p-3">
            <div>
                <h3 className="text-foreground text-sm font-semibold">{title}</h3>
                {description && <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>}
            </div>
            {children}
        </section>
    );
}

export function DeployerInputStep({
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
    onSubmit: (vars: Record<string, string>) => void;
    onBack: () => void;
    onCancel: () => void;
}) {
    const [state, dispatch] = useReducer(reduceStepInputState, undefined, () => {
        const initialCustomVars: Record<string, string> = {};
        for (const inputVar of inputVars ?? []) {
            initialCustomVars[inputVar.name] = inputVar.value;
        }
        return {
            svLicense: defaultLicenseKey,
            dbHost: defaults?.mysqlHost ?? 'localhost',
            dbPort: defaults?.mysqlPort ?? '3306',
            dbUser: defaults?.mysqlUser ?? 'root',
            dbPassword: defaults?.mysqlPassword ?? '',
            dbName: defaults?.mysqlDatabase ?? '',
            dbDelete: false,
            githubToken: '',
            customVars: initialCustomVars,
        } satisfies StepInputState;
    });

    const { svLicense, dbHost, dbPort, dbUser, dbPassword, dbName, dbDelete, githubToken, customVars } = state;

    const licenseLooksEmpty = svLicense.trim().length === 0;
    const dbLooksIncomplete =
        requireDBConfig &&
        (dbHost.trim().length === 0 ||
            dbPort.trim().length === 0 ||
            dbUser.trim().length === 0 ||
            dbName.trim().length === 0);
    const githubLooksMissing = requiresGithubToken && githubToken.trim().length === 0;
    const showHints = licenseLooksEmpty || dbLooksIncomplete || githubLooksMissing;

    const handleSubmit = () => {
        onSubmit(buildSubmitPayload(state, requireDBConfig, requiresGithubToken));
    };

    const inputClass = (warn: boolean) => cn('h-8 text-sm', warn && 'border-warning/50');

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className={deployerStepBodyClass}>
                <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain">
                    <div className="shrink-0">
                        <h2 className="text-foreground text-sm font-semibold">Variables &amp; credentials</h2>
                        <p className="text-muted-foreground text-xs">
                            Values are written into your recipe and server config when deploy runs.
                        </p>
                    </div>

                    {defaults?.autofilled && (
                        <Alert className="border-info/30 bg-info/10 py-2">
                            <AlertDescription className="text-xs">
                                Some fields were auto-filled from your host — double-check before continuing.
                            </AlertDescription>
                        </Alert>
                    )}

                    {showHints && (
                        <p className="text-warning-inline shrink-0 text-xs">
                            {licenseLooksEmpty && 'License key required. '}
                            {dbLooksIncomplete && 'Complete MySQL fields. '}
                            {githubLooksMissing && 'GitHub token required.'}
                        </p>
                    )}

                    <FormSection
                        title="Server license"
                        description="Your FiveM / RedM server registration key (sv_licenseKey)."
                    >
                        <Field
                            id="sv_licenseKey_v2"
                            label="License key"
                            hint={
                                <>
                                    Create or copy a key from the{' '}
                                    <TxAnchor href={CFX_LICENSE_KEYS_URL} className="text-primary font-medium">
                                        Cfx.re portal
                                    </TxAnchor>
                                    .
                                </>
                            }
                        >
                            <Input
                                id="sv_licenseKey_v2"
                                value={svLicense}
                                onChange={(e) => dispatch({ svLicense: e.target.value })}
                                placeholder="cfxk_xxxxxxxxxxxxxxxx_xxxxxxxx"
                                className={inputClass(licenseLooksEmpty)}
                                autoComplete="off"
                                spellCheck={false}
                            />
                        </Field>
                    </FormSection>

                    {requireDBConfig && (
                        <FormSection
                            title="MySQL database"
                            description="Used by the recipe to create schema and connection strings."
                        >
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <Field id="db_host_v2" label="Host">
                                    <Input
                                        id="db_host_v2"
                                        value={dbHost}
                                        onChange={(e) => dispatch({ dbHost: e.target.value })}
                                        className={inputClass(dbHost.trim().length === 0)}
                                    />
                                </Field>
                                <Field id="db_port_v2" label="Port">
                                    <Input
                                        id="db_port_v2"
                                        value={dbPort}
                                        onChange={(e) => dispatch({ dbPort: e.target.value })}
                                        className={inputClass(dbPort.trim().length === 0)}
                                    />
                                </Field>
                                <Field id="db_user_v2" label="Username">
                                    <Input
                                        id="db_user_v2"
                                        value={dbUser}
                                        onChange={(e) => dispatch({ dbUser: e.target.value })}
                                        className={inputClass(dbUser.trim().length === 0)}
                                    />
                                </Field>
                                <Field id="db_password_v2" label="Password">
                                    <Input
                                        id="db_password_v2"
                                        type="password"
                                        value={dbPassword}
                                        onChange={(e) => dispatch({ dbPassword: e.target.value })}
                                        className="h-8 text-sm"
                                        autoComplete="new-password"
                                    />
                                </Field>
                                <Field id="db_name_v2" label="Database" className="sm:col-span-2">
                                    <Input
                                        id="db_name_v2"
                                        value={dbName}
                                        onChange={(e) => dispatch({ dbName: e.target.value })}
                                        className={inputClass(dbName.trim().length === 0)}
                                    />
                                </Field>
                            </div>
                            <div className="flex items-center gap-2 pt-1">
                                <Checkbox
                                    id="db_delete_v2"
                                    checked={dbDelete}
                                    onCheckedChange={(c) => dispatch({ dbDelete: c === true })}
                                />
                                <Label htmlFor="db_delete_v2" className="text-muted-foreground text-xs font-normal">
                                    Delete existing database if present
                                </Label>
                            </div>
                        </FormSection>
                    )}

                    {requiresGithubToken && (
                        <FormSection
                            title="GitHub token"
                            description="Required to download private resources referenced by this recipe."
                        >
                            <Field id="github_token_v2" label="Personal access token">
                                <Input
                                    id="github_token_v2"
                                    value={githubToken}
                                    onChange={(e) => dispatch({ githubToken: e.target.value })}
                                    placeholder="ghp_..."
                                    className={inputClass(githubLooksMissing)}
                                    autoComplete="off"
                                    spellCheck={false}
                                />
                            </Field>
                        </FormSection>
                    )}

                    {inputVars && inputVars.length > 0 && (
                        <FormSection title="Recipe variables" description="Custom placeholders defined by the recipe.">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {inputVars.map((v) => (
                                    <Field
                                        key={v.name}
                                        id={`var_${v.name}`}
                                        label={v.name}
                                        hint={v.description}
                                        className={inputVars.length === 1 ? 'sm:col-span-2' : undefined}
                                    >
                                        <Input
                                            id={`var_${v.name}`}
                                            value={customVars[v.name] ?? ''}
                                            onChange={(e) =>
                                                dispatch({
                                                    customVars: { ...customVars, [v.name]: e.target.value },
                                                })
                                            }
                                            className="h-8 text-sm"
                                        />
                                    </Field>
                                ))}
                            </div>
                        </FormSection>
                    )}
                </div>
            </div>

            <div className={deployerStepActionsClass}>
                <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={onBack}>
                        <ChevronLeftIcon className="mr-1 size-3.5" /> Back
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={onCancel}>
                        <XIcon className="mr-1 size-3.5" /> Cancel
                    </Button>
                </div>
                <Button type="button" size="sm" onClick={handleSubmit}>
                    Continue <ChevronRightIcon className="ml-1 size-3.5" />
                </Button>
            </div>
        </div>
    );
}
