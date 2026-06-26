import { useReducer, useCallback } from 'react';
import useSWR from 'swr';
import { ClientDateText } from '@/components/ClientDateText';
import { useAuthedFetcher } from '@/hooks/fetch';
import { useAdminPerms } from '@/hooks/auth';
import { txToast } from '@/components/TxToaster';
import { resetAddonCache, useAddonWidgets, useAddonSettings } from '@/hooks/addons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
    PackageIcon,
    ShieldCheckIcon,
    ShieldXIcon,
    PowerIcon,
    RefreshCwIcon,
    AlertTriangleIcon,
    ShieldAlertIcon,
    SettingsIcon,
    ScrollTextIcon,
    PlayIcon,
    SquareIcon,
    LinkIcon,
    PowerOffIcon,
} from 'lucide-react';
import type { AddonListItem } from '@shared/addonTypes';

interface AddonsListResponse {
    addons: AddonListItem[];
    config: {
        enabled: boolean;
        maxAddons: number;
        maxStorageMb: number;
    };
    error?: string;
}

type AddonsPageState = {
    approvalTarget: AddonListItem | null;
    selectedPerms: string[];
    reloadingIds: Set<string>;
    settingsAddonId: string | null;
    logsAddonId: string | null;
    revokeTarget: string | null;
    isScanning: boolean;
};

type AddonsPageAction =
    | { type: 'patch'; state: Partial<AddonsPageState> }
    | { type: 'openApproval'; addon: AddonListItem }
    | { type: 'togglePermission'; permission: string }
    | { type: 'startReload'; addonId: string }
    | { type: 'finishReload'; addonId: string };

const initialAddonsPageState: AddonsPageState = {
    approvalTarget: null,
    selectedPerms: [],
    reloadingIds: new Set(),
    settingsAddonId: null,
    logsAddonId: null,
    revokeTarget: null,
    isScanning: false,
};

function reduceAddonsPageState(state: AddonsPageState, action: AddonsPageAction): AddonsPageState {
    switch (action.type) {
        case 'patch':
            return { ...state, ...action.state };
        case 'openApproval':
            return {
                ...state,
                approvalTarget: action.addon,
                selectedPerms: [...action.addon.permissions.required, ...action.addon.permissions.optional],
            };
        case 'togglePermission':
            return {
                ...state,
                selectedPerms: state.selectedPerms.includes(action.permission)
                    ? state.selectedPerms.filter((permission) => permission !== action.permission)
                    : [...state.selectedPerms, action.permission],
            };
        case 'startReload':
            return {
                ...state,
                reloadingIds: new Set(state.reloadingIds).add(action.addonId),
            };
        case 'finishReload': {
            const reloadingIds = new Set(state.reloadingIds);
            reloadingIds.delete(action.addonId);
            return { ...state, reloadingIds };
        }
    }
}

const permissionDescriptions: Record<string, string> = {
    storage: "Read/write to addon's own scoped key-value store",
    'players.read': 'Read player data such as custom tags and metadata',
    'players.write': 'Modify player custom tags via the players.addTag / players.removeTag APIs',
    'ws.push': 'Push real-time data to panel clients via WebSocket',
};

const stateColors: Record<string, string> = {
    running: 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/25',
    discovered: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/25',
    approved: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25',
    stopped: 'bg-muted text-muted-foreground border-border',
    failed: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25',
    crashed: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25',
    starting: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25',
    stopping: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/25',
    invalid: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25',
    validating: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25',
};

function StateBadge({ state }: { state: string }) {
    return (
        <Badge variant="outline" className={stateColors[state] ?? ''}>
            {state}
        </Badge>
    );
}

function AddonCard({
    addon,
    onApprove,
    onRevoke,
    onReload,
    onStop,
    onStart,
    onOpenSettings,
    onViewLogs,
    isReloading,
    isReadOnly,
}: {
    addon: AddonListItem;
    onApprove: (addon: AddonListItem) => void;
    onRevoke: (addonId: string) => void;
    onReload: (addonId: string) => void;
    onStop: (addonId: string) => void;
    onStart: (addonId: string) => void;
    onOpenSettings: (addonId: string) => void;
    onViewLogs: (addonId: string) => void;
    isReloading: boolean;
    isReadOnly: boolean;
}) {
    const needsApproval = addon.state === 'discovered';
    const needsReapproval = addon.needsReapproval;

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <PackageIcon className="text-muted-foreground size-5 shrink-0" />
                        <div>
                            <CardTitle className="text-base">{addon.name}</CardTitle>
                            <CardDescription className="text-xs">
                                v{addon.version} by {addon.author}
                            </CardDescription>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {(addon.state === 'running' || addon.state === 'failed' || addon.state === 'crashed') && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                onClick={() => onViewLogs(addon.id)}
                                title="View Logs"
                            >
                                <ScrollTextIcon className="size-4" />
                            </Button>
                        )}
                        {addon.hasSettings && addon.state === 'running' && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                onClick={() => onOpenSettings(addon.id)}
                                title="Addon Settings"
                            >
                                <SettingsIcon className="size-4" />
                            </Button>
                        )}
                        <StateBadge state={addon.state} />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="text-muted-foreground text-sm">{addon.description}</p>

                {addon.lastError &&
                    (addon.state === 'invalid' || addon.state === 'failed' || addon.state === 'crashed') && (
                        <div className="rounded-md border border-red-500/25 bg-red-500/10 p-2">
                            <p className="text-xs text-red-700 dark:text-red-400">{addon.lastError}</p>
                        </div>
                    )}

                {/* Re-approval warning */}
                {needsReapproval && (
                    <div className="flex items-start gap-2 rounded-md border border-yellow-500/25 bg-yellow-500/10 p-2">
                        <ShieldAlertIcon className="mt-0.5 size-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
                        <p className="text-xs text-yellow-700 dark:text-yellow-400">
                            This addon has been updated and requires new permissions. Please re-approve to continue
                            using it.
                        </p>
                    </div>
                )}

                {/* Dependencies display */}
                {addon.dependencies.length > 0 && (
                    <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                        <LinkIcon className="size-3 shrink-0" />
                        <span>Depends on: {addon.dependencies.join(', ')}</span>
                    </div>
                )}

                {/* Permissions display */}
                {(addon.permissions.required.length > 0 || addon.permissions.optional.length > 0) && (
                    <div className="space-y-1">
                        <p className="text-xs font-medium">Permissions:</p>
                        <div className="flex flex-wrap gap-1">
                            {addon.permissions.required.map((p) => (
                                <Badge key={p} variant="secondary" className="text-2xs">
                                    {p}
                                    <span className="text-destructive-inline ml-0.5">*</span>
                                </Badge>
                            ))}
                            {addon.permissions.optional.map((p) => (
                                <Badge key={p} variant="outline" className="text-2xs">
                                    {p}
                                    {addon.permissions.granted.includes(p) && (
                                        <ShieldCheckIcon className="ml-0.5 size-3 text-green-500" />
                                    )}
                                </Badge>
                            ))}
                        </div>
                    </div>
                )}

                {/* Actions */}
                {!isReadOnly && (
                    <div className="flex flex-wrap gap-2 pt-1">
                        {(needsApproval || needsReapproval) && (
                            <Button size="sm" onClick={() => onApprove(addon)}>
                                <ShieldCheckIcon className="mr-1 size-4" />
                                {needsReapproval ? 'Re-approve' : 'Approve'}
                            </Button>
                        )}
                        {addon.state === 'running' && (
                            <>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => onReload(addon.id)}
                                    disabled={isReloading}
                                >
                                    <RefreshCwIcon className={`mr-1 size-4${isReloading ? 'animate-spin' : ''}`} />
                                    {isReloading ? 'Reloading…' : 'Reload'}
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => onStop(addon.id)}>
                                    <SquareIcon className="mr-1 size-4" />
                                    Stop
                                </Button>
                                <Button size="sm" variant="destructive" onClick={() => onRevoke(addon.id)}>
                                    <ShieldXIcon className="mr-1 size-4" />
                                    Revoke
                                </Button>
                            </>
                        )}
                        {addon.state === 'stopped' && (
                            <>
                                <Button size="sm" onClick={() => onStart(addon.id)}>
                                    <PlayIcon className="mr-1 size-4" />
                                    Start
                                </Button>
                                <Button size="sm" variant="destructive" onClick={() => onRevoke(addon.id)}>
                                    <ShieldXIcon className="mr-1 size-4" />
                                    Revoke
                                </Button>
                            </>
                        )}
                        {(addon.state === 'failed' || addon.state === 'crashed') && (
                            <>
                                <Button size="sm" onClick={() => onStart(addon.id)}>
                                    <PlayIcon className="mr-1 size-4" />
                                    Start
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => onReload(addon.id)}
                                    disabled={isReloading}
                                >
                                    <RefreshCwIcon className={`mr-1 size-4${isReloading ? 'animate-spin' : ''}`} />
                                    {isReloading ? 'Reloading…' : 'Reload'}
                                </Button>
                                <Button size="sm" variant="destructive" onClick={() => onRevoke(addon.id)}>
                                    <ShieldXIcon className="mr-1 size-4" />
                                    Revoke
                                </Button>
                            </>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

const logLevelColors: Record<string, string> = {
    info: 'text-blue-600 dark:text-blue-400',
    warn: 'text-yellow-600 dark:text-yellow-400',
    error: 'text-red-600 dark:text-red-400',
};

function AddonLogsDialog({ addonId, addonName, onClose }: { addonId: string; addonName: string; onClose: () => void }) {
    const fetcher = useAuthedFetcher();
    const { data, isLoading } = useSWR<{ logs: { timestamp: number; level: string; message: string }[] }>(
        `/addons/${addonId}/logs`,
        (url: string) => fetcher(url),
        { refreshInterval: 3000 },
    );

    const logs = data?.logs ?? [];

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="flex max-h-[70vh] max-w-3xl flex-col">
                <DialogHeader>
                    <DialogTitle>
                        <div className="flex items-center gap-2">
                            <ScrollTextIcon className="size-5" />
                            {addonName} Logs
                        </div>
                    </DialogTitle>
                    <DialogDescription>
                        Last {logs.length} log entries. Auto-refreshes every 3 seconds.
                    </DialogDescription>
                </DialogHeader>
                <div className="bg-muted/30 min-h-[200px] flex-1 overflow-auto rounded-md border p-3 font-mono text-xs">
                    {isLoading && <p className="text-muted-foreground">Loading logs…</p>}
                    {!isLoading && logs.length === 0 && <p className="text-muted-foreground">No log entries.</p>}
                    {logs.map((log) => (
                        <div key={`${log.timestamp}-${log.level}-${log.message}`} className="flex gap-2 py-0.5">
                            <ClientDateText
                                className="text-muted-foreground shrink-0"
                                timestamp={log.timestamp}
                                formatter={(date) => date.toLocaleTimeString()}
                            />
                            <span className={`w-12 shrink-0 uppercase ${logLevelColors[log.level] ?? ''}`}>
                                [{log.level}]
                            </span>
                            <span className="break-all">{log.message}</span>
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}

function AddonSettingsDialog({
    addonId,
    addonName,
    onClose,
}: {
    addonId: string;
    addonName: string;
    onClose: () => void;
}) {
    const SettingsComponent = useAddonSettings(addonId);
    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>
                        <div className="flex items-center gap-2">
                            <SettingsIcon className="size-5" />
                            {addonName} Settings
                        </div>
                    </DialogTitle>
                </DialogHeader>
                <div className="py-2">
                    {SettingsComponent ? (
                        <SettingsComponent />
                    ) : (
                        <p className="text-muted-foreground py-4 text-center text-sm">
                            Settings component not available.
                        </p>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

function AddonsToolbar({
    data,
    addonCount,
    isReadOnly,
    isScanning,
    onScan,
}: {
    data?: AddonsListResponse;
    addonCount: number;
    isReadOnly: boolean;
    isScanning: boolean;
    onScan: () => void;
}) {
    return (
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <Badge variant={data?.config?.enabled ? 'default' : 'secondary'}>
                    <PowerIcon className="mr-1 size-3" />
                    {data?.config?.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
                {data?.config && (
                    <span className="text-muted-foreground text-xs">
                        {addonCount}/{data.config.maxAddons} addons
                    </span>
                )}
            </div>
            {!isReadOnly && (
                <Button size="sm" variant="outline" onClick={onScan} disabled={isScanning}>
                    <RefreshCwIcon className={`mr-1 size-4${isScanning ? 'animate-spin' : ''}`} />
                    {isScanning ? 'Scanning…' : 'Rescan Addons'}
                </Button>
            )}
        </div>
    );
}

function AddonsLoadingGrid() {
    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((placeholder) => (
                <Card key={placeholder}>
                    <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <div className="bg-muted size-5 animate-pulse rounded" />
                                <div className="space-y-1.5">
                                    <div className="bg-muted h-4 w-32 animate-pulse rounded" />
                                    <div className="bg-muted h-3 w-24 animate-pulse rounded" />
                                </div>
                            </div>
                            <div className="bg-muted h-5 w-16 animate-pulse rounded-full" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            <div className="bg-muted h-4 w-full animate-pulse rounded" />
                            <div className="bg-muted h-4 w-2/3 animate-pulse rounded" />
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

function AddonsEmptyStates({
    isLoading,
    data,
    addonCount,
}: {
    isLoading: boolean;
    data?: AddonsListResponse;
    addonCount: number;
}) {
    if (isLoading) return <AddonsLoadingGrid />;

    if (data?.config && !data.config.enabled) {
        return (
            <Card>
                <CardContent className="flex flex-col items-center gap-2 py-12">
                    <PowerOffIcon className="text-muted-foreground size-12" />
                    <p className="text-muted-foreground text-sm font-medium">Addon system is disabled</p>
                    <p className="text-muted-foreground text-xs">
                        Enable it in the addon configuration to start using addons.
                    </p>
                </CardContent>
            </Card>
        );
    }

    if (data?.config?.enabled && addonCount === 0) {
        return (
            <Card>
                <CardContent className="flex flex-col items-center gap-2 py-12">
                    <PackageIcon className="text-muted-foreground size-12" />
                    <p className="text-muted-foreground text-sm">
                        No addons installed. Place addon folders in the <code>addons/</code> directory.
                    </p>
                </CardContent>
            </Card>
        );
    }

    return null;
}

function AddonSettingsWidgets({ widgets }: { widgets: ReturnType<typeof useAddonWidgets> }) {
    if (widgets.length === 0) return null;

    return (
        <div className="space-y-4">
            <h2 className="text-lg font-semibold">Addon Settings</h2>
            {widgets.map((widget) => (
                <Card key={`${widget.addonId}-${widget.slot}`}>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">{widget.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <widget.Component />
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

function ApprovalDialog({
    approvalTarget,
    selectedPerms,
    onClose,
    onTogglePermission,
    onApprove,
}: {
    approvalTarget: AddonListItem | null;
    selectedPerms: string[];
    onClose: () => void;
    onTogglePermission: (permission: string) => void;
    onApprove: () => void;
}) {
    return (
        <Dialog open={!!approvalTarget} onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {approvalTarget?.needsReapproval ? 'Re-approve' : 'Approve'} Addon: {approvalTarget?.name}
                    </DialogTitle>
                    <DialogDescription>
                        {approvalTarget?.needsReapproval
                            ? 'This addon has been updated and requires new permissions. Review the updated permission list below.'
                            : 'Review and grant permissions for this addon. Required permissions are marked with *.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-2">
                    {approvalTarget?.permissions.required.map((perm) => (
                        <div key={perm} className="flex items-start gap-2">
                            <Checkbox id={`perm-${perm}`} checked disabled className="mt-0.5" />
                            <div>
                                <Label htmlFor={`perm-${perm}`} className="text-sm">
                                    {perm} <span className="text-destructive">*required</span>
                                </Label>
                                {permissionDescriptions[perm] && (
                                    <p className="text-muted-foreground mt-0.5 text-xs">
                                        {permissionDescriptions[perm]}
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                    {approvalTarget?.permissions.optional.map((perm) => (
                        <div key={perm} className="flex items-start gap-2">
                            <Checkbox
                                id={`perm-${perm}`}
                                checked={selectedPerms.includes(perm)}
                                onCheckedChange={() => onTogglePermission(perm)}
                                className="mt-0.5"
                            />
                            <div>
                                <Label htmlFor={`perm-${perm}`} className="text-sm">
                                    {perm}
                                </Label>
                                {permissionDescriptions[perm] && (
                                    <p className="text-muted-foreground mt-0.5 text-xs">
                                        {permissionDescriptions[perm]}
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={onApprove}>
                        <ShieldCheckIcon className="mr-1 size-4" />
                        Approve
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function RevokeAddonDialog({
    revokeTarget,
    addons,
    onClose,
    onRevoke,
}: {
    revokeTarget: string | null;
    addons: AddonListItem[];
    onClose: () => void;
    onRevoke: (addonId: string) => void;
}) {
    return (
        <Dialog open={!!revokeTarget} onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Revoke Addon</DialogTitle>
                    <DialogDescription>
                        Are you sure you want to revoke{' '}
                        <strong>{addons.find((a) => a.id === revokeTarget)?.name ?? revokeTarget}</strong>? This will
                        stop the addon and remove its approval. You can re-approve it later.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant="destructive" onClick={() => revokeTarget && onRevoke(revokeTarget)}>
                        <ShieldXIcon className="mr-1 size-4" />
                        Revoke
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default function AddonsPage() {
    const { hasPerm } = useAdminPerms();
    const isReadOnly = !hasPerm('all_permissions');
    const fetcher = useAuthedFetcher();
    const settingsWidgets = useAddonWidgets('settings.sections');

    const { data, error, isLoading, mutate } = useSWR<AddonsListResponse>(
        '/addons/list',
        (url: string) => fetcher(url),
        { refreshInterval: 10_000 },
    );

    const [state, dispatch] = useReducer(reduceAddonsPageState, initialAddonsPageState);
    const { approvalTarget, selectedPerms, reloadingIds, settingsAddonId, logsAddonId, revokeTarget, isScanning } =
        state;

    const handleOpenApproval = useCallback((addon: AddonListItem) => {
        dispatch({ type: 'openApproval', addon });
    }, []);

    const handleApprove = useCallback(async () => {
        if (!approvalTarget) return;
        try {
            const resp = await fetcher(`/addons/${approvalTarget.id}/approve`, {
                method: 'POST',
                body: { permissions: selectedPerms },
            });
            if (resp.error) {
                txToast.error(resp.error);
            } else {
                txToast.success(`Addon "${approvalTarget.name}" approved and loaded.`);
                resetAddonCache();
                mutate();
            }
        } catch (err) {
            txToast.error(`Failed to approve addon: ${(err as Error).message}`);
        }
        dispatch({ type: 'patch', state: { approvalTarget: null } });
    }, [approvalTarget, selectedPerms, fetcher, mutate]);

    const handleRevoke = useCallback(
        async (addonId: string) => {
            try {
                const resp = await fetcher(`/addons/${addonId}/revoke`, { method: 'POST' });
                if (resp.error) {
                    txToast.error(resp.error);
                } else if (resp.warning) {
                    txToast.warning(resp.warning);
                    resetAddonCache();
                    mutate();
                } else if (resp.stoppedNow === false) {
                    txToast.warning('Addon revoked. Restart FXServer to fully unload the running instance.');
                    resetAddonCache();
                    mutate();
                } else {
                    txToast.success('Addon revoked.');
                    resetAddonCache();
                    mutate();
                }
            } catch (err) {
                txToast.error(`Failed to revoke addon: ${(err as Error).message}`);
            } finally {
                dispatch({ type: 'patch', state: { revokeTarget: null } });
            }
        },
        [fetcher, mutate],
    );

    const handleReload = useCallback(
        async (addonId: string) => {
            dispatch({ type: 'startReload', addonId });
            try {
                const resp = await fetcher(`/addons/${addonId}/reload`, { method: 'POST' });
                if (resp.error) {
                    txToast.error(`Reload failed: ${resp.error}`);
                } else if (resp.warning) {
                    txToast.warning(resp.warning);
                    resetAddonCache();
                    mutate();
                } else {
                    txToast.success(`Addon "${addonId}" reloaded.`);
                    resetAddonCache();
                    mutate();
                }
            } catch (err) {
                txToast.error(`Failed to reload addon: ${(err as Error).message}`);
            } finally {
                dispatch({ type: 'finishReload', addonId });
            }
        },
        [fetcher, mutate],
    );

    const handleStop = useCallback(
        async (addonId: string) => {
            try {
                const resp = await fetcher(`/addons/${addonId}/stop`, { method: 'POST' });
                if (resp.error) {
                    txToast.error(`Stop failed: ${resp.error}`);
                } else if (resp.warning) {
                    txToast.warning(resp.warning);
                    resetAddonCache();
                    mutate();
                } else if (resp.stoppedNow === false) {
                    txToast.warning(`Addon "${addonId}" stop is pending restart.`);
                    resetAddonCache();
                    mutate();
                } else {
                    txToast.success(`Addon "${addonId}" stopped.`);
                    resetAddonCache();
                    mutate();
                }
            } catch (err) {
                txToast.error(`Failed to stop addon: ${(err as Error).message}`);
            }
        },
        [fetcher, mutate],
    );

    const handleStart = useCallback(
        async (addonId: string) => {
            try {
                const resp = await fetcher(`/addons/${addonId}/start`, { method: 'POST' });
                if (resp.error) {
                    txToast.error(`Start failed: ${resp.error}`);
                } else {
                    txToast.success(`Addon "${addonId}" started.`);
                    resetAddonCache();
                    mutate();
                }
            } catch (err) {
                txToast.error(`Failed to start addon: ${(err as Error).message}`);
            }
        },
        [fetcher, mutate],
    );

    const togglePerm = useCallback((perm: string) => {
        dispatch({ type: 'togglePermission', permission: perm });
    }, []);

    const handleScanAddons = useCallback(async () => {
        dispatch({ type: 'patch', state: { isScanning: true } });
        try {
            const resp = await fetcher('/addons/reload-all', { method: 'POST' });
            if (resp.error) {
                txToast.error(resp.error);
            } else {
                txToast.success('Addon folder rescanned.');
                resetAddonCache();
                mutate();
            }
        } catch (err) {
            txToast.error(`Failed to rescan addons: ${(err as Error).message}`);
        } finally {
            dispatch({ type: 'patch', state: { isScanning: false } });
        }
    }, [fetcher, mutate]);

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center gap-2 p-8">
                <AlertTriangleIcon className="text-destructive size-8" />
                <p className="text-destructive">Failed to load addons.</p>
            </div>
        );
    }

    const addons = data?.addons ?? [];

    return (
        <div className="flex w-full flex-col gap-4">
            <AddonsToolbar
                data={data}
                addonCount={addons.length}
                isReadOnly={isReadOnly}
                isScanning={isScanning}
                onScan={handleScanAddons}
            />
            <AddonsEmptyStates isLoading={isLoading} data={data} addonCount={addons.length} />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {addons.map((addon) => (
                    <AddonCard
                        key={addon.id}
                        addon={addon}
                        onApprove={handleOpenApproval}
                        onRevoke={(revokeTarget) => dispatch({ type: 'patch', state: { revokeTarget } })}
                        onReload={handleReload}
                        onStop={handleStop}
                        onStart={handleStart}
                        onOpenSettings={(settingsAddonId) => dispatch({ type: 'patch', state: { settingsAddonId } })}
                        onViewLogs={(logsAddonId) => dispatch({ type: 'patch', state: { logsAddonId } })}
                        isReloading={reloadingIds.has(addon.id)}
                        isReadOnly={isReadOnly}
                    />
                ))}
            </div>

            <AddonSettingsWidgets widgets={settingsWidgets} />
            <ApprovalDialog
                approvalTarget={approvalTarget}
                selectedPerms={selectedPerms}
                onClose={() => dispatch({ type: 'patch', state: { approvalTarget: null } })}
                onTogglePermission={togglePerm}
                onApprove={handleApprove}
            />

            {settingsAddonId && (
                <AddonSettingsDialog
                    addonId={settingsAddonId}
                    addonName={addons.find((a) => a.id === settingsAddonId)?.name ?? settingsAddonId}
                    onClose={() => dispatch({ type: 'patch', state: { settingsAddonId: null } })}
                />
            )}

            {logsAddonId && (
                <AddonLogsDialog
                    addonId={logsAddonId}
                    addonName={addons.find((a) => a.id === logsAddonId)?.name ?? logsAddonId}
                    onClose={() => dispatch({ type: 'patch', state: { logsAddonId: null } })}
                />
            )}

            <RevokeAddonDialog
                revokeTarget={revokeTarget}
                addons={addons}
                onClose={() => dispatch({ type: 'patch', state: { revokeTarget: null } })}
                onRevoke={handleRevoke}
            />
        </div>
    );
}
