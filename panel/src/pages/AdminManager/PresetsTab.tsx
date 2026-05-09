import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    PlusIcon,
    PencilIcon,
    TrashIcon,
    Loader2Icon,
    CopyIcon,
    ShieldCheckIcon,
    MoreVerticalIcon,
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PermissionPreset, permissionsMap } from '@shared/permissions';
import { useOpenConfirmDialog } from '@/hooks/dialogs';
import { customAlphabet } from 'nanoid';
import { alphanumeric } from 'nanoid-dictionary';
import PresetEditDialog from './PresetEditDialog';

const nanoid = customAlphabet(alphanumeric, 12);

type PresetsTabProps = {
    presets: PermissionPreset[];
    isLoading: boolean;
    canManage: boolean;
    onSave: (presets: PermissionPreset[]) => Promise<void>;
};

export default function PresetsTab({ presets, isLoading, canManage, onSave }: PresetsTabProps) {
    const [editTarget, setEditTarget] = useState<PermissionPreset | 'new' | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const openConfirmDialog = useOpenConfirmDialog();

    const allPresets: PermissionPreset[] = [...presets];

    const handleDelete = (preset: PermissionPreset) => {
        openConfirmDialog({
            title: 'Delete Preset',
            message: `Are you sure you want to delete the preset "${preset.name}"?`,
            onConfirm: async () => {
                setIsSaving(true);
                try {
                    await onSave(presets.filter((p) => p.id !== preset.id));
                } finally {
                    setIsSaving(false);
                }
            },
        });
    };

    const handleSavePreset = async (preset: PermissionPreset) => {
        setIsSaving(true);
        try {
            const existing = presets.findIndex((p) => p.id === preset.id);
            const updated = [...presets];
            if (existing >= 0) {
                updated[existing] = preset;
            } else {
                updated.push({ ...preset, id: `custom:${nanoid()}` });
            }
            await onSave(updated);
            setEditTarget(null);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDuplicate = (preset: PermissionPreset) => {
        setEditTarget({
            id: '', // new — will be assigned on save
            name: `${preset.name} (Copy)`,
            permissions: [...preset.permissions],
        });
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2Icon className="text-muted-foreground h-8 w-8 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-sm">
                    Presets let you quickly apply a set of permissions when adding or editing admins.
                </p>
                {canManage && (
                    <Button variant="outline" className="shrink-0 gap-1.5" onClick={() => setEditTarget('new')}>
                        <PlusIcon className="h-4 w-4" />
                        New Preset
                    </Button>
                )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {allPresets.map((preset) => {
                    const permCount = preset.permissions.includes('all_permissions')
                        ? 'All Permissions'
                        : `${preset.permissions.length} permission${preset.permissions.length !== 1 ? 's' : ''}`;

                    return (
                        <Card key={preset.id} className="flex flex-col">
                            <CardContent className="space-y-2 pt-4 pb-3">
                                <div className="flex items-center justify-between">
                                    <span className="truncate text-base font-semibold">{preset.name}</span>
                                    {canManage && (
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                                                    <MoreVerticalIcon className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => setEditTarget(preset)} className="gap-2">
                                                    <PencilIcon className="h-3.5 w-3.5" />
                                                    Edit
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() => handleDuplicate(preset)}
                                                    className="gap-2"
                                                >
                                                    <CopyIcon className="h-3.5 w-3.5" />
                                                    Duplicate
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                    onClick={() => handleDelete(preset)}
                                                    className="text-destructive focus:text-destructive gap-2"
                                                >
                                                    <TrashIcon className="h-3.5 w-3.5" />
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    )}
                                </div>

                                <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
                                    <ShieldCheckIcon className="h-3.5 w-3.5" />
                                    {permCount}
                                </div>

                                <div className="flex flex-wrap gap-1">
                                    {preset.permissions.slice(0, 6).map((pid) => (
                                        <Badge key={pid} variant="outline" className="text-[10px]">
                                            {permissionsMap.get(pid)?.label ?? pid}
                                        </Badge>
                                    ))}
                                    {preset.permissions.length > 6 && (
                                        <Badge variant="outline" className="text-[10px]">
                                            +{preset.permissions.length - 6} more
                                        </Badge>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {editTarget !== null && (
                <PresetEditDialog
                    target={editTarget}
                    onClose={() => setEditTarget(null)}
                    onSave={handleSavePreset}
                    isSaving={isSaving}
                />
            )}
        </div>
    );
}
