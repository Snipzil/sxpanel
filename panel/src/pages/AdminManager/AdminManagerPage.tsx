import { useAdminPerms } from '@/hooks/auth';
import { useBackendApi } from '@/hooks/fetch';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
    Loader2Icon,
    PlusIcon,
    ShieldIcon,
    UsersIcon,
    CheckSquareIcon,
    CircleIcon,
    CrownIcon,
    XIcon,
} from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    AdminListItem,
    ApiGetAdminListResp,
    ApiAdminDeleteResp,
    ApiAdminDeleteReq,
    ApiAdminSaveResp,
    ApiAdminSaveReq,
    ApiGetAdminStatsResp,
    AdminStatsEntry,
} from '@shared/adminApiTypes';
import { ApiGetPresetsResp, ApiSavePresetsReq, ApiSavePresetsResp } from '@shared/adminApiTypes';
import { PermissionPreset } from '@shared/permissions';
import { useOpenConfirmDialog } from '@/hooks/dialogs';
import { Button } from '@/components/ui/button';
import { txToast } from '@/components/TxToaster';
import AdminEditDialog, { type AdminAutofillData } from './AdminEditDialog';
import AdminListCard from './AdminListCard';
import PresetsTab from './PresetsTab';
import PermissionsEditor from './PermissionsEditor';
import { emsg } from '@shared/emsg';
import { PageHeader } from '@/components/page-header';
import { cn } from '@/lib/utils';

type AdminsHeaderStatsProps = {
    total: number;
    online: number;
    masters: number;
    isLoading: boolean;
};
function AdminsHeaderStats({ total, online, masters, isLoading }: AdminsHeaderStatsProps) {
    return (
        <>
            <div className="border-border/50 bg-card flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs">
                <UsersIcon className="text-muted-foreground/70 h-3 w-3" />
                <span className="font-mono font-semibold">{isLoading ? '--' : total}</span>
                <span className="text-muted-foreground/70">admins</span>
            </div>
            <div className="border-success/30 bg-success/10 text-success-inline flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold">
                <span
                    className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        online > 0 ? 'bg-success animate-pulse' : 'bg-success/40',
                    )}
                />
                <span className="font-mono">{isLoading ? '--' : online}</span>
                <span>online</span>
            </div>
            <div className="border-border/50 bg-card flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs">
                <CrownIcon className="text-muted-foreground/70 h-3 w-3" />
                <span className="font-mono font-semibold">{isLoading ? '--' : masters}</span>
                <span className="text-muted-foreground/70">master</span>
            </div>
        </>
    );
}

export default function AdminManagerPage() {
    const { hasPerm } = useAdminPerms();
    const canManage = hasPerm('manage.admins');

    const [activeTab, setActiveTab] = useState('admins');
    const [editTarget, setEditTarget] = useState<AdminListItem | 'new' | null>(null);
    const [autofillData, setAutofillData] = useState<AdminAutofillData | undefined>();
    const [resetPasswordResult, setResetPasswordResult] = useState<{ name: string; password: string } | null>(null);
    const [selectMode, setSelectMode] = useState(false);
    const [selectedAdmins, setSelectedAdmins] = useState<Set<string>>(new Set());
    const [isBulkApplying, setIsBulkApplying] = useState(false);
    const [showBulkPermDialog, setShowBulkPermDialog] = useState(false);
    const [bulkPermissions, setBulkPermissions] = useState<string[]>([]);
    const openConfirmDialog = useOpenConfirmDialog();

    // Auto-open add dialog when navigated with autofill params (from "Give Admin" button)
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('autofill') === 'true') {
            const data: AdminAutofillData = {
                name: params.get('name') ?? '',
                citizenfxId: params.get('citizenfx') ?? '',
                discordId: (params.get('discord') ?? '').replace('discord:', ''),
            };
            setAutofillData(data);
            setEditTarget('new');
            const url = new URL(window.location.href);
            url.search = '';
            window.history.replaceState({}, '', url.toString());
        }
    }, []);

    // - -  Admin list - - 
    const listApi = useBackendApi<ApiGetAdminListResp>({
        method: 'GET',
        path: '/adminManager/list',
        throwGenericErrors: true,
    });
    const deleteApi = useBackendApi<ApiAdminDeleteResp, ApiAdminDeleteReq>({
        method: 'POST',
        path: '/adminManager/delete',
        throwGenericErrors: true,
    });
    const resetPasswordApi = useBackendApi<ApiAdminSaveResp, { name: string }>({
        method: 'POST',
        path: '/adminManager/resetPassword',
        throwGenericErrors: true,
    });
    const bulkEditApi = useBackendApi<ApiAdminSaveResp, ApiAdminSaveReq>({
        method: 'POST',
        path: '/adminManager/edit',
        throwGenericErrors: true,
    });

    const adminsSwr = useSWR('/adminManager/list', async () => {
        const data = await listApi({});
        if (!data) throw new Error('empty response');
        return data.admins;
    });

    // - -  Admin stats - - 
    const statsQueryApi = useBackendApi<ApiGetAdminStatsResp>({
        method: 'GET',
        path: '/adminManager/stats',
        throwGenericErrors: true,
    });
    const statsSwr = useSWR('/adminManager/stats', async () => {
        const data = await statsQueryApi({});
        if (!data || 'error' in data) return {};
        return data.stats;
    });
    const adminStats: Record<string, AdminStatsEntry> = statsSwr.data ?? {};

    const adminActivityRanks = useMemo(() => {
        const entries = Object.entries(adminStats)
            .filter(([, s]) => s.totalActions > 0)
            .sort(([, a], [, b]) => b.totalActions - a.totalActions);
        const ranks: Record<string, number> = {};
        for (let i = 0; i < entries.length; i++) {
            ranks[entries[i][0]] = i + 1;
        }
        return ranks;
    }, [adminStats]);

    // - -  Presets - - 
    const presetsQueryApi = useBackendApi<ApiGetPresetsResp>({
        method: 'GET',
        path: '/adminManager/presets',
        throwGenericErrors: true,
    });
    const presetsSaveApi = useBackendApi<ApiSavePresetsResp, ApiSavePresetsReq>({
        method: 'POST',
        path: '/adminManager/presets',
        throwGenericErrors: true,
    });

    const presetsSwr = useSWR('/adminManager/presets', async () => {
        const data = await presetsQueryApi({});
        if (!data) throw new Error('empty response');
        return data.presets;
    });

    const allPresets: PermissionPreset[] = presetsSwr.data ?? [];

    // Header stats
    const admins = adminsSwr.data;
    const totalAdmins = admins?.length ?? 0;
    const onlineAdmins = admins?.filter((a) => a.isOnline).length ?? 0;
    const masterAdmins = admins?.filter((a) => a.isMaster).length ?? 0;

    const handleDeleteAdmin = (admin: AdminListItem) => {
        openConfirmDialog({
            title: 'Delete Admin',
            message: `Are you sure you want to delete "${admin.name}"?`,
            onConfirm: async () => {
                await deleteApi({ data: { name: admin.name } });
                adminsSwr.mutate();
            },
        });
    };

    const handleResetPassword = (admin: AdminListItem) => {
        openConfirmDialog({
            title: 'Reset Password',
            message: `Are you sure you want to reset the password for "${admin.name}"? They will be given a temporary password and forced to change it on next login.`,
            actionLabel: 'Reset Password',
            confirmBtnVariant: 'destructive',
            onConfirm: async () => {
                try {
                    const resp = await resetPasswordApi({ data: { name: admin.name } });
                    if (!resp) return;
                    if (resp.type === 'showPassword' && resp.password) {
                        setResetPasswordResult({ name: admin.name, password: resp.password });
                    } else if (resp.type === 'danger') {
                        txToast.error({ title: 'Error', msg: resp.message });
                    }
                } catch (error) {
                    txToast.error({ title: 'Error', msg: emsg(error) });
                }
            },
        });
    };

    const handleSavePresets = async (presets: PermissionPreset[]) => {
        await presetsSaveApi({ data: { presets } });
        presetsSwr.mutate();
    };

    const toggleSelectMode = () => {
        setSelectMode(!selectMode);
        setSelectedAdmins(new Set());
    };

    const toggleAdminSelection = (name: string) => {
        setSelectedAdmins((prev) => {
            const next = new Set(prev);
            if (next.has(name)) {
                next.delete(name);
            } else {
                next.add(name);
            }
            return next;
        });
    };

    const eligibleAdmins = useMemo(
        () => adminsSwr.data?.filter((a) => selectedAdmins.has(a.name) && !a.isMaster && !a.isYou) ?? [],
        [adminsSwr.data, selectedAdmins],
    );
    const eligibleCount = eligibleAdmins.length;
    const skippedCount = selectedAdmins.size - eligibleCount;

    const openBulkPermDialog = () => {
        if (selectedAdmins.size === 0) {
            txToast.error({ title: 'Error', msg: 'Select at least one admin first.' });
            return;
        }
        setBulkPermissions([]);
        setShowBulkPermDialog(true);
    };

    const handleBulkApply = async () => {
        const targets = eligibleAdmins;
        if (targets.length === 0) {
            txToast.error({ title: 'Error', msg: 'No eligible admins selected.' });
            return;
        }
        if (bulkPermissions.length === 0) {
            txToast.error({ title: 'Error', msg: 'Select at least one permission to apply.' });
            return;
        }

        setShowBulkPermDialog(false);
        setIsBulkApplying(true);
        try {
            const results = await Promise.allSettled(
                targets.map((admin) =>
                    bulkEditApi({
                        data: {
                            name: admin.name,
                            citizenfxId: '',
                            discordId: '',
                            permissions: [...bulkPermissions],
                        },
                    }),
                ),
            );
            let successCount = 0;
            const failedNames: string[] = [];
            results.forEach((result, i) => {
                if (result.status === 'fulfilled') {
                    successCount++;
                } else {
                    console.error(`Bulk permission update failed for ${targets[i].name}:`, result.reason);
                    failedNames.push(targets[i].name);
                }
            });
            if (successCount === 0) {
                txToast.error(`Failed to apply permissions to all admins: ${failedNames.join(', ')}`);
            } else if (successCount < results.length) {
                txToast.warning(
                    `Applied permissions to ${successCount}/${results.length} admins. Failed: ${failedNames.join(', ')}`,
                );
            } else {
                txToast.success(`Applied permissions to ${successCount} admin${successCount !== 1 ? 's' : ''}.`);
            }
            adminsSwr.mutate();
            setSelectMode(false);
            setSelectedAdmins(new Set());
        } finally {
            setIsBulkApplying(false);
        }
    };

    return (
        <div className="flex w-full min-w-0 flex-col gap-4">
            <PageHeader
                icon={<ShieldIcon />}
                title="Admin Manager"
                description="Manage administrator accounts, permissions & presets"
            >
                <AdminsHeaderStats
                    total={totalAdmins}
                    online={onlineAdmins}
                    masters={masterAdmins}
                    isLoading={adminsSwr.isLoading}
                />
            </PageHeader>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col gap-4">
                <TabsList className="w-fit">
                    <TabsTrigger value="admins" className="gap-1.5">
                        <UsersIcon className="h-4 w-4" />
                        Admins
                    </TabsTrigger>
                    <TabsTrigger value="presets" className="gap-1.5">
                        <ShieldIcon className="h-4 w-4" />
                        Permission Presets
                    </TabsTrigger>
                </TabsList>

                {/* - -  Admins tab - -  */}
                <TabsContent value="admins" className="mt-0 flex flex-col gap-4">
                    {/* Action bar */}
                    {canManage && (
                        <div className="bg-card border-border/60 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 shadow-sm">
                            {selectMode ? (
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                    <span className="bg-primary/10 text-primary inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-xs font-semibold">
                                        <CheckSquareIcon className="h-3.5 w-3.5" />
                                        {selectedAdmins.size} selected
                                    </span>
                                    <span className="text-muted-foreground/70 text-xs">
                                        Master &amp; current account are excluded from bulk actions.
                                    </span>
                                </div>
                            ) : (
                                <h3 className="text-muted-foreground/50 text-[10px] font-semibold tracking-widest uppercase">
                                    Staff
                                </h3>
                            )}
                            <div className="flex flex-wrap items-center gap-2">
                                {selectMode ? (
                                    <>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="gap-1.5"
                                            onClick={openBulkPermDialog}
                                            disabled={selectedAdmins.size === 0 || isBulkApplying}
                                        >
                                            <ShieldIcon className="h-3.5 w-3.5" />
                                            Apply Permissions
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="gap-1.5"
                                            onClick={toggleSelectMode}
                                        >
                                            <XIcon className="h-3.5 w-3.5" />
                                            Cancel
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="gap-1.5"
                                            onClick={toggleSelectMode}
                                        >
                                            <CheckSquareIcon className="h-3.5 w-3.5" />
                                            Bulk Apply
                                        </Button>
                                        <Button size="sm" className="gap-1.5" onClick={() => setEditTarget('new')}>
                                            <PlusIcon className="h-3.5 w-3.5" />
                                            Add Admin
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {adminsSwr.isLoading ? (
                        <div className="bg-card border-border/60 flex items-center justify-center rounded-xl border py-16 shadow-sm">
                            <Loader2Icon className="text-muted-foreground h-8 w-8 animate-spin" />
                        </div>
                    ) : adminsSwr.error ? (
                        <div className="border-destructive/30 bg-destructive/5 text-destructive flex items-center justify-center rounded-xl border py-12 text-sm">
                            Failed to load admin list.
                        </div>
                    ) : !admins || admins.length === 0 ? (
                        <div className="bg-card border-border/60 text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-xl border py-16 text-sm shadow-sm">
                            <CircleIcon className="h-8 w-8 opacity-20" />
                            No staff configured yet.
                        </div>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                            {admins.map((admin) => {
                                const selectionProps = selectMode
                                    ? {
                                          selectMode: true as const,
                                          isSelected: selectedAdmins.has(admin.name),
                                          onToggleSelect: () => toggleAdminSelection(admin.name),
                                      }
                                    : {};
                                return (
                                    <AdminListCard
                                        key={admin.name}
                                        admin={admin}
                                        stats={adminStats[admin.name]}
                                        actionsRank={adminActivityRanks[admin.name]}
                                        canManage={canManage}
                                        onEdit={() => setEditTarget(admin)}
                                        onDelete={() => handleDeleteAdmin(admin)}
                                        onResetPassword={() => handleResetPassword(admin)}
                                        {...selectionProps}
                                    />
                                );
                            })}
                        </div>
                    )}
                </TabsContent>

                {/* - -  Presets tab - -  */}
                <TabsContent value="presets" className="mt-0">
                    <PresetsTab
                        presets={presetsSwr.data ?? []}
                        isLoading={presetsSwr.isLoading}
                        canManage={canManage}
                        onSave={handleSavePresets}
                    />
                </TabsContent>
            </Tabs>

            {/* - -  Add / Edit dialog - -  */}
            {editTarget !== null && (
                <AdminEditDialog
                    target={editTarget}
                    allPresets={allPresets}
                    initialData={editTarget === 'new' ? autofillData : undefined}
                    onClose={() => {
                        setEditTarget(null);
                        setAutofillData(undefined);
                    }}
                    onSaved={() => {
                        setEditTarget(null);
                        setAutofillData(undefined);
                        adminsSwr.mutate();
                    }}
                />
            )}

            {/* - -  Reset Password result dialog - -  */}
            {resetPasswordResult && (
                <Dialog open onOpenChange={() => setResetPasswordResult(null)}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>Password Reset</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3">
                            <p className="text-muted-foreground text-sm">
                                The password for <strong>{resetPasswordResult.name}</strong> has been reset. They will
                                be asked to change it on their next login.
                            </p>
                            <div className="bg-muted rounded-md p-3 text-center font-mono text-sm select-all">
                                {resetPasswordResult.password}
                            </div>
                        </div>
                        <DialogFooter>
                            <Button onClick={() => setResetPasswordResult(null)}>Done</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            {/* - -  Bulk Apply Permissions dialog - -  */}
            {showBulkPermDialog && (
                <Dialog open onOpenChange={() => setShowBulkPermDialog(false)}>
                    <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col overflow-hidden">
                        <DialogHeader>
                            <DialogTitle>Bulk Apply Permissions</DialogTitle>
                            <DialogDescription>
                                Choose the permissions to apply to {eligibleCount} eligible admin
                                {eligibleCount !== 1 ? 's' : ''}. This will replace their current permissions.
                                {skippedCount > 0 &&
                                    ` (${skippedCount} master admin${skippedCount !== 1 ? 's' : ''} and/or yourself will be skipped.)`}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6">
                            <PermissionsEditor selected={bulkPermissions} onChange={setBulkPermissions} />
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setShowBulkPermDialog(false)}>
                                Cancel
                            </Button>
                            <Button onClick={handleBulkApply} disabled={bulkPermissions.length === 0 || isBulkApplying}>
                                {isBulkApplying && <Loader2Icon className="mr-1.5 h-4 w-4 animate-spin" />}
                                Apply to {eligibleCount} Admin{eligibleCount !== 1 ? 's' : ''}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}
