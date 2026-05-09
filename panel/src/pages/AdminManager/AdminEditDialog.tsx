import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Loader2Icon, AlertTriangleIcon } from 'lucide-react';
import { AdminListItem, ApiAdminSaveResp, ApiAdminSaveReq } from '@shared/adminApiTypes';
import { PermissionPreset, permissionsMap, registeredPermissions } from '@shared/permissions';
import { useBackendApi } from '@/hooks/fetch';
import { txToast } from '@/components/TxToaster';
import PermissionsEditor from './PermissionsEditor';
import { emsg } from '@shared/emsg';

export type AdminAutofillData = {
    name: string;
    citizenfxId: string;
    discordId: string;
};

type AdminEditDialogProps = {
    target: AdminListItem | 'new';
    allPresets: PermissionPreset[];
    onClose: () => void;
    onSaved: () => void;
    initialData?: AdminAutofillData;
};

export default function AdminEditDialog({ target, allPresets, onClose, onSaved, initialData }: AdminEditDialogProps) {
    const isNew = target === 'new';

    const [name, setName] = useState(isNew ? (initialData?.name ?? '') : target.name);
    const [citizenfxId, setCitizenfxId] = useState(
        isNew ? (initialData?.citizenfxId ?? '') : (target.citizenfxId ?? ''),
    );
    const [discordId, setDiscordId] = useState(isNew ? (initialData?.discordId ?? '') : (target.discordId ?? ''));
    const [permissions, setPermissions] = useState<string[]>(isNew ? [] : target.permissions);
    const [isSaving, setIsSaving] = useState(false);
    const [tempPassword, setTempPassword] = useState<string | null>(null);
    const [showConfirm, setShowConfirm] = useState(false);

    const [originalPerms] = useState<string[]>(() => (isNew ? [] : target.permissions));

    const saveApi = useBackendApi<ApiAdminSaveResp, ApiAdminSaveReq>({
        method: 'POST',
        path: isNew ? '/adminManager/add' : '/adminManager/edit',
        throwGenericErrors: true,
    });

    const applyPreset = (presetId: string) => {
        const preset = allPresets.find((p) => p.id === presetId);
        if (preset) {
            setPermissions([...preset.permissions]);
        }
    };

    //Compute permission diff
    const addedPerms = permissions.filter((p) => !originalPerms.includes(p));
    const removedPerms = originalPerms.filter((p) => !permissions.includes(p));
    const hasDiff = addedPerms.length > 0 || removedPerms.length > 0;
    const newDangerous = addedPerms.filter((pid) => registeredPermissions.find((p) => p.id === pid)?.dangerous);

    const handleSave = async () => {
        if (!name.trim()) {
            txToast.error({ title: 'Validation Error', msg: 'Username is required.' });
            return;
        }

        //Check for dangerous permissions being added - require confirmation
        if (newDangerous.length > 0 && !showConfirm) {
            setShowConfirm(true);
            return;
        }

        setIsSaving(true);
        setShowConfirm(false);
        try {
            const resp = await saveApi({
                data: {
                    name: name.trim(),
                    ...(!isNew && { originalName: target.name }),
                    citizenfxId,
                    discordId,
                    permissions,
                },
            });
            if (!resp) return;
            if (resp.type === 'danger') {
                txToast.error({ title: 'Error', msg: resp.message });
                return;
            }
            //Backend add returns {type: 'showPassword', password}
            if (resp.type === 'showPassword' && resp.password) {
                setTempPassword(resp.password);
                return;
            }
            //Backend edit returns {type: 'success', refresh: true}
            txToast.success('Admin saved successfully.');
            onSaved();
        } catch (error) {
            txToast.error({ title: 'Error', msg: emsg(error) });
        } finally {
            setIsSaving(false);
        }
    };

    //Show dangerous permission confirmation
    if (showConfirm) {
        return (
            <Dialog open onOpenChange={() => setShowConfirm(false)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangleIcon className="text-destructive h-5 w-5" />
                            Dangerous Permissions
                        </DialogTitle>
                        <DialogDescription>You are granting the following dangerous permissions:</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        {newDangerous.map((pid) => (
                            <div key={pid} className="bg-destructive/10 flex items-center gap-2 rounded-md px-3 py-2">
                                <AlertTriangleIcon className="text-destructive h-4 w-4 shrink-0" />
                                <div>
                                    <span className="text-sm font-medium">{permissionsMap.get(pid)?.label ?? pid}</span>
                                    <p className="text-muted-foreground text-xs">
                                        {permissionsMap.get(pid)?.description}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowConfirm(false)}>
                            Go Back
                        </Button>
                        <Button variant="destructive" onClick={handleSave} disabled={isSaving}>
                            {isSaving && <Loader2Icon className="mr-1.5 h-4 w-4 animate-spin" />}
                            Confirm & Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    }

    // Show temp password screen after adding
    if (tempPassword) {
        return (
            <Dialog
                open
                onOpenChange={() => {
                    onSaved();
                    onClose();
                }}
            >
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Admin Created</DialogTitle>
                        <DialogDescription>
                            A temporary password has been generated; copy it now - it will not be shown again.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <p className="text-muted-foreground text-sm">
                            The admin <strong>{name}</strong> has been created with a temporary password. They will be
                            asked to change it on first login.
                        </p>
                        <div className="bg-muted rounded-md p-3 text-center font-mono text-sm select-all">
                            {tempPassword}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            onClick={() => {
                                onSaved();
                                onClose();
                            }}
                        >
                            Done
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col overflow-hidden">
                <DialogHeader>
                    <DialogTitle>{isNew ? 'Add Admin' : `Edit Admin: ${target.name}`}</DialogTitle>
                </DialogHeader>

                <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6">
                    <div className="space-y-4 pb-2">
                        {/* - -  Identity fields - -  */}
                        <div className="grid gap-3 sm:grid-cols-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="admin-name">Username</Label>
                                <Input
                                    id="admin-name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="admin_name"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="admin-cfx">Cfx.re ID</Label>
                                <Input
                                    id="admin-cfx"
                                    value={citizenfxId}
                                    onChange={(e) => setCitizenfxId(e.target.value)}
                                    placeholder="username or fivem:123456"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="admin-discord">Discord ID</Label>
                                <Input
                                    id="admin-discord"
                                    value={discordId}
                                    onChange={(e) => setDiscordId(e.target.value)}
                                    placeholder="123456789012345678"
                                />
                            </div>
                        </div>

                        <Separator />

                        {/* - -  Preset selector - -  */}
                        <div className="flex items-center gap-3">
                            <Label className="text-sm font-medium whitespace-nowrap">Apply Preset:</Label>
                            <Select onValueChange={applyPreset}>
                                <SelectTrigger className="w-[220px]">
                                    <SelectValue placeholder="Choose a preset..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {allPresets.map((preset) => (
                                        <SelectItem key={preset.id} value={preset.id}>
                                            {preset.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <Separator />

                        {/* - -  Permissions editor - -  */}
                        <PermissionsEditor selected={permissions} onChange={setPermissions} />

                        {/* - -  Permission diff summary - -  */}
                        {!isNew && hasDiff && (
                            <div className="space-y-1.5 rounded-md border p-3">
                                <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                                    Changes
                                </span>
                                {addedPerms.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {addedPerms.map((pid) => (
                                            <Badge
                                                key={pid}
                                                variant="outline"
                                                className="border-green-500/40 text-[10px] text-green-500"
                                            >
                                                + {permissionsMap.get(pid)?.label ?? pid}
                                            </Badge>
                                        ))}
                                    </div>
                                )}
                                {removedPerms.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {removedPerms.map((pid) => (
                                            <Badge
                                                key={pid}
                                                variant="outline"
                                                className="border-destructive/40 text-destructive text-[10px]"
                                            >
                                                âˆ’ {permissionsMap.get(pid)?.label ?? pid}
                                            </Badge>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving && <Loader2Icon className="mr-1.5 h-4 w-4 animate-spin" />}
                        {isNew ? 'Create Admin' : 'Save Changes'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
