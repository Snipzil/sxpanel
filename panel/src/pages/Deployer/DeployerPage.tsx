// Dev-only: ?devPreview=game|template|review|input|configure|run — full wizard mock (no deployer API).
// Production: backend /deployer/data drives review → configure; game/template live on /server/setup today.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useBackendApi, ApiTimeout } from '@/hooks/fetch';
import { txToast } from '@/components/TxToaster';
import { Loader2Icon } from 'lucide-react';
import useSWR from 'swr';
import { useLocation } from 'wouter';
import { navigate as setLocation } from 'wouter/use-browser-location';
import type { ActionResp, DeployerDataResp } from './deployerTypes';
import { DEPLOYER_PREVIEW_NAV_EVENT } from './deployerPreviewEvents';
import { buildMockDeployerData } from './deployerPreviewMock';
import { DeployerReviewStep } from './DeployerReviewStep';
import { DeployerInputStep } from './DeployerInputStep';
import { DeployerRunStep } from './DeployerRunStep';
import { DeployerConfigureStep } from './DeployerConfigureStep';
import { DeployerGameStep } from './DeployerGameStep';
import { DeployerTemplateStep } from './DeployerTemplateStep';
import { DeployerWizardShell } from './DeployerWizardShell';
import type { DeployerFlowStep, DeployerWizardDraft, GameId } from './deployerFlowTypes';
import { deployerDataStepToFlowStep } from './deployerFlowTypes';
import {
    goDeployerPreviewStep,
    nextDeployPreviewStep,
    prevDeployPreviewStep,
    previewDraftReadyForReview,
    readDevPreviewStep,
} from './deployerPreview';
import { loadWizardDraft, saveWizardDraft } from './deployerWizardState';

function previewToast(message: string) {
    txToast.info(message, { duration: 3500 });
}

const PREVIEW_BANNER = (
    <p className="border-primary/25 bg-primary/5 text-primary inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border px-3 py-1.5 text-[11px] font-medium sm:self-auto">
        <span className="bg-primary size-1.5 rounded-full" aria-hidden="true" />
        Dev preview — UI only, nothing is sent to the server
    </p>
);

export default function DeployerPage() {
    const [location] = useLocation();
    const [previewNavTick, bumpPreviewNav] = useReducer((n: number) => n + 1, 0);
    const [wizardDraft, setWizardDraft] = useState<DeployerWizardDraft>(() => loadWizardDraft());

    const persistDraft = useCallback((patch: Partial<DeployerWizardDraft>) => {
        setWizardDraft((prev) => {
            const next = { ...prev, ...patch };
            saveWizardDraft(next);
            return next;
        });
    }, []);

    useEffect(() => {
        const sync = () => {
            bumpPreviewNav();
            setWizardDraft(loadWizardDraft());
        };
        window.addEventListener(DEPLOYER_PREVIEW_NAV_EVENT, sync);
        window.addEventListener('popstate', sync);
        return () => {
            window.removeEventListener(DEPLOYER_PREVIEW_NAV_EVENT, sync);
            window.removeEventListener('popstate', sync);
        };
    }, []);

    const devPreviewStep = useMemo(() => readDevPreviewStep(), [location, previewNavTick]);
    const isPreview = devPreviewStep !== null;
    const previewStep: DeployerFlowStep = devPreviewStep ?? 'game';

    const [actionLoading, setActionLoading] = useState(false);

    const previewData = useMemo(() => {
        if (!isPreview || previewStep === 'game' || previewStep === 'template') return null;
        const step = previewStep as DeployerDataResp['step'];
        return buildMockDeployerData(step, wizardDraft);
    }, [isPreview, previewStep, wizardDraft]);

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

    const {
        data: swrData,
        isLoading,
        mutate,
    } = useSWR(isPreview ? null : '/deployer/data', swrFetcher, { revalidateOnFocus: false });

    const setupMetaApi = useBackendApi<{
        deployerEngineVersion: string;
        forceGameName: string;
        dataPath: string;
        serverName: string;
        skipServerName: boolean;
    }>({
        method: 'GET',
        path: '/setup/data',
    });
    const { data: setupMeta } = useSWR(isPreview ? '/setup/data/wizard-meta' : null, async () => {
        let resp:
            | {
                  deployerEngineVersion: string;
                  forceGameName: string;
                  dataPath: string;
                  serverName: string;
                  skipServerName: boolean;
              }
            | undefined;
        await setupMetaApi({
            success: (d) => {
                resp = {
                    deployerEngineVersion: d.deployerEngineVersion,
                    forceGameName: d.forceGameName,
                    dataPath: d.dataPath,
                    serverName: d.serverName,
                    skipServerName: d.skipServerName,
                };
            },
        });
        return resp;
    });

    const saveSetupApi = useBackendApi<{ success: boolean; message?: string }>({
        method: 'POST',
        path: '/setup/save',
    });

    const data: DeployerDataResp | null | undefined = isPreview ? previewData : swrData;

    const actionApi = useBackendApi<ActionResp>({
        method: 'POST',
        path: '/deployer/recipe/:action',
    });

    const lastShownErrorRef = useRef<string | null>(null);
    useEffect(() => {
        if (isPreview || !data) return;
        if (data.redirect) {
            setLocation(data.redirect);
        } else if (data.error && data.error !== lastShownErrorRef.current) {
            lastShownErrorRef.current = data.error;
            txToast.error(data.error);
        } else if (!data.error) {
            lastShownErrorRef.current = null;
        }
    }, [data, isPreview]);

    const doAction = useCallback(
        (action: string, body: Record<string, unknown>, onSuccess?: () => void) => {
            setActionLoading(true);
            actionApi({
                pathParams: { action },
                data: body,
                timeout: ApiTimeout.REALLY_LONG,
                toastLoadingMessage: 'Processing…',
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

    const handlePreviewStepJump = useCallback(
        (step: DeployerFlowStep) => {
            if (wizardDraft.templateMode === 'local' && step !== 'game' && step !== 'template') {
                previewToast('Existing server skips recipe deploy — use Save & start on step 2');
                return;
            }
            if (step !== 'game' && step !== 'template' && !previewDraftReadyForReview(wizardDraft)) {
                previewToast('Complete game & template first.');
                goDeployerPreviewStep(wizardDraft.game ? 'template' : 'game');
                return;
            }
            goDeployerPreviewStep(step);
        },
        [wizardDraft],
    );

    const performLocalSave = useCallback(() => {
        const name = (wizardDraft.serverName || setupMeta?.serverName || '').trim();
        if (!setupMeta?.skipServerName && name.length < 3) {
            txToast.error('Server name must be 3–22 characters.');
            return;
        }
        if (!wizardDraft.dataFolder || !wizardDraft.cfgFile) {
            txToast.error('Validate data folder and server.cfg first.');
            return;
        }

        if (isPreview) {
            previewToast('Save & start server (preview only — would open console)');
            return;
        }

        setActionLoading(true);
        saveSetupApi({
            data: {
                name,
                type: 'local',
                dataFolder: wizardDraft.dataFolder,
                cfgFile: wizardDraft.cfgFile,
            },
            timeout: ApiTimeout.LONG,
            toastLoadingMessage: 'Saving…',
            success(resp) {
                setActionLoading(false);
                if (resp.success) {
                    txToast.success('Server saved. Starting…');
                    setLocation('/server/console');
                } else {
                    txToast.error(resp.message || 'Save failed.');
                }
            },
            error(msg) {
                setActionLoading(false);
                txToast.error(msg);
            },
        });
    }, [wizardDraft, setupMeta, isPreview, saveSetupApi]);

    const advancePreview = useCallback(
        (label: string) => {
            const next = nextDeployPreviewStep(previewStep);
            if (!next) return;
            previewToast(`${label} (preview only)`);
            goDeployerPreviewStep(next);
        },
        [previewStep],
    );

    const handleGoBack = useCallback(() => {
        if (isPreview) {
            const prev = prevDeployPreviewStep(previewStep);
            if (prev) {
                goDeployerPreviewStep(prev);
                previewToast(`Back → ${prev}`);
            }
            return;
        }
        doAction('goBack', {}, () => mutate());
    }, [doAction, isPreview, previewStep, mutate]);

    const handleCancel = useCallback(() => {
        if (isPreview) {
            previewToast('Cancel — reset to game selection (preview only)');
            goDeployerPreviewStep('game');
            return;
        }
        doAction('cancel', {}, () => {
            setLocation('/server/setup');
        });
    }, [doAction, isPreview]);

    if (!isPreview && (isLoading || !data)) {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <Loader2Icon className="size-8 animate-spin" />
            </div>
        );
    }

    if (isPreview && previewStep === 'game') {
        return (
            <DeployerWizardShell
                currentStep="game"
                subtitle="Step 1 — Choose FiveM or RedM"
                previewBanner={PREVIEW_BANNER}
                interactiveStepper
                onStepClick={handlePreviewStepJump}
            >
                <DeployerGameStep
                    selected={wizardDraft.game}
                    onSelect={(game: GameId) => persistDraft({ game })}
                    onContinue={() => {
                        if (!wizardDraft.game) return;
                        goDeployerPreviewStep('template');
                    }}
                />
            </DeployerWizardShell>
        );
    }

    if (isPreview && previewStep === 'template') {
        return (
            <DeployerWizardShell
                currentStep="template"
                subtitle={`Step 2 — ${wizardDraft.game === 'redm' ? 'RedM' : 'FiveM'} template`}
                previewBanner={PREVIEW_BANNER}
                interactiveStepper
                onStepClick={handlePreviewStepJump}
            >
                <DeployerTemplateStep
                    draft={wizardDraft}
                    engineVersion={setupMeta?.deployerEngineVersion}
                    serverName={setupMeta?.serverName}
                    skipServerName={setupMeta?.skipServerName}
                    previewMode
                    onBack={() => goDeployerPreviewStep('game')}
                    onDraftChange={persistDraft}
                    onContinue={() => {
                        const d = loadWizardDraft();
                        if (!previewDraftReadyForReview(d)) {
                            previewToast(
                                !d.game
                                    ? 'Choose FiveM or RedM on step 1 first'
                                    : 'Select a template and deploy folder',
                            );
                            goDeployerPreviewStep(d.game ? 'template' : 'game');
                            return;
                        }
                        goDeployerPreviewStep('review');
                    }}
                    onSaveLocal={performLocalSave}
                />
            </DeployerWizardShell>
        );
    }

    if (!data) {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <Loader2Icon className="size-8 animate-spin" />
            </div>
        );
    }

    if (!isPreview && (data.redirect || data.error)) return null;

    const flowStep: DeployerFlowStep = isPreview ? previewStep : deployerDataStepToFlowStep(data.step);
    const deployPhase = data.step;

    return (
        <DeployerWizardShell
            currentStep={flowStep}
            subtitle={
                isPreview
                    ? `Preview — ${wizardDraft.selectedRecipe?.name ?? wizardDraft.remoteRecipeName ?? 'install'}`
                    : `Deployment ${data.deploymentID}`
            }
            previewBanner={isPreview ? PREVIEW_BANNER : undefined}
            interactiveStepper={isPreview}
            onStepClick={isPreview ? handlePreviewStepJump : undefined}
        >
            {actionLoading && !isPreview ? (
                <div className="flex flex-1 items-center justify-center">
                    <Loader2Icon className="size-8 animate-spin" />
                </div>
            ) : (
                <>
                    {deployPhase === 'review' && data.recipe && (
                        <DeployerReviewStep
                            recipe={data.recipe}
                            deployPath={wizardDraft.deployPath || data.deployPath}
                            onConfirm={(editedRecipe) => {
                                if (isPreview) {
                                    persistDraft({
                                        selectedRecipe: wizardDraft.selectedRecipe
                                            ? { ...wizardDraft.selectedRecipe, rawYaml: editedRecipe }
                                            : null,
                                    });
                                    advancePreview('Recipe approved');
                                } else {
                                    doAction('confirmRecipe', { recipe: editedRecipe });
                                }
                            }}
                            onBack={isPreview ? () => goDeployerPreviewStep('template') : handleGoBack}
                            onCancel={handleCancel}
                        />
                    )}
                    {deployPhase === 'input' && (
                        <DeployerInputStep
                            requireDBConfig={data.requireDBConfig}
                            requiresGithubToken={data.requiresGithubToken}
                            defaults={data.defaults}
                            inputVars={data.inputVars}
                            defaultLicenseKey={data.defaultLicenseKey}
                            onSubmit={(vars) => {
                                if (isPreview) advancePreview('Variables saved');
                                else doAction('setVariables', vars);
                            }}
                            onBack={handleGoBack}
                            onCancel={handleCancel}
                        />
                    )}
                    {deployPhase === 'run' && data.deployPath && (
                        <DeployerRunStep
                            deployPath={data.deployPath}
                            previewMode={isPreview}
                            onBack={isPreview ? () => goDeployerPreviewStep('configure') : undefined}
                            onDone={() => {
                                if (isPreview) advancePreview('Deploy finished');
                                else mutate();
                            }}
                            onCancel={handleCancel}
                        />
                    )}
                    {deployPhase === 'configure' && data.serverCFG !== undefined && (
                        <DeployerConfigureStep
                            serverCFG={data.serverCFG}
                            previewMode={isPreview}
                            onBack={isPreview ? () => goDeployerPreviewStep('input') : undefined}
                            onSave={(cfg) => {
                                if (isPreview) {
                                    advancePreview('server.cfg ready');
                                    return;
                                }
                                doAction('commit', { serverCFG: cfg }, () => {
                                    txToast.success('Server deployed successfully!');
                                    setLocation('/server/console');
                                });
                            }}
                            onCancel={handleCancel}
                        />
                    )}
                </>
            )}
        </DeployerWizardShell>
    );
}
