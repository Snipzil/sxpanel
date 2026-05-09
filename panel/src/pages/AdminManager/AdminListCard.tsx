import { useState } from 'react';
import { AdminListItem, AdminStatsEntry } from '@shared/adminApiTypes';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import Avatar from '@/components/Avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    PencilIcon,
    TrashIcon,
    ShieldCheckIcon,
    KeyIcon,
    MessageSquareIcon,
    RotateCcwIcon,
    MoreVerticalIcon,
    BarChart3Icon,
    CrownIcon,
} from 'lucide-react';
import AdminStatsDialog from './AdminStatsDialog';

type AdminListCardBaseProps = {
    admin: AdminListItem;
    stats?: AdminStatsEntry;
    actionsRank?: number;
    canManage: boolean;
    onEdit: () => void;
    onDelete: () => void;
    onResetPassword: () => void;
};

type AdminListCardProps =
    | (AdminListCardBaseProps & {
          selectMode: true;
          isSelected: boolean;
          onToggleSelect: () => void;
      })
    | (AdminListCardBaseProps & {
          selectMode?: false;
          isSelected?: never;
          onToggleSelect?: never;
      });

export default function AdminListCard({
    admin,
    stats,
    actionsRank,
    canManage,
    onEdit,
    onDelete,
    onResetPassword,
    selectMode,
    isSelected,
    onToggleSelect,
}: AdminListCardProps) {
    const [showStats, setShowStats] = useState(false);
    const displayPermissions = admin.effectivePermissions ?? admin.permissions;

    const permLabel = admin.isMaster
        ? 'Master Account'
        : displayPermissions.includes('all_permissions')
          ? 'All Permissions'
          : `${displayPermissions.length} permission${displayPermissions.length !== 1 ? 's' : ''}`;

    const showManageActions = canManage && !admin.isYou && !admin.isMaster;
    const showMenu = !selectMode;
    const canSelect = !!selectMode && !admin.isMaster && !admin.isYou;

    return (
        <div
            className={cn(
                'bg-card border-border/60 group relative flex flex-col gap-3 rounded-xl border px-4 pt-4 pb-3 shadow-sm transition-all',
                'hover:border-border hover:shadow-md',
                selectMode && canSelect && 'cursor-pointer',
                selectMode && !canSelect && 'opacity-60',
                isSelected && 'ring-primary/70 border-primary/60 ring-2',
            )}
            onClick={canSelect ? onToggleSelect : undefined}
            tabIndex={canSelect ? 0 : undefined}
            role={canSelect ? 'button' : undefined}
            aria-pressed={canSelect ? !!isSelected : undefined}
            onKeyDown={
                canSelect
                    ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                              if (e.key === ' ') e.preventDefault();
                              onToggleSelect();
                          }
                      }
                    : undefined
            }
        >
            {/* ── Top row: avatar + name + menu ── */}
            <div className="flex items-start gap-3">
                {/* Selection checkbox (replaces online dot indicator) */}
                {selectMode && (
                    <div className="flex h-11 items-center">
                        {canSelect ? (
                            <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => onToggleSelect()}
                                onClick={(e) => e.stopPropagation()}
                                aria-label={`Select ${admin.name}`}
                            />
                        ) : (
                            <div className="w-4" />
                        )}
                    </div>
                )}

                {/* Avatar tile */}
                <div className="relative shrink-0">
                    <Avatar username={admin.name} className="h-11 w-11 rounded-lg text-sm font-bold" />
                    {!selectMode && (
                        <span
                            className={cn(
                                'border-card absolute -right-1 -bottom-1 h-3 w-3 rounded-full border-2',
                                admin.isOnline ? 'bg-success' : 'bg-muted-foreground/40',
                            )}
                            title={admin.isOnline ? 'Online (in-game)' : 'Offline'}
                        />
                    )}
                </div>

                {/* Name + meta */}
                <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">{admin.name}</span>
                        {admin.isMaster && (
                            <CrownIcon
                                className="h-3.5 w-3.5 shrink-0 text-amber-400/80"
                                role="img"
                                aria-label="Master account"
                            />
                        )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        {admin.isYou && (
                            <span className="bg-primary/15 text-primary rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase">
                                You
                            </span>
                        )}
                        <span className="text-muted-foreground/70 inline-flex items-center gap-1 text-[11px]">
                            <ShieldCheckIcon className="h-3 w-3" aria-hidden="true" />
                            {permLabel}
                        </span>
                    </div>
                </div>

                {/* Action menu */}
                {showMenu && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground/60 hover:text-foreground -mt-1 -mr-1 h-7 w-7 shrink-0"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <MoreVerticalIcon className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setShowStats(true)} className="gap-2">
                                <BarChart3Icon className="h-3.5 w-3.5" />
                                Stats
                            </DropdownMenuItem>
                            {showManageActions && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={onEdit} className="gap-2">
                                        <PencilIcon className="h-3.5 w-3.5" />
                                        Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={onResetPassword} className="gap-2">
                                        <RotateCcwIcon className="h-3.5 w-3.5" />
                                        Reset Password
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={onDelete}
                                        className="text-destructive focus:text-destructive gap-2"
                                    >
                                        <TrashIcon className="h-3.5 w-3.5" />
                                        Delete
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>

            {/* ── Linked identities ── */}
            <div className="flex flex-wrap items-center gap-1.5">
                {admin.hasCitizenFx && (
                    <Badge
                        variant="outline"
                        className="border-border/60 bg-background/40 text-muted-foreground gap-1 text-[10px] font-medium"
                    >
                        <KeyIcon className="h-3 w-3" />
                        Cfx.re
                    </Badge>
                )}
                {admin.hasDiscord && (
                    <Badge
                        variant="outline"
                        className="border-border/60 bg-background/40 text-muted-foreground gap-1 text-[10px] font-medium"
                    >
                        <MessageSquareIcon className="h-3 w-3" />
                        Discord
                    </Badge>
                )}
                {!admin.hasCitizenFx && !admin.hasDiscord && (
                    <span className="text-muted-foreground/50 text-[10px] italic">No identities linked</span>
                )}
            </div>

            {/* Stats modal */}
            <AdminStatsDialog
                open={showStats}
                onOpenChange={setShowStats}
                adminName={admin.name}
                stats={stats}
                actionsRank={actionsRank}
            />
        </div>
    );
}
