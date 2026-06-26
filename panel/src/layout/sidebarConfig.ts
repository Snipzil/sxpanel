import type { LucideIcon } from 'lucide-react';
import {
    LayoutDashboardIcon,
    UsersIcon,
    TerminalIcon,
    BoxIcon,
    ActivityIcon,
    TrendingDownIcon,
    BarChart3Icon,
    ClockIcon,
    FlagIcon,
    ShieldIcon,
    ClipboardListIcon,
    FileTextIcon,
    SlidersHorizontalIcon,
    Settings2Icon,
    ShieldCheckIcon,
    FileCodeIcon,
    PackageIcon,
    ScrollTextIcon,
    BlocksIcon,
} from 'lucide-react';

export type SidebarNavItemConfig = {
    href: string;
    icon: LucideIcon;
    labelKey: string;
    permission?: string;
};

export type SidebarSectionConfig = {
    sectionKey: string;
    items: SidebarNavItemConfig[];
};

export const SIDEBAR_SECTIONS: SidebarSectionConfig[] = [
    {
        sectionKey: 'panel.sidebar.section.overview',
        items: [{ href: '/', icon: LayoutDashboardIcon, labelKey: 'panel.sidebar.item.dashboard' }],
    },
    {
        sectionKey: 'panel.sidebar.section.players',
        items: [
            { href: '/players', icon: UsersIcon, labelKey: 'panel.sidebar.item.players' },
            { href: '/whitelist', icon: ShieldCheckIcon, labelKey: 'panel.sidebar.item.whitelist' },
            { href: '/history', icon: ClockIcon, labelKey: 'panel.sidebar.item.history' },
            {
                href: '/reports',
                icon: FlagIcon,
                labelKey: 'panel.sidebar.item.reports',
                permission: 'players.reports',
            },
        ],
    },
    {
        sectionKey: 'panel.sidebar.section.server',
        items: [
            {
                href: '/server/console',
                icon: TerminalIcon,
                labelKey: 'panel.sidebar.item.live_console',
                permission: 'console.view',
            },
            { href: '/server/resources', icon: BoxIcon, labelKey: 'panel.sidebar.item.resources' },
            {
                href: '/server/cfg-editor',
                icon: FileCodeIcon,
                labelKey: 'panel.sidebar.item.cfg_editor',
                permission: 'server.cfg.editor',
            },
            {
                href: '/server/server-log',
                icon: FileTextIcon,
                labelKey: 'panel.sidebar.item.server_log',
                permission: 'server.log.view',
            },
            {
                href: '/admins',
                icon: ShieldIcon,
                labelKey: 'panel.sidebar.item.admins',
                permission: 'manage.admins',
            },
        ],
    },
    {
        sectionKey: 'panel.sidebar.section.analytics',
        items: [
            { href: '/insights', icon: ActivityIcon, labelKey: 'panel.sidebar.item.insights' },
            { href: '/server/player-drops', icon: TrendingDownIcon, labelKey: 'panel.sidebar.item.player_drops' },
            {
                href: '/reports/analytics',
                icon: BarChart3Icon,
                labelKey: 'panel.sidebar.item.report_analytics',
                permission: 'players.reports',
            },
        ],
    },
    {
        sectionKey: 'panel.sidebar.section.addons',
        items: [
            {
                href: '/addons',
                icon: BlocksIcon,
                labelKey: 'panel.sidebar.item.addon_manager',
                permission: 'all_permissions',
            },
        ],
    },
    {
        sectionKey: 'panel.sidebar.section.system',
        items: [
            {
                href: '/system/action-log',
                icon: ClipboardListIcon,
                labelKey: 'panel.sidebar.item.action_log',
                permission: 'txadmin.log.view',
            },
            {
                href: '/system/console-log',
                icon: ScrollTextIcon,
                labelKey: 'panel.sidebar.item.console_log',
                permission: 'txadmin.log.view',
            },
            { href: '/system/diagnostics', icon: SlidersHorizontalIcon, labelKey: 'panel.sidebar.item.diagnostics' },
            {
                href: '/system/artifacts',
                icon: PackageIcon,
                labelKey: 'panel.sidebar.item.artifacts',
                permission: 'all_permissions',
            },
            {
                href: '/settings',
                icon: Settings2Icon,
                labelKey: 'panel.sidebar.item.settings',
                permission: 'settings.view',
            },
        ],
    },
];
