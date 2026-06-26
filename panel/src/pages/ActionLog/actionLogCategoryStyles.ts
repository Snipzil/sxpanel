import {
    ActivityIcon,
    CircleHelpIcon,
    ClockIcon,
    CpuIcon,
    LogInIcon,
    SettingsIcon,
    TerminalIcon,
    ZapIcon,
} from 'lucide-react';
import type { SystemLogCategory } from '@shared/systemLogTypes';

export type ActionLogCategoryStyle = {
    icon: typeof ZapIcon;
    /** Light/dark adaptive text color (V1 used dark-only `*-400` shades). */
    text: string;
    /** Matching left-border accent for the log row. */
    border: string;
    label: string;
};

/**
 * Category colorway for Action Log V2. Each hue keeps the V1 identity but
 * pairs a `*-600` shade for light mode with the original `*-400` for dark
 * mode, so rows stay legible in both themes.
 */
export const ACTION_LOG_CATEGORY_STYLES: Record<SystemLogCategory, ActionLogCategoryStyle> = {
    action: {
        icon: ZapIcon,
        text: 'text-blue-600 dark:text-blue-400',
        border: 'border-l-blue-600 dark:border-l-blue-400',
        label: 'Action',
    },
    command: {
        icon: TerminalIcon,
        text: 'text-purple-600 dark:text-purple-400',
        border: 'border-l-purple-600 dark:border-l-purple-400',
        label: 'Command',
    },
    config: {
        icon: SettingsIcon,
        text: 'text-amber-600 dark:text-amber-400',
        border: 'border-l-amber-600 dark:border-l-amber-400',
        label: 'Config',
    },
    login: {
        icon: LogInIcon,
        text: 'text-green-600 dark:text-green-400',
        border: 'border-l-green-600 dark:border-l-green-400',
        label: 'Login',
    },
    monitor: {
        icon: ActivityIcon,
        text: 'text-red-600 dark:text-red-400',
        border: 'border-l-red-600 dark:border-l-red-400',
        label: 'Monitor',
    },
    scheduler: {
        icon: ClockIcon,
        text: 'text-cyan-600 dark:text-cyan-400',
        border: 'border-l-cyan-600 dark:border-l-cyan-400',
        label: 'Scheduler',
    },
    system: {
        icon: CpuIcon,
        text: 'text-muted-foreground',
        border: 'border-l-muted-foreground',
        label: 'System',
    },
};

export const ACTION_LOG_DEFAULT_CATEGORY_STYLE: ActionLogCategoryStyle = {
    icon: CircleHelpIcon,
    text: 'text-muted-foreground',
    border: 'border-l-muted-foreground',
    label: 'Unknown',
};
