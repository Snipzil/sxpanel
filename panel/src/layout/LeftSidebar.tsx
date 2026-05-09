import { cn } from '@/lib/utils';
import { createContext, useContext, useState } from 'react';
import { useRoute } from 'wouter';
import MainPageLink from '@/components/MainPageLink';
import { useAdminPerms, useAuth } from '@/hooks/auth';
import { useShellBreakpoints } from '@/hooks/useShellBreakpoints';
import { serverNameAtom, fxRunnerStateAtom, txConfigStateAtom, useGlobalStatus } from '@/hooks/status';
import { playerCountAtom } from '@/hooks/playerlist';
import { useAtomValue } from 'jotai';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
    PowerIcon,
    PowerOffIcon,
    RotateCcwIcon,
    KeyRoundIcon,
    LogOutIcon,
    Settings2Icon,
    ShieldCheckIcon,
    FileCodeIcon,
    PackageIcon,
    ScrollTextIcon,
    ChevronDownIcon,
    ChevronLeftIcon,
    ChevronUpIcon,
    MegaphoneIcon,
    BlocksIcon,
    WrenchIcon,
    XCircleIcon,
} from 'lucide-react';
import { LogoFullSquareGreen } from '@/components/Logos';
import { NavLink } from '@/components/MainPageLink';
import { TxConfigState } from '@shared/enums';
import { useOpenConfirmDialog, useOpenPromptDialog, useAccountModal } from '@/hooks/dialogs';
import { ApiTimeout, useBackendApi } from '@/hooks/fetch';
import { useCloseAllSheets } from '@/hooks/sheets';
import { useAddonLoader } from '@/hooks/addons';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FaDiscord } from 'react-icons/fa';
import { openExternalLink } from '@/lib/navigation';
import Avatar from '@/components/Avatar';
import { txToast } from '@/components/TxToaster';
import { msToShortDuration } from '@/lib/dateTime';
import { KickAllIcon } from '@/components/KickIcons';

// ─── Collapse context ─────────────────────────────────────────────────────────
const SidebarCollapsedCtx = createContext(false);
const useCollapsed = () => useContext(SidebarCollapsedCtx);

// ─── Sidebar nav item ────────────────────────────────────────────────────────
type SidebarNavItemProps = {
    href: string;
    icon: React.ElementType;
    label: string;
    disabled?: boolean;
};

function SidebarNavItem({ href, icon: Icon, label, disabled }: SidebarNavItemProps) {
    const [isActive] = useRoute(href);
    const collapsed = useCollapsed();

    if (disabled) {
        return (
            <Tooltip>
                <TooltipTrigger asChild>
                    <div
                        className={cn(
                            'text-muted-foreground flex w-full cursor-not-allowed items-center rounded-md text-sm opacity-35 select-none',
                            collapsed ? 'justify-center py-2' : 'gap-3 px-3 py-2',
                        )}
                    >
                        <Icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span>{label}</span>}
                    </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-destructive-inline text-center">
                    {collapsed && <p className="mb-1 font-semibold">{label}</p>}
                    You do not have permission <br />
                    to access this page.
                </TooltipContent>
            </Tooltip>
        );
    }

    if (collapsed) {
        return (
            <Tooltip>
                <TooltipTrigger asChild>
                    <MainPageLink
                        href={href}
                        isActive={isActive}
                        className={cn(
                            'flex w-full justify-center rounded-md py-2 transition-colors',
                            isActive
                                ? 'bg-accent/10 text-accent'
                                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40',
                        )}
                    >
                        <Icon className="h-4 w-4 shrink-0" />
                    </MainPageLink>
                </TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
        );
    }

    return (
        <MainPageLink
            href={href}
            isActive={isActive}
            className={cn(
                'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors select-none',
                isActive
                    ? 'bg-accent/10 text-accent font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40',
            )}
        >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 leading-none">{label}</span>
            {isActive && <span className="bg-accent h-1.5 w-1.5 shrink-0 rounded-full" />}
        </MainPageLink>
    );
}

// ─── Section group ───────────────────────────────────────────────────────────
function SidebarSection({ label, children }: { label: string; children: React.ReactNode }) {
    const collapsed = useCollapsed();
    return (
        <div className="flex flex-col gap-0.5">
            {collapsed ? (
                <div className="bg-border/40 mx-auto mt-3 h-px w-6" />
            ) : (
                <p className="text-muted-foreground/40 px-3 pt-3 pb-1 text-[10px] font-semibold tracking-[0.1em] uppercase select-none">
                    {label}
                </p>
            )}
            {children}
        </div>
    );
}

const validateSidebarScheduleInput = (input: string) => {
    if (input.startsWith('+')) {
        const minutes = parseInt(input.substring(1));
        if (isNaN(minutes) || minutes < 1 || minutes >= 1440) {
            return false;
        }
    } else {
        const [hours, minutes] = input.split(':', 2).map((x) => parseInt(x));
        if (
            typeof hours === 'undefined' ||
            isNaN(hours) ||
            hours < 0 ||
            hours > 23 ||
            typeof minutes === 'undefined' ||
            isNaN(minutes) ||
            minutes < 0 ||
            minutes > 59
        ) {
            return false;
        }
    }
    return true;
};

// ─── Sidebar server controls (labeled buttons) ───────────────────────────────
function SidebarServerControls() {
    const txConfigState = useAtomValue(txConfigStateAtom);
    const fxRunnerState = useAtomValue(fxRunnerStateAtom);
    const openConfirmDialog = useOpenConfirmDialog();
    const closeAllSheets = useCloseAllSheets();
    const { hasPerm } = useAdminPerms();
    const collapsed = useCollapsed();
    const fxsControlApi = useBackendApi({
        method: 'POST',
        path: '/fxserver/controls',
    });

    const handleControl = (action: 'start' | 'stop' | 'restart') => {
        const labels = { start: 'Starting server', stop: 'Stopping server', restart: 'Restarting server' };
        const callApi = () => {
            closeAllSheets();
            fxsControlApi({ data: { action }, toastLoadingMessage: `${labels[action]}...`, timeout: ApiTimeout.LONG });
        };
        if (action === 'start') {
            callApi();
        } else {
            openConfirmDialog({
                title: labels[action],
                message: `Are you sure you want to ${action} the server?`,
                onConfirm: callApi,
            });
        }
    };

    const hasControlPerm = hasPerm('control.server');

    if (txConfigState !== TxConfigState.Ready) {
        if (collapsed) return null;
        return <p className="text-muted-foreground/50 text-center text-xs">Server not configured</p>;
    }

    const isRunning = !fxRunnerState.isIdle;
    const isAlive = fxRunnerState.isChildAlive;

    if (collapsed) {
        return (
            <div className="flex flex-col items-center gap-1">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={() => handleControl(isRunning ? 'stop' : 'start')}
                            disabled={!hasControlPerm}
                            className={cn(
                                'flex h-8 w-8 items-center justify-center rounded-md border text-xs transition-colors disabled:pointer-events-none disabled:opacity-40',
                                isRunning
                                    ? 'border-destructive/40 bg-destructive/10 text-destructive-inline hover:bg-destructive/20'
                                    : 'border-success/40 bg-success/10 text-success-inline hover:bg-success/20',
                            )}
                        >
                            {isRunning ? (
                                <PowerOffIcon className="h-3.5 w-3.5" />
                            ) : (
                                <PowerIcon className="h-3.5 w-3.5" />
                            )}
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{isRunning ? 'Stop server' : 'Start server'}</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={() => handleControl('restart')}
                            disabled={!hasControlPerm || !isAlive}
                            className="border-info/40 bg-info/10 text-info-inline hover:bg-info/20 flex h-8 w-8 items-center justify-center rounded-md border transition-colors disabled:pointer-events-none disabled:opacity-40"
                        >
                            <RotateCcwIcon className="h-3.5 w-3.5" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Restart server</TooltipContent>
                </Tooltip>
            </div>
        );
    }

    return (
        <div className="flex gap-1.5">
            <button
                onClick={() => handleControl(isRunning ? 'stop' : 'start')}
                disabled={!hasControlPerm}
                className={cn(
                    'flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40',
                    isRunning
                        ? 'border-destructive/40 bg-destructive/10 text-destructive-inline hover:bg-destructive/20'
                        : 'border-success/40 bg-success/10 text-success-inline hover:bg-success/20',
                )}
                title={isRunning ? 'Stop server' : 'Start server'}
            >
                {isRunning ? <PowerOffIcon className="h-3.5 w-3.5" /> : <PowerIcon className="h-3.5 w-3.5" />}
                {isRunning ? 'Stop' : 'Start'}
            </button>

            <button
                onClick={() => handleControl('restart')}
                disabled={!hasControlPerm || !isAlive}
                className="border-info/40 bg-info/10 text-info-inline hover:bg-info/20 flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40"
                title="Restart server"
            >
                <RotateCcwIcon className="h-3.5 w-3.5" />
                Restart
            </button>
        </div>
    );
}

function SidebarServerExtraActions() {
    const fxRunnerState = useAtomValue(fxRunnerStateAtom);
    const status = useGlobalStatus();
    const { hasPerm } = useAdminPerms();
    const openPromptDialog = useOpenPromptDialog();
    const closeAllSheets = useCloseAllSheets();
    const schedulerApi = useBackendApi({
        method: 'POST',
        path: '/fxserver/schedule',
    });
    const fxsCommandsApi = useBackendApi({
        method: 'POST',
        path: '/fxserver/commands',
    });

    let nextScheduledText = 'none';
    let nextScheduledClasses = 'text-muted-foreground/75';
    let disableAddEditBtn = false;
    let isRestartSkipped = false;
    const hasScheduledRestart = typeof status?.scheduler.nextRelativeMs === 'number';
    if (hasScheduledRestart && status) {
        const relativeTime = msToShortDuration(status.scheduler.nextRelativeMs, { units: ['h', 'm'], delimiter: ' ' });
        const isLessThanMinute = status.scheduler.nextRelativeMs < 60_000;
        if (status.scheduler.nextSkip) {
            nextScheduledClasses = 'text-muted-foreground line-through';
            isRestartSkipped = true;
            nextScheduledText = 'skipped';
        } else {
            if (isLessThanMinute) {
                disableAddEditBtn = true;
                nextScheduledText = 'now';
            } else {
                nextScheduledText = relativeTime;
            }
            nextScheduledClasses = status.scheduler.nextIsTemp ? 'text-info-inline' : 'text-warning-inline';
        }
    }

    const onScheduleSubmit = (input: string) => {
        closeAllSheets();
        if (input.includes(',')) {
            txToast.error(
                {
                    title: 'Invalid scheduled restart time.',
                    msg: 'This field only accepts one restart time (for example +15 or 23:30).',
                },
                { duration: 9000 },
            );
            return;
        }
        if (!validateSidebarScheduleInput(input)) {
            txToast.error(`Invalid schedule time: ${input}`);
            return;
        }
        schedulerApi({
            data: { action: 'setNextTempSchedule', parameter: input },
            toastLoadingMessage: 'Scheduling server restart...',
        });
    };

    const handleSchedule = () => {
        openPromptDialog({
            suggestions: ['+5', '+10', '+15', '+30'],
            title: 'When should the server restart?',
            message: 'Use +MM for relative minutes, or HH:MM for absolute server time.',
            placeholder: '+15',
            required: true,
            submitLabel: hasScheduledRestart ? 'Edit' : 'Schedule',
            onSubmit: onScheduleSubmit,
        });
    };

    const handleCancelRestart = () => {
        closeAllSheets();
        schedulerApi({
            data: { action: 'setNextSkip', parameter: true },
            toastLoadingMessage: 'Cancelling next server restart...',
        });
    };

    const handleAnnounce = () => {
        if (!fxRunnerState.isChildAlive) return;
        openPromptDialog({
            title: 'Send Announcement',
            message: 'Type the message to broadcast to all players.',
            placeholder: 'announcement message',
            submitLabel: 'Send',
            required: true,
            onSubmit: (input) => {
                closeAllSheets();
                fxsCommandsApi({
                    data: { action: 'admin_broadcast', parameter: input },
                    toastLoadingMessage: 'Sending announcement...',
                });
            },
        });
    };

    const handleKickAll = () => {
        if (!fxRunnerState.isChildAlive) return;
        openPromptDialog({
            title: 'Kick All Players',
            message: 'Type the kick reason or leave it blank (press enter).',
            placeholder: 'kick reason',
            submitLabel: 'Send',
            onSubmit: (input) => {
                closeAllSheets();
                fxsCommandsApi({
                    data: { action: 'kick_all', parameter: input },
                    toastLoadingMessage: 'Kicking players...',
                });
            },
        });
    };

    const hasControlPerm = hasPerm('control.server');
    const hasAnnouncementPerm = hasPerm('announcement');
    const canAdjustRestart = hasControlPerm && !disableAddEditBtn;
    const canCancelRestart = hasControlPerm && hasScheduledRestart && !disableAddEditBtn && !isRestartSkipped;
    const cancelLabel = !hasScheduledRestart
        ? 'No restart to cancel'
        : isRestartSkipped
            ? 'Restart already cancelled'
            : 'Cancel next restart';
    const iconBtnClass =
        'flex h-8 w-8 items-center justify-center rounded-md border border-border/50 bg-background/35 text-muted-foreground transition-colors hover:bg-secondary/55 hover:text-foreground disabled:pointer-events-none disabled:opacity-40';
    const adjustLabel = hasScheduledRestart ? 'Adjust restart time' : 'Set restart time';

    return (
        <div className="mt-2 rounded-lg border border-border/40 bg-black/10 p-2.5">
            <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold whitespace-nowrap text-muted-foreground/75">Quick actions</p>
                <span
                    className={cn(
                        'flex h-7 items-center justify-center rounded-md border border-border/50 bg-background/30 px-1.5 text-[10px] font-semibold whitespace-nowrap',
                        nextScheduledClasses,
                    )}
                >
                    {nextScheduledText}
                </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={handleAnnounce}
                            className={cn(iconBtnClass, 'border-primary/35 text-primary')}
                            disabled={!hasAnnouncementPerm || !fxRunnerState.isChildAlive}
                            aria-label="Send announcement"
                        >
                            <MegaphoneIcon className="h-3.5 w-3.5" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Send announcement</TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={handleKickAll}
                            className={cn(iconBtnClass, 'border-warning/35 text-warning-inline')}
                            disabled={!hasControlPerm || !fxRunnerState.isChildAlive}
                            aria-label="Kick all players"
                        >
                            <KickAllIcon style={{ height: '0.9rem', width: '0.9rem', fill: 'currentcolor' }} />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Kick all players</TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={handleSchedule}
                            className={cn(iconBtnClass, 'border-info/35 text-info-inline')}
                            disabled={!canAdjustRestart}
                            aria-label={adjustLabel}
                        >
                            <SlidersHorizontalIcon className="h-3.5 w-3.5" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{adjustLabel}</TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={handleCancelRestart}
                            className={cn(iconBtnClass, 'border-destructive/35 text-destructive-inline hover:bg-destructive/10')}
                            disabled={!canCancelRestart}
                            aria-label={cancelLabel}
                        >
                            <XCircleIcon className="h-3.5 w-3.5" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{cancelLabel}</TooltipContent>
                </Tooltip>
            </div>
        </div>
    );
}

// ─── Bottom server status card ────────────────────────────────────────────────
function ServerStatusCard() {
    const serverName = useAtomValue(serverNameAtom);
    const playerCount = useAtomValue(playerCountAtom);
    const fxRunnerState = useAtomValue(fxRunnerStateAtom);
    const txConfigState = useAtomValue(txConfigStateAtom);
    const isOnline = fxRunnerState.isChildAlive;
    const collapsed = useCollapsed();
    const [showExtraActions, setShowExtraActions] = useState(false);

    if (collapsed) {
        return (
            <div className="flex flex-col items-center gap-2">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span
                            className={cn(
                                'h-2 w-2 rounded-full',
                                isOnline ? 'bg-success animate-pulse' : 'bg-muted-foreground/40',
                            )}
                        />
                    </TooltipTrigger>
                    <TooltipContent side="right">
                        <p className="font-semibold">{serverName}</p>
                        <p className="text-muted-foreground text-xs">
                            {playerCount} {playerCount === 1 ? 'player' : 'players'} online
                        </p>
                    </TooltipContent>
                </Tooltip>
                <SidebarServerControls />
            </div>
        );
    }

    return (
        <div className="border-border/50 bg-card/60 rounded-xl border p-3">
            {/* Server name + indicator */}
            <div className="mb-2.5 flex items-start gap-2">
                <span
                    className={cn(
                        'mt-1 h-2 w-2 shrink-0 rounded-full',
                        isOnline ? 'bg-success animate-pulse' : 'bg-muted-foreground/40',
                    )}
                />
                <div className="min-w-0">
                    <p className="text-foreground truncate text-sm leading-tight font-semibold">{serverName}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                        {playerCount} {playerCount === 1 ? 'player' : 'players'} online
                    </p>
                </div>
            </div>
            <SidebarServerControls />
            {txConfigState === TxConfigState.Ready && (
                <>
                    <button
                        type="button"
                        onClick={() => setShowExtraActions((v) => !v)}
                        className="mt-2 flex w-full items-center justify-between rounded-md border border-border/40 bg-background/30 px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground"
                        aria-expanded={showExtraActions}
                    >
                        <span>{showExtraActions ? 'Hide extra actions' : 'More actions'}</span>
                        {showExtraActions ? <ChevronUpIcon className="h-3.5 w-3.5" /> : <ChevronDownIcon className="h-3.5 w-3.5" />}
                    </button>
                    {showExtraActions && <SidebarServerExtraActions />}
                </>
            )}
        </div>
    );
}

// ─── User account dropdown ────────────────────────────────────────────────────
function SidebarUserButton() {
    const { authData, logout } = useAuth();
    const { setAccountModalOpen } = useAccountModal();
    const collapsed = useCollapsed();
    if (!authData) return null;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    className={cn(
                        'hover:bg-secondary/40 flex w-full items-center rounded-md text-sm transition-colors focus:outline-none',
                        collapsed ? 'justify-center px-0 py-1.5' : 'gap-2.5 px-2 py-2',
                    )}
                >
                    <Avatar
                        className="h-7 w-7 shrink-0 rounded-md text-xs"
                        username={authData.name}
                        profilePicture={authData.profilePicture}
                    />
                    {!collapsed && (
                        <span className="text-foreground flex-1 truncate text-left text-sm leading-none font-medium">
                            {authData.name}
                        </span>
                    )}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align={collapsed ? 'center' : 'start'} className="w-52">
                <DropdownMenuItem className="cursor-pointer" onClick={() => setAccountModalOpen(true)}>
                    <KeyRoundIcon className="mr-2 h-4 w-4" />
                    Your Account
                </DropdownMenuItem>
                <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => openExternalLink('https://discord.gg/6FcqBYwxH5')}
                >
                    <FaDiscord size="14" className="mr-2" />
                    Support
                </DropdownMenuItem>
                {window.txConsts.isWebInterface && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="cursor-pointer" onClick={() => logout()}>
                            <LogOutIcon className="mr-2 h-4 w-4" />
                            Logout
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function LeftSidebar() {
    const { isLg } = useShellBreakpoints();
    const [collapsed, setCollapsed] = useState(() => {
        try {
            return localStorage.getItem('sidebar-collapsed') === 'true';
        } catch {
            return false;
        }
    });

    const toggle = () => {
        const next = !collapsed;
        setCollapsed(next);
        try {
            localStorage.setItem('sidebar-collapsed', String(next));
        } catch {}
    };

    return (
        <SidebarCollapsedCtx.Provider value={collapsed}>
            <aside
                className={cn(
                    'border-border/40 h-screen shrink-0 flex-col overflow-hidden border-r bg-[#0c0e16] transition-[width] duration-200',
                    isLg ? 'flex' : 'hidden',
                    collapsed ? 'w-14' : 'w-60',
                )}
            >
                {/* Logo + collapse toggle */}
                <div
                    className={cn(
                        'border-border/40 flex h-14 shrink-0 items-center border-b',
                        collapsed ? 'justify-center' : 'justify-between px-4',
                    )}
                >
                    {collapsed ? (
                        <button
                            onClick={toggle}
                            className="flex h-8 w-8 items-center justify-center rounded-md opacity-90 transition-opacity hover:opacity-100"
                            title="Expand sidebar"
                        >
                            <img src="/logo2.svg" alt="fxPanel" className="h-8 w-8 rounded-lg" />
                        </button>
                    ) : (
                        <>
                            <NavLink
                                href="/"
                                className="flex flex-1 items-center justify-center opacity-90 transition-opacity hover:opacity-100"
                            >
                                <LogoFullSquareGreen className="h-8" />
                            </NavLink>
                            <button
                                onClick={toggle}
                                className="text-muted-foreground/50 hover:bg-secondary/40 hover:text-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors"
                                title="Collapse sidebar"
                            >
                                <ChevronLeftIcon className="h-4 w-4" />
                            </button>
                        </>
                    )}
                </div>

                {/* Navigation */}
                <SidebarNavContent />

                {/* Bottom: server status + user */}
                <div
                    className={cn(
                        'border-border/40 flex shrink-0 flex-col gap-2 border-t',
                        collapsed ? 'items-center p-2' : 'p-3',
                    )}
                >
                    <ServerStatusCard />
                    <SidebarUserButton />
                </div>
            </aside>
        </SidebarCollapsedCtx.Provider>
    );
}

// ─── Reusable navigation body (used by desktop sidebar + mobile sheet) ────────
export function SidebarNavContent() {
    const { hasPerm } = useAdminPerms();
    const { pages: addonPages } = useAddonLoader();
    const collapsed = useCollapsed();

    return (
        <nav
            className={cn(
                'flex flex-1 flex-col overflow-y-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                collapsed ? 'px-1' : 'px-2',
            )}
        >
            <SidebarSection label="Overview">
                <SidebarNavItem href="/" icon={LayoutDashboardIcon} label="Dashboard" />
            </SidebarSection>

            <SidebarSection label="Players">
                <SidebarNavItem href="/players" icon={UsersIcon} label="Players" />
                <SidebarNavItem href="/whitelist" icon={ShieldCheckIcon} label="Whitelist" />
                <SidebarNavItem href="/history" icon={ClockIcon} label="History" />
                <SidebarNavItem
                    href="/reports"
                    icon={FlagIcon}
                    label="Reports"
                    disabled={!hasPerm('players.reports')}
                />
            </SidebarSection>

            <SidebarSection label="Server">
                <SidebarNavItem
                    href="/server/console"
                    icon={TerminalIcon}
                    label="Live Console"
                    disabled={!hasPerm('console.view')}
                />
                <SidebarNavItem href="/server/resources" icon={BoxIcon} label="Resources" />
                <SidebarNavItem
                    href="/server/cfg-editor"
                    icon={FileCodeIcon}
                    label="CFG Editor"
                    disabled={!hasPerm('server.cfg.editor')}
                />
                <SidebarNavItem
                    href="/server/server-log"
                    icon={FileTextIcon}
                    label="Server Log"
                    disabled={!hasPerm('server.log.view')}
                />
                <SidebarNavItem href="/admins" icon={ShieldIcon} label="Admins" disabled={!hasPerm('manage.admins')} />
            </SidebarSection>

            <SidebarSection label="Analytics">
                <SidebarNavItem href="/insights" icon={ActivityIcon} label="Insights" />
                <SidebarNavItem href="/server/player-drops" icon={TrendingDownIcon} label="Player Drops" />
                <SidebarNavItem
                    href="/reports/analytics"
                    icon={BarChart3Icon}
                    label="Report Analytics"
                    disabled={!hasPerm('players.reports')}
                />
            </SidebarSection>

            <SidebarSection label="Addons">
                <SidebarNavItem
                    href="/addons"
                    icon={BlocksIcon}
                    label="Addon Manager"
                    disabled={!hasPerm('all_permissions')}
                />
                {addonPages.map((page) => (
                    <SidebarNavItem
                        key={page.path}
                        href={page.path}
                        icon={BlocksIcon}
                        label={page.title}
                        disabled={page.permission ? !hasPerm(page.permission) : false}
                    />
                ))}
            </SidebarSection>

            <SidebarSection label="System">
                <SidebarNavItem
                    href="/system/action-log"
                    icon={ClipboardListIcon}
                    label="Action Log"
                    disabled={!hasPerm('txadmin.log.view')}
                />
                <SidebarNavItem
                    href="/system/console-log"
                    icon={ScrollTextIcon}
                    label="Console Log"
                    disabled={!hasPerm('txadmin.log.view')}
                />
                <SidebarNavItem href="/system/diagnostics" icon={SlidersHorizontalIcon} label="Diagnostics" />
                <SidebarNavItem
                    href="/system/artifacts"
                    icon={PackageIcon}
                    label="Artifacts"
                    disabled={!hasPerm('all_permissions')}
                />
                <SidebarNavItem
                    href="/settings"
                    icon={Settings2Icon}
                    label="Settings"
                    disabled={!hasPerm('settings.view')}
                />
                {import.meta.env.DEV && (
                    <SidebarNavItem
                        href="/advanced"
                        icon={WrenchIcon}
                        label="Advanced"
                        disabled={!hasPerm('all_permissions')}
                    />
                )}
            </SidebarSection>
        </nav>
    );
}

// Re-export so the mobile sheet can use the same bottom controls.
export { ServerStatusCard, SidebarUserButton, SidebarCollapsedCtx };
