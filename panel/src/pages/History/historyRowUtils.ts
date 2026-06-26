import type { HistoryTableActionType } from '@shared/historyApiTypes';
import type { LucideIcon } from 'lucide-react';
import {
    AlertTriangleIcon,
    GavelIcon,
    HourglassIcon,
    LogOutIcon,
    TimerIcon,
    TimerOffIcon,
    Undo2Icon,
} from 'lucide-react';

export type ActionTypeMeta = {
    label: string;
    badgeClass: string;
    icon: LucideIcon;
};

export function getActionTypeMeta(type: HistoryTableActionType['type']): ActionTypeMeta {
    if (type === 'ban') {
        return {
            label: 'Ban',
            badgeClass: 'border-destructive/35 bg-destructive/12 text-destructive-inline',
            icon: GavelIcon,
        };
    }
    if (type === 'warn') {
        return {
            label: 'Warn',
            badgeClass: 'border-warning/35 bg-warning/12 text-warning-inline',
            icon: AlertTriangleIcon,
        };
    }
    return {
        label: 'Kick',
        badgeClass: 'border-border bg-muted/50 text-muted-foreground',
        icon: LogOutIcon,
    };
}

export function getActionStatusMeta(action: HistoryTableActionType): { icon: LucideIcon; title: string } | null {
    if (action.isRevoked) {
        return { icon: Undo2Icon, title: 'Revoked' };
    }
    if (action.banExpiration === 'permanent') {
        return { icon: TimerOffIcon, title: 'Permanent ban' };
    }
    if (action.banExpiration === 'active') {
        return { icon: TimerIcon, title: 'Active ban' };
    }
    if (action.type === 'warn' && !action.warnAcked) {
        return { icon: HourglassIcon, title: 'Warn not acknowledged' };
    }
    return null;
}
