import { useAdminPerms } from '@/hooks/auth';
import { useBackendApi } from '@/hooks/fetch';
import { useEffect, useMemo, useReducer } from 'react';
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
import { useLocale } from '@/hooks/locale';
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
                <UsersIcon className="text-muted-foreground/70 size-3" />
                <span className="font-mono font-semibold">{isLoading ? '--' : total}</span>
                <span className="text-muted-foreground/70">admins</span>
            </div>
            <div className="border-success/30 bg-success/10 text-success-inline flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold">
                <span
                    className={cn('size-1.5 rounded-full', online > 0 ? 'bg-success animate-pulse' : 'bg-success/40')}
                />
                <span className="font-mono">{isLoading ? '--' : online}</span>
                <span>online</span>
            </div>
            <div className="border-border/50 bg-card flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs">
                <CrownIcon className="text-muted-foreground/70 size-3" />
                <span className="font-mono font-semibold">{isLoading ? '--' : masters}</span>
                <span className="text-muted-foreground/70">master</span>
            </div>
        </>
    );
}

type AdminManagerState = {
    activeTab: string;
    editTarget: AdminListItem | 'new' | null;
    autofillData?: AdminAutofillData;
    resetPasswordResult: { name: string; password: string } | null;
    selectMode: boolean;
    selectedAdmins: Set<string>;
    isBulkApplying: boolean;
    showBulkPermDialog: boolean;
    bulkPermissions: string[];
};

type AdminManagerAction =
    | { type: 'patch'; state: Partial<AdminManagerState> }
    | { type: 'toggleSelectMode' }
    | { type: 'toggleAdminSelection'; name: string }
    | { type: 'clearSelection' };

const initialAdminManagerState: AdminManagerState = {
    activeTab: 'admins',
    editTarget: null,
    autofillData: undefined,
    resetPasswordResult: null,
    selectMode: false,
    selectedAdmins: new Set(),
    isBulkApplying: false,
    showBulkPermDialog: false,
    bulkPermissions: [],
};

function reduceAdminManagerState(state: AdminManagerState, action: AdminManagerAction): AdminManagerState {
    switch (action.type) {
        case 'patch':
            return { ...state, ...action.state };
        case 'toggleSelectMode':
            return {
                ...state,
                selectMode: !state.selectMode,
                selectedAdmins: new Set(),
            };
        case 'toggleAdminSelection': {
            const selectedAdmins = new Set(state.selectedAdmins);
            if (selectedAdmins.has(action.name)) {
                selectedAdmins.delete(action.name);
            } else {
                selectedAdmins.add(action.name);
            }
            return { ...state, selectedAdmins };
        }
        case 'clearSelection':
            return {
                ...state,
                selectMode: false,
                selectedAdmins: new Set(),
            };
    }
}

type AdminsTabProps = {
    admins?: AdminListItem[];
    adminsError: unknown;
    isLoading: boolean;
    canManage: boolean;
    selectMode: boolean;
    selectedAdmins: Set<string>;
    isBulkApplying: boolean;
    adminStats: Record<string, AdminStatsEntry>;
    adminActivityRanks: Record<string, number>;
    onOpenBulkPermDialog: () => void;
    onToggleSelectMode: () => void;
    onToggleAdminSelection: (name: string) => void;
    onCreateAdmin: () => void;
    onEditAdmin: (admin: AdminListItem) => void;
    onDeleteAdmin: (admin: AdminListItem) => void;
    onResetPassword: (admin: AdminListItem) => void;
};

function AdminsTab({
    admins,
    adminsError,
    isLoading,
    canManage,
    selectMode,
    selectedAdmins,
    isBulkApplying,
    adminStats,
    adminActivityRanks,
    onOpenBulkPermDialog,
    onToggleSelectMode,
    onToggleAdminSelection,
    onCreateAdmin,
    onEditAdmin,
    onDeleteAdmin,
    onResetPassword,
}: AdminsTabProps) {
    return (
        <TabsContent value="admins" className="mt-0 flex flex-col gap-4">
            {canManage && (
                <div className="bg-background border-border/60 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
                    {selectMode ? (
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="bg-primary/10 text-primary inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-xs font-semibold">
                                <CheckSquareIcon className="size-3.5" />
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
                                    onClick={onOpenBulkPermDialog}
                                    disabled={selectedAdmins.size === 0 || isBulkApplying}
                                >
                                    <ShieldIcon className="size-3.5" />
                                    Apply Permissions
                                </Button>
                                <Button variant="ghost" size="sm" className="gap-1.5" onClick={onToggleSelectMode}>
                                    <XIcon className="size-3.5" />
                                    Cancel
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button variant="outline" size="sm" className="gap-1.5" onClick={onToggleSelectMode}>
                                    <CheckSquareIcon className="size-3.5" />
                                    Bulk Apply
                                </Button>
                                <Button size="sm" className="gap-1.5" onClick={onCreateAdmin}>
                                    <PlusIcon className="size-3.5" />
                                    Add Admin
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="bg-background border-border/60 flex items-center justify-center rounded-xl border py-16">
                    <Loader2Icon className="text-muted-foreground size-8 animate-spin" />
                </div>
            ) : adminsError ? (
                <div className="border-destructive/30 bg-destructive/5 text-destructive flex items-center justify-center rounded-xl border py-12 text-sm">
                    Failed to load admin list.
                </div>
            ) : !admins || admins.length === 0 ? (
                <div className="bg-background border-border/60 text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-xl border py-16 text-sm">
                    <CircleIcon className="size-8 opacity-20" />
                    No staff configured yet.
                </div>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                    {admins.map((admin) => {
                        const selectionProps = selectMode
                            ? {
                                  selectMode: true as const,
                                  isSelected: selectedAdmins.has(admin.name),
                                  onToggleSelect: () => onToggleAdminSelection(admin.name),
                              }
                            : {};
                        return (
                            <AdminListCard
                                key={admin.name}
                                admin={admin}
                                stats={adminStats[admin.name]}
                                actionsRank={adminActivityRanks[admin.name]}
                                canManage={canManage}
                                onEdit={() => onEditAdmin(admin)}
                                onDelete={() => onDeleteAdmin(admin)}
                                onResetPassword={() => onResetPassword(admin)}
                                {...selectionProps}
                            />
                        );
                    })}
                </div>
            )}
        </TabsContent>
    );
}

function ResetPasswordResultDialog({
    result,
    onClose,
}: {
    result: { name: string; password: string };
    onClose: () => void;
}) {
    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Password Reset</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <p className="text-muted-foreground text-sm">
                        The password for <strong>{result.name}</strong> has been reset. They will be asked to change it
                        on their next login.
                    </p>
                    <div className="bg-muted rounded-md p-3 text-center font-mono text-sm select-all">
                        {result.password}
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={onClose}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function BulkPermissionsDialog({
    eligibleCount,
    skippedCount,
    bulkPermissions,
    isBulkApplying,
    onPermissionsChange,
    onClose,
    onApply,
}: {
    eligibleCount: number;
    skippedCount: number;
    bulkPermissions: string[];
    isBulkApplying: boolean;
    onPermissionsChange: (permissions: string[]) => void;
    onClose: () => void;
    onApply: () => void;
}) {
    return (
        <Dialog open onOpenChange={onClose}>
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
                    <PermissionsEditor selected={bulkPermissions} onChange={onPermissionsChange} />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={onApply} disabled={bulkPermissions.length === 0 || isBulkApplying}>
                        {isBulkApplying && <Loader2Icon className="mr-1.5 size-4 animate-spin" />}
                        Apply to {eligibleCount} Admin{eligibleCount !== 1 ? 's' : ''}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

type AdminManagerViewProps = {
    activeTab: string;
    admins?: AdminListItem[];
    adminsError: unknown;
    adminsLoading: boolean;
    totalAdmins: number;
    onlineAdmins: number;
    masterAdmins: number;
    canManage: boolean;
    selectMode: boolean;
    selectedAdmins: Set<string>;
    isBulkApplying: boolean;
    adminStats: Record<string, AdminStatsEntry>;
    adminActivityRanks: Record<string, number>;
    presets: PermissionPreset[];
    presetsLoading: boolean;
    editTarget: AdminListItem | 'new' | null;
    autofillData?: AdminAutofillData;
    resetPasswordResult: { name: string; password: string } | null;
    showBulkPermDialog: boolean;
    bulkPermissions: string[];
    eligibleCount: number;
    skippedCount: number;
    onActiveTabChange: (activeTab: string) => void;
    onOpenBulkPermDialog: () => void;
    onToggleSelectMode: () => void;
    onToggleAdminSelection: (name: string) => void;
    onCreateAdmin: () => void;
    onEditAdmin: (admin: AdminListItem) => void;
    onDeleteAdmin: (admin: AdminListItem) => void;
    onResetPassword: (admin: AdminListItem) => void;
    onSavePresets: (presets: PermissionPreset[]) => Promise<void>;
    onCloseEdit: () => void;
    onSavedEdit: () => void;
    onCloseResetPasswordResult: () => void;
    onBulkPermissionsChange: (permissions: string[]) => void;
    onCloseBulkPermDialog: () => void;
    onBulkApply: () => void;
};

function AdminManagerView({
    activeTab,
    admins,
    adminsError,
    adminsLoading,
    totalAdmins,
    onlineAdmins,
    masterAdmins,
    canManage,
    selectMode,
    selectedAdmins,
    isBulkApplying,
    adminStats,
    adminActivityRanks,
    presets,
    presetsLoading,
    editTarget,
    autofillData,
    resetPasswordResult,
    showBulkPermDialog,
    bulkPermissions,
    eligibleCount,
    skippedCount,
    onActiveTabChange,
    onOpenBulkPermDialog,
    onToggleSelectMode,
    onToggleAdminSelection,
    onCreateAdmin,
    onEditAdmin,
    onDeleteAdmin,
    onResetPassword,
    onSavePresets,
    onCloseEdit,
    onSavedEdit,
    onCloseResetPasswordResult,
    onBulkPermissionsChange,
    onCloseBulkPermDialog,
    onBulkApply,
}: AdminManagerViewProps) {
    const { t } = useLocale();
    return (
        <div className="flex w-full min-w-0 flex-col gap-4">
            <PageHeader
                icon={<ShieldIcon />}
                title={t('panel.routes.admin_manager')}
                description="Manage administrator accounts, permissions & presets"
            >
                <AdminsHeaderStats
                    total={totalAdmins}
                    online={onlineAdmins}
                    masters={masterAdmins}
                    isLoading={adminsLoading}
                />
            </PageHeader>
            <Tabs value={activeTab} onValueChange={onActiveTabChange} className="flex flex-col gap-4">
                <TabsList className="w-fit">
                    <TabsTrigger value="admins" className="gap-1.5">
                        <UsersIcon className="size-4" />
                        Admins
                    </TabsTrigger>
                    <TabsTrigger value="presets" className="gap-1.5">
                        <ShieldIcon className="size-4" />
                        Permission Presets
                    </TabsTrigger>
                </TabsList>

                <AdminsTab
                    admins={admins}
                    adminsError={adminsError}
                    isLoading={adminsLoading}
                    canManage={canManage}
                    selectMode={selectMode}
                    selectedAdmins={selectedAdmins}
                    isBulkApplying={isBulkApplying}
                    adminStats={adminStats}
                    adminActivityRanks={adminActivityRanks}
                    onOpenBulkPermDialog={onOpenBulkPermDialog}
                    onToggleSelectMode={onToggleSelectMode}
                    onToggleAdminSelection={onToggleAdminSelection}
                    onCreateAdmin={onCreateAdmin}
                    onEditAdmin={onEditAdmin}
                    onDeleteAdmin={onDeleteAdmin}
                    onResetPassword={onResetPassword}
                />

                <TabsContent value="presets" className="mt-0">
                    <PresetsTab
                        presets={presets}
                        isLoading={presetsLoading}
                        canManage={canManage}
                        onSave={onSavePresets}
                    />
                </TabsContent>
            </Tabs>

            {editTarget !== null && (
                <AdminEditDialog
                    target={editTarget}
                    allPresets={presets}
                    initialData={editTarget === 'new' ? autofillData : undefined}
                    onClose={onCloseEdit}
                    onSaved={onSavedEdit}
                />
            )}

            {resetPasswordResult && (
                <ResetPasswordResultDialog result={resetPasswordResult} onClose={onCloseResetPasswordResult} />
            )}

            {showBulkPermDialog && (
                <BulkPermissionsDialog
                    eligibleCount={eligibleCount}
                    skippedCount={skippedCount}
                    bulkPermissions={bulkPermissions}
                    isBulkApplying={isBulkApplying}
                    onPermissionsChange={onBulkPermissionsChange}
                    onClose={onCloseBulkPermDialog}
                    onApply={onBulkApply}
                />
            )}
        </div>
    );
}

export default function AdminManagerPage() {
    const { hasPerm } = useAdminPerms();
    const canManage = hasPerm('manage.admins');

    const [state, dispatch] = useReducer(reduceAdminManagerState, initialAdminManagerState);
    const {
        activeTab,
        editTarget,
        autofillData,
        resetPasswordResult,
        selectMode,
        selectedAdmins,
        isBulkApplying,
        showBulkPermDialog,
        bulkPermissions,
    } = state;
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
            dispatch({ type: 'patch', state: { autofillData: data, editTarget: 'new' } });
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
                        dispatch({
                            type: 'patch',
                            state: { resetPasswordResult: { name: admin.name, password: resp.password } },
                        });
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
        dispatch({ type: 'patch', state: { bulkPermissions: [], showBulkPermDialog: true } });
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

        dispatch({ type: 'patch', state: { showBulkPermDialog: false, isBulkApplying: true } });
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
            dispatch({ type: 'clearSelection' });
        } finally {
            dispatch({ type: 'patch', state: { isBulkApplying: false } });
        }
    };

    return (
        <AdminManagerView
            activeTab={activeTab}
            admins={admins}
            adminsError={adminsSwr.error}
            adminsLoading={adminsSwr.isLoading}
            totalAdmins={totalAdmins}
            onlineAdmins={onlineAdmins}
            masterAdmins={masterAdmins}
            canManage={canManage}
            selectMode={selectMode}
            selectedAdmins={selectedAdmins}
            isBulkApplying={isBulkApplying}
            adminStats={adminStats}
            adminActivityRanks={adminActivityRanks}
            presets={allPresets}
            presetsLoading={presetsSwr.isLoading}
            editTarget={editTarget}
            autofillData={autofillData}
            resetPasswordResult={resetPasswordResult}
            showBulkPermDialog={showBulkPermDialog}
            bulkPermissions={bulkPermissions}
            eligibleCount={eligibleCount}
            skippedCount={skippedCount}
            onActiveTabChange={(activeTab) => dispatch({ type: 'patch', state: { activeTab } })}
            onOpenBulkPermDialog={openBulkPermDialog}
            onToggleSelectMode={() => dispatch({ type: 'toggleSelectMode' })}
            onToggleAdminSelection={(name) => dispatch({ type: 'toggleAdminSelection', name })}
            onCreateAdmin={() => dispatch({ type: 'patch', state: { editTarget: 'new' } })}
            onEditAdmin={(admin) => dispatch({ type: 'patch', state: { editTarget: admin } })}
            onDeleteAdmin={handleDeleteAdmin}
            onResetPassword={handleResetPassword}
            onSavePresets={handleSavePresets}
            onCloseEdit={() => dispatch({ type: 'patch', state: { editTarget: null, autofillData: undefined } })}
            onSavedEdit={() => {
                dispatch({ type: 'patch', state: { editTarget: null, autofillData: undefined } });
                adminsSwr.mutate();
            }}
            onCloseResetPasswordResult={() => dispatch({ type: 'patch', state: { resetPasswordResult: null } })}
            onBulkPermissionsChange={(bulkPermissions) => dispatch({ type: 'patch', state: { bulkPermissions } })}
            onCloseBulkPermDialog={() => dispatch({ type: 'patch', state: { showBulkPermDialog: false } })}
            onBulkApply={handleBulkApply}
        />
    );
}
