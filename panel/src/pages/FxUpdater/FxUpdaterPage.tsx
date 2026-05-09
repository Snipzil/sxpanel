import { useState, useEffect, useRef, useCallback } from 'react';
import { useBackendApi, ApiTimeout } from '@/hooks/fetch';
import { useOpenConfirmDialog } from '@/hooks/dialogs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/page-header';
import { txToast } from '@/components/TxToaster';
import { cn } from '@/lib/utils';
import {
    Loader2Icon,
    DownloadIcon,
    RotateCcwIcon,
    AlertTriangleIcon,
    CheckCircle2Icon,
    XCircleIcon,
    ExternalLinkIcon,
    PackageIcon,
} from 'lucide-react';
import type { ArtifactListResp, ArtifactTierInfo } from '@shared/otherTypes';
import type { ApiToastResp } from '@shared/genericApiTypes';
import { emsg } from '@shared/emsg';

const tierLabels: Record<ArtifactTierInfo['tier'], { label: string; desc: string }> = {
    latest: { label: 'Latest', desc: 'Newest available build' },
    recommended: { label: 'Recommended', desc: 'Stable and tested' },
    optional: { label: 'Optional', desc: 'Minor fixes and improvements' },
    critical: { label: 'Critical', desc: 'Minimum safe version' },
};

const PHASE_LABELS: Record<string, string> = {
    downloading: 'Downloading artifact',
    extracting: 'Extracting archive',
    extracted: 'Ready to apply',
    applying: 'Applying update',
};

function StatusSection({
    data,
    onApply,
    onReset,
}: {
    data: ArtifactListResp;
    onApply: () => void;
    onReset: () => void;
}) {
    const { updateStatus } = data;
    if (updateStatus.phase === 'idle') return null;

    const statusLabel = PHASE_LABELS[updateStatus.phase] || 'Update failed';

    return (
        <Card className="border-border/60 bg-card/80 overflow-hidden">
            <CardHeader className="pb-3">
                <CardTitle className="text-lg">Update Progress</CardTitle>
                <CardDescription className="flex items-center gap-2">
                    <span
                        className={cn(
                            'inline-flex h-2 w-2 rounded-full',
                            updateStatus.phase === 'error'
                                ? 'bg-destructive'
                                : updateStatus.phase === 'extracted'
                                  ? 'bg-success'
                                  : 'bg-primary animate-pulse',
                        )}
                    />
                    {statusLabel}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
                {updateStatus.phase === 'downloading' && (
                    <div className="space-y-2.5">
                        <div className="text-muted-foreground flex items-center gap-2 text-sm">
                            <Loader2Icon className="h-4 w-4 animate-spin" />
                            Downloading... {updateStatus.percentage}%
                        </div>
                        <div
                            className="bg-muted/70 border-border/40 h-2.5 w-full overflow-hidden rounded-full border"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={updateStatus.percentage}
                            aria-label={`Downloading: ${updateStatus.percentage}%`}
                        >
                            <div
                                className="bg-primary h-full rounded-full transition-all duration-300"
                                style={{ width: `${updateStatus.percentage}%` }}
                            />
                        </div>
                    </div>
                )}
                {updateStatus.phase === 'extracting' && (
                    <div className="text-muted-foreground flex items-center gap-2 text-sm">
                        <Loader2Icon className="h-4 w-4 animate-spin" />
                        Extracting archive...
                    </div>
                )}
                {updateStatus.phase === 'extracted' && (
                    <>
                        <Alert>
                            <CheckCircle2Icon className="h-4 w-4" />
                            <AlertTitle>Download Complete</AlertTitle>
                            <AlertDescription>
                                The artifact has been downloaded and extracted. Click &quot;Apply &amp; Restart&quot; to
                                install it.
                            </AlertDescription>
                        </Alert>
                        <Button variant="warning" className="w-full sm:w-auto" onClick={onApply}>
                            <RotateCcwIcon className="mr-2 h-4 w-4" />
                            Apply &amp; Restart
                        </Button>
                    </>
                )}
                {updateStatus.phase === 'applying' && (
                    <Alert>
                        <Loader2Icon className="h-4 w-4 animate-spin" />
                        <AlertTitle>Applying Update</AlertTitle>
                        <AlertDescription>
                            The server is being updated and will restart momentarily. This page will become
                            unresponsive.
                        </AlertDescription>
                    </Alert>
                )}
                {updateStatus.phase === 'error' && (
                    <>
                        <Alert variant="destructive">
                            <AlertTriangleIcon className="h-4 w-4" />
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{updateStatus.message}</AlertDescription>
                        </Alert>
                        <Button variant="outline" className="w-full sm:w-auto" onClick={onReset}>
                            Dismiss
                        </Button>
                    </>
                )}
            </CardContent>
        </Card>
    );
}

export default function FxUpdaterPage() {
    const [data, setData] = useState<ArtifactListResp | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const customUrlRef = useRef<HTMLInputElement>(null);
    const openConfirmDialog = useOpenConfirmDialog();

    const listApi = useBackendApi<ArtifactListResp>({
        method: 'GET',
        path: '/fxserver/artifacts',
    });
    const downloadApi = useBackendApi<ApiToastResp, { url: string; version: string }>({
        method: 'POST',
        path: '/fxserver/artifacts/download',
    });
    const applyApi = useBackendApi<ApiToastResp>({
        method: 'POST',
        path: '/fxserver/artifacts/apply',
    });

    const fetchStatus = useCallback(async () => {
        try {
            const resp = await listApi({ timeout: ApiTimeout.LONG });
            if (resp) {
                setData(resp);
                setFetchError(null);
            }
        } catch (e) {
            setFetchError(emsg(e));
        } finally {
            setIsLoading(false);
        }
    }, [listApi]);

    //Poll every 2s while downloading/applying, 30s otherwise
    const hasInitialFetchRef = useRef(true);
    useEffect(() => {
        const currentPhase = data?.updateStatus.phase;

        // Only fetch immediately on the initial mount
        if (hasInitialFetchRef.current) {
            hasInitialFetchRef.current = false;
            fetchStatus();
        }

        const interval = setInterval(
            () => {
                fetchStatus();
            },
            currentPhase === 'downloading' || currentPhase === 'extracting' || currentPhase === 'applying'
                ? 2000
                : 30000,
        );
        return () => clearInterval(interval);
    }, [fetchStatus, data?.updateStatus.phase]);

    const handleDownload = (url: string, version: string) => {
        downloadApi({
            data: { url, version },
            toastLoadingMessage: 'Starting download...',
        });
        //Optimistically show downloading state so UI updates immediately
        setData((prev) => (prev ? { ...prev, updateStatus: { phase: 'downloading', percentage: 0 } } : prev));
    };

    const handleCustomDownload = () => {
        const url = customUrlRef.current?.value?.trim();
        if (!url) {
            txToast.error('Please enter a URL');
            return;
        }
        const ALLOWED_DOWNLOAD_DOMAINS = ['runtime.fivem.net'];
        try {
            const parsed = new URL(url);
            if (parsed.protocol !== 'https:') throw new Error('not https');
            if (!ALLOWED_DOWNLOAD_DOMAINS.includes(parsed.hostname)) {
                txToast.error(
                    `Please enter a valid https URL from an allowed domain (${ALLOWED_DOWNLOAD_DOMAINS.join(', ')})`,
                );
                return;
            }
        } catch {
            txToast.error('Please enter a valid https URL');
            return;
        }
        handleDownload(url, 'custom');
    };

    const handleApply = () => {
        openConfirmDialog({
            title: 'Apply Artifact Update',
            message:
                'This will stop the game server, replace the artifact files, and restart the entire fxPanel process. Make sure you have warned your players. Continue?',
            confirmBtnVariant: 'warning',
            onConfirm: () => {
                applyApi({
                    toastLoadingMessage: 'Applying update...',
                    timeout: ApiTimeout.REALLY_REALLY_LONG,
                });
            },
        });
    };

    const handleReset = () => {
        setData((prev) => (prev ? { ...prev, updateStatus: { phase: 'idle' } } : prev));
    };

    if (isLoading && !data) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2Icon className="text-muted-foreground h-8 w-8 animate-spin" />
            </div>
        );
    }

    if (fetchError) {
        return (
            <div className="mx-auto w-full max-w-4xl space-y-4">
                <PageHeader
                    icon={<PackageIcon />}
                    title="Artifacts"
                    description="Manage FXServer runtime builds and apply safe updates"
                />
                <Alert variant="destructive">
                    <XCircleIcon className="h-4 w-4" />
                    <AlertTitle>Failed to load artifact data</AlertTitle>
                    <AlertDescription>{fetchError}</AlertDescription>
                </Alert>
            </div>
        );
    }

    if (!data) return null;

    const { currentVersion, currentVersionTag, tiers, updateStatus } = data;
    const isBusy =
        updateStatus.phase !== 'idle' && updateStatus.phase !== 'error' && updateStatus.phase !== 'extracted';
    const selectedTier = tiers.find((t) => t.version === currentVersion);

    return (
        <div className="mx-auto w-full max-w-5xl space-y-4">
            <PageHeader
                icon={<PackageIcon />}
                title="Artifacts"
                description="Manage FXServer runtime builds and apply safe updates"
            >
                <div className="border-border/50 bg-card/70 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs">
                    <span className="text-muted-foreground/70">Current</span>
                    <span className="font-mono font-semibold">{currentVersion}</span>
                </div>
                <div className="border-border/50 bg-card/70 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs">
                    <span
                        className={cn(
                            'inline-flex h-1.5 w-1.5 rounded-full',
                            isBusy ? 'bg-warning animate-pulse' : 'bg-success',
                        )}
                    />
                    <span className="font-medium">{isBusy ? 'Update in progress' : 'Ready'}</span>
                </div>
            </PageHeader>

            {/* Current Version */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Card className="border-border/60 bg-card/80 lg:col-span-2">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg">Current Build</CardTitle>
                        <CardDescription>Installed artifact version on this host</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="font-mono text-3xl leading-none font-bold">{currentVersion}</span>
                            <Badge variant="secondary" className="font-mono">
                                {currentVersionTag}
                            </Badge>
                            {selectedTier && (
                                <Badge variant="outline" className="capitalize">
                                    {selectedTier.tier}
                                </Badge>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/60 bg-card/80">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg">Update State</CardTitle>
                        <CardDescription>Live status from updater daemon</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="border-border/40 bg-secondary/20 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                            <span
                                className={cn(
                                    'inline-flex h-2 w-2 rounded-full',
                                    updateStatus.phase === 'error'
                                        ? 'bg-destructive'
                                        : isBusy
                                          ? 'bg-warning animate-pulse'
                                          : 'bg-success',
                                )}
                            />
                            <span className="capitalize">{updateStatus.phase}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Download/Apply Status */}
            <StatusSection data={data} onApply={handleApply} onReset={handleReset} />

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                {/* Available Artifact Tiers */}
                <Card className="border-border/60 bg-card/80 xl:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-lg">Available Builds</CardTitle>
                        <CardDescription>Select an artifact tier and download the matching build</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {tiers.length === 0 ? (
                            <p className="text-muted-foreground py-4 text-center text-sm">
                                Could not fetch available builds. Try refreshing the page.
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {tiers.map((tier) => {
                                    const info = tierLabels[tier.tier] ?? { label: tier.tier, desc: 'Unknown tier' };
                                    const isCurrent = tier.version === currentVersion;
                                    return (
                                        <div
                                            key={tier.tier}
                                            className={cn(
                                                'bg-card rounded-xl border p-3 sm:p-4',
                                                isCurrent ? 'border-success/40 bg-success/5' : 'border-border/60',
                                            )}
                                        >
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                <div className="min-w-0 space-y-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="font-semibold tracking-tight">
                                                            {info.label}
                                                        </span>
                                                        <Badge variant="outline" className="font-mono text-xs">
                                                            #{tier.version}
                                                        </Badge>
                                                        {isCurrent ? (
                                                            <Badge variant="secondary" className="text-xs">
                                                                Current
                                                            </Badge>
                                                        ) : null}
                                                    </div>
                                                    <p className="text-muted-foreground text-xs sm:text-sm">
                                                        {info.desc}
                                                    </p>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant={isCurrent ? 'muted' : 'default'}
                                                    disabled={isBusy}
                                                    onClick={() =>
                                                        handleDownload(tier.downloadUrl, tier.version.toString())
                                                    }
                                                    className="w-full sm:w-auto"
                                                >
                                                    <DownloadIcon className="mr-1.5 h-3.5 w-3.5" />
                                                    Download
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Custom URL Download */}
                <Card className="border-border/60 bg-card/80">
                    <CardHeader>
                        <CardTitle className="text-lg">Custom URL</CardTitle>
                        <CardDescription>
                            Paste a direct runtime link to download any supported artifact build.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex flex-col gap-2">
                            <Input
                                ref={customUrlRef}
                                placeholder="https://runtime.fivem.net/artifacts/fivem/..."
                                disabled={isBusy}
                            />
                            <Button disabled={isBusy} onClick={handleCustomDownload} className="w-full">
                                <DownloadIcon className="mr-2 h-4 w-4" />
                                Download from URL
                            </Button>
                        </div>
                        <div className="flex flex-col space-y-1.5 pt-1">
                            <a
                                href="https://runtime.fivem.net/artifacts/fivem/build_server_windows/master/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-accent inline-flex items-center gap-1 text-xs hover:underline"
                            >
                                FiveM Artifacts <ExternalLinkIcon className="h-3 w-3" />
                            </a>
                            <a
                                href="https://runtime.fivem.net/artifacts/fivem/build_proot_linux/master/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-accent inline-flex items-center gap-1 text-xs hover:underline"
                            >
                                FiveM Linux Artifacts <ExternalLinkIcon className="h-3 w-3" />
                            </a>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
