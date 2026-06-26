import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
    ChevronLeftIcon,
    ChevronRightIcon,
    FileCodeIcon,
    FolderOpenIcon,
    GlobeIcon,
    Loader2Icon,
    ServerIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBackendApi } from '@/hooks/fetch';
import { txToast } from '@/components/TxToaster';
import type { GameId, TemplateMode } from './deployerFlowTypes';
import type { DeployerWizardDraft } from './deployerFlowTypes';
import { DeployerRecipeChooser } from './DeployerRecipeChooser';
import { DeployerExistingServerStep } from './DeployerExistingServerStep';
import { deployerStepActionsClass } from './deployerLayout';
import { fetchRecipeYaml } from './txAdminRecipeIndex';
import type { TxAdminRecipeEntry } from './txAdminRecipeIndex';
import { buildDefaultDeployPath, loadWizardDraft, saveWizardDraft } from './deployerWizardState';

type ValidateResp = {
    success: boolean;
    name?: string;
    message?: string;
};

const MODE_CARDS: { mode: TemplateMode; icon: ReactNode; title: string; short: string; badge?: string }[] = [
    {
        mode: 'popular',
        icon: <ServerIcon className="size-4" />,
        title: 'Popular recipes',
        short: 'Popular',
        badge: 'RECOMMENDED',
    },
    {
        mode: 'remote',
        icon: <GlobeIcon className="size-4" />,
        title: 'Custom recipe URL',
        short: 'URL',
    },
    {
        mode: 'custom',
        icon: <FileCodeIcon className="size-4" />,
        title: 'Blank recipe',
        short: 'Blank',
    },
    {
        mode: 'local',
        icon: <FolderOpenIcon className="size-4" />,
        title: 'Existing server',
        short: 'Existing',
    },
];

export function DeployerTemplateStep({
    draft,
    engineVersion,
    serverName,
    skipServerName,
    previewMode,
    onBack,
    onDraftChange,
    onContinue,
    onSaveLocal,
}: {
    draft: DeployerWizardDraft;
    engineVersion?: string;
    serverName?: string;
    skipServerName?: boolean;
    previewMode?: boolean;
    onBack: () => void;
    onDraftChange: (patch: Partial<DeployerWizardDraft>) => void;
    /** Recipe path → review step */
    onContinue: () => void;
    /** Existing server → save & console (same as legacy setup local) */
    onSaveLocal: () => void;
}) {
    const [remoteUrl, setRemoteUrl] = useState(draft.remoteRecipeUrl);
    const [remoteLoading, setRemoteLoading] = useState(false);
    const [deployPath, setDeployPath] = useState(draft.deployPath);

    useEffect(() => {
        if (!draft.templateMode) {
            onDraftChange({ templateMode: 'popular' });
        }
    }, [draft.templateMode, onDraftChange]);

    useEffect(() => {
        if (draft.deployPath && draft.deployPath !== deployPath) {
            setDeployPath(draft.deployPath);
        }
    }, [draft.deployPath, deployPath]);

    const effectiveDeployPath = (deployPath || draft.deployPath).trim();

    const validateApi = useBackendApi<ValidateResp>({
        method: 'POST',
        path: '/setup/validateRecipeURL',
    });

    const game = draft.game as GameId;
    const templateMode = draft.templateMode;

    const handleSelectMode = (mode: TemplateMode) => {
        if (mode === 'custom') {
            const path = buildDefaultDeployPath('custom');
            onDraftChange({
                templateMode: 'custom',
                selectedRecipe: null,
                remoteRecipeUrl: '',
                remoteRecipeName: 'Custom Template',
                isTrustedSource: false,
                deployPath: path,
            });
            setDeployPath(path);
            return;
        }
        if (mode === 'remote') {
            onDraftChange({
                templateMode: 'remote',
                selectedRecipe: null,
                remoteRecipeName: '',
                isTrustedSource: false,
            });
            return;
        }
        if (mode === 'local') {
            onDraftChange({
                templateMode: 'local',
                selectedRecipe: null,
                remoteRecipeUrl: '',
                remoteRecipeName: '',
                deployPath: '',
                localFolderValid: false,
                localCfgValid: false,
            });
            return;
        }
        onDraftChange({
            templateMode: 'popular',
            remoteRecipeUrl: '',
            remoteRecipeName: '',
            isTrustedSource: true,
            selectedRecipe: null,
            deployPath: '',
        });
        setDeployPath('');
    };

    const handlePopularSelect = async (recipe: TxAdminRecipeEntry) => {
        const path = buildDefaultDeployPath(recipe.name);
        const patch = {
            templateMode: 'popular' as const,
            selectedRecipe: recipe,
            remoteRecipeUrl: '',
            remoteRecipeName: '',
            isTrustedSource: true,
            deployPath: path,
        };
        saveWizardDraft({ ...loadWizardDraft(), ...patch });
        onDraftChange(patch);
        setDeployPath(path);

        fetchRecipeYaml(recipe.url)
            .then((rawYaml) => {
                const next = { ...loadWizardDraft(), selectedRecipe: { ...recipe, rawYaml } };
                saveWizardDraft(next);
                onDraftChange({ selectedRecipe: { ...recipe, rawYaml } });
            })
            .catch(() => {
                if (previewMode) {
                    txToast.warning('Could not load recipe YAML — placeholder used in review.');
                }
            });
    };

    const handleValidateRemote = () => {
        const url = remoteUrl.trim();
        if (!url) return;

        if (previewMode) {
            const name =
                url
                    .split('/')
                    .pop()
                    ?.replace(/\.ya?ml$/i, '') || 'Remote Recipe';
            const path = buildDefaultDeployPath(name);
            onDraftChange({
                templateMode: 'remote',
                remoteRecipeUrl: url,
                remoteRecipeName: name,
                selectedRecipe: null,
                isTrustedSource: false,
                deployPath: path,
            });
            setDeployPath(path);
            txToast.info('Preview: URL accepted (not validated)');
            return;
        }

        setRemoteLoading(true);
        validateApi({
            data: { recipeURL: url },
            success(data) {
                setRemoteLoading(false);
                if (data.success && data.name) {
                    const path = buildDefaultDeployPath(data.name);
                    onDraftChange({
                        templateMode: 'remote',
                        remoteRecipeUrl: url,
                        remoteRecipeName: data.name,
                        selectedRecipe: null,
                        isTrustedSource: false,
                        deployPath: path,
                    });
                    setDeployPath(path);
                } else {
                    txToast.error(data.message || 'Invalid recipe URL.');
                }
            },
            error(msg) {
                setRemoteLoading(false);
                txToast.error(msg);
            },
        });
    };

    const isLocal = templateMode === 'local';
    const nameOk = skipServerName || (draft.serverName || serverName || '').trim().length >= 3;

    const canContinue = !game
        ? false
        : isLocal
          ? draft.localFolderValid && draft.localCfgValid && nameOk
          : templateMode === 'custom'
            ? effectiveDeployPath.length > 0
            : templateMode === 'popular'
              ? Boolean(draft.selectedRecipe && effectiveDeployPath)
              : templateMode === 'remote'
                ? Boolean(draft.remoteRecipeName && effectiveDeployPath)
                : false;

    const continueHint = !game
        ? 'Go back and choose FiveM or RedM first'
        : !templateMode
          ? 'Choose how you want to set up the server'
          : isLocal && !draft.localFolderValid
            ? 'Validate your existing data folder'
            : isLocal && !draft.localCfgValid
              ? 'Validate your server.cfg path'
              : isLocal && !nameOk
                ? 'Enter a server name (3–22 characters)'
                : templateMode === 'popular' && !draft.selectedRecipe
                  ? 'Select a framework from the list below'
                  : templateMode === 'remote' && !draft.remoteRecipeName
                    ? 'Validate your recipe URL first'
                    : !isLocal && !effectiveDeployPath
                      ? 'Confirm deploy folder path'
                      : null;

    const handlePrimary = () => {
        if (isLocal) {
            onSaveLocal();
            return;
        }
        const mode = templateMode ?? 'popular';
        const patch: Partial<DeployerWizardDraft> = {
            templateMode: mode,
            deployPath: effectiveDeployPath,
        };
        const merged = { ...loadWizardDraft(), ...patch };
        saveWizardDraft(merged);
        onDraftChange(patch);
        onContinue();
    };

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                        <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={onBack}>
                            <ChevronLeftIcon className="size-3.5" />
                        </Button>
                        <div>
                            <h2 className="text-foreground text-sm font-semibold">Pick a template</h2>
                            <p className="text-muted-foreground text-xs capitalize">{game} server</p>
                        </div>
                    </div>

                    <div
                        className="border-border/60 bg-muted/30 grid grid-cols-2 gap-1 rounded-lg border p-1 sm:flex sm:flex-wrap"
                        role="tablist"
                        aria-label="Template source"
                    >
                        {MODE_CARDS.map((c) => {
                            const isActive = templateMode === c.mode;
                            return (
                                <button
                                    key={c.mode}
                                    type="button"
                                    role="tab"
                                    aria-selected={isActive}
                                    onClick={() => handleSelectMode(c.mode)}
                                    className={cn(
                                        'flex min-w-[5.5rem] flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium transition-colors',
                                        isActive
                                            ? 'bg-card text-foreground shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground',
                                    )}
                                >
                                    {c.icon}
                                    <span className="flex flex-wrap items-center justify-center gap-1">
                                        <span className="hidden sm:inline">{c.title}</span>
                                        <span className="sm:hidden">{c.short}</span>
                                        {c.badge && (
                                            <span
                                                className={cn(
                                                    'rounded px-1.5 py-px text-[9px] font-semibold tracking-wide uppercase',
                                                    isActive
                                                        ? 'bg-emerald-600 text-white'
                                                        : 'bg-emerald-600/20 text-emerald-700 dark:text-emerald-400',
                                                )}
                                            >
                                                {c.badge}
                                            </span>
                                        )}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {templateMode === 'popular' && (
                        <DeployerRecipeChooser
                            engineVersion={engineVersion}
                            forceGameName={game}
                            selectedUrl={draft.selectedRecipe?.url}
                            onSelect={handlePopularSelect}
                        />
                    )}

                    {templateMode === 'remote' && (
                        <div className="border-border/60 space-y-3 rounded-lg border p-3">
                            <Alert variant="destructive" className="py-2">
                                <AlertTitle className="text-xs">Untrusted recipes</AlertTitle>
                                <AlertDescription className="text-xs">
                                    Only use YAML from sources you trust. Recipes can run SQL and shell tasks.
                                </AlertDescription>
                            </Alert>
                            <div className="space-y-1.5">
                                <Label htmlFor="remote_recipe_url">Recipe YAML URL</Label>
                                <Input
                                    id="remote_recipe_url"
                                    value={remoteUrl}
                                    onChange={(e) => setRemoteUrl(e.target.value)}
                                    placeholder="https://raw.githubusercontent.com/..."
                                    className="h-8 text-sm"
                                />
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                onClick={handleValidateRemote}
                                disabled={remoteLoading || !remoteUrl.trim()}
                            >
                                {remoteLoading && <Loader2Icon className="mr-1 size-3.5 animate-spin" />}
                                Validate URL
                            </Button>
                        </div>
                    )}

                    {templateMode === 'custom' && (
                        <p className="text-muted-foreground border-border/60 rounded-lg border p-3 text-xs">
                            You will paste or write recipe YAML on the review step. Adjust the deploy folder below if
                            needed.
                        </p>
                    )}

                    {templateMode === 'local' && (
                        <DeployerExistingServerStep
                            draft={draft}
                            serverName={serverName ?? ''}
                            skipServerName={skipServerName}
                            previewMode={previewMode}
                            onDraftChange={onDraftChange}
                        />
                    )}

                    {templateMode && !isLocal && (
                        <div className="border-border/60 space-y-1.5 rounded-lg border p-3">
                            <Label htmlFor="deploy_path_v2">Deploy folder</Label>
                            <Input
                                id="deploy_path_v2"
                                value={deployPath}
                                onChange={(e) => {
                                    setDeployPath(e.target.value);
                                    onDraftChange({ deployPath: e.target.value });
                                }}
                                className="h-8 font-mono text-xs"
                            />
                            {draft.selectedRecipe && (
                                <p className="text-muted-foreground text-[10px]">
                                    Recipe:{' '}
                                    <span className="text-foreground font-medium">{draft.selectedRecipe.name}</span>
                                </p>
                            )}
                            {draft.remoteRecipeName && !draft.selectedRecipe && (
                                <p className="text-muted-foreground text-[10px]">
                                    Recipe:{' '}
                                    <span className="text-foreground font-medium">{draft.remoteRecipeName}</span>
                                </p>
                            )}
                        </div>
                    )}

                    {continueHint && <p className="text-muted-foreground text-center text-[11px]">{continueHint}</p>}
                </div>
            </div>

            <div className={deployerStepActionsClass}>
                <Button type="button" variant="outline" size="sm" onClick={onBack}>
                    <ChevronLeftIcon className="mr-1 size-3.5" /> Back
                </Button>
                <Button type="button" size="sm" disabled={!canContinue} onClick={handlePrimary}>
                    {isLocal ? (
                        <>
                            Save &amp; start server <ChevronRightIcon className="ml-1 size-3.5" />
                        </>
                    ) : (
                        <>
                            Continue <ChevronRightIcon className="ml-1 size-3.5" />
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}
