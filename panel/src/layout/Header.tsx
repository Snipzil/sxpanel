import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { openExternalLink } from '@/lib/navigation';
import { KeyRoundIcon, LogOutIcon, MenuIcon, UsersIcon, CircleIcon } from 'lucide-react';
import Avatar from '@/components/Avatar';
import { useAuth } from '@/hooks/auth';
import { useGlobalMenuSheet, usePlayerlistSheet } from '@/hooks/sheets';
import { FaDiscord } from 'react-icons/fa';
import { useAtomValue } from 'jotai';
import { serverNameAtom, fxRunnerStateAtom } from '@/hooks/status';
import { playerCountAtom } from '@/hooks/playerlist';
import { useAccountModal } from '@/hooks/dialogs';
import { useAddonWidgets } from '@/hooks/addons';
import { useShellBreakpoints } from '@/hooks/useShellBreakpoints';

// ─── Identity block (name + status) ───────────────────────────────────────────
function ServerIdentity() {
    const serverName = useAtomValue(serverNameAtom);
    const playerCount = useAtomValue(playerCountAtom);
    const fxRunnerState = useAtomValue(fxRunnerStateAtom);
    const isOnline = fxRunnerState.isChildAlive;

    return (
        <div className="flex min-w-0 items-center gap-2.5">
            <span
                className={cn('relative flex h-2 w-2 shrink-0 items-center justify-center')}
                title={isOnline ? 'Server online' : 'Server offline'}
            >
                {isOnline && (
                    <span className="bg-success/60 absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" />
                )}
                <span
                    className={cn(
                        'relative inline-flex h-1.5 w-1.5 rounded-full',
                        isOnline ? 'bg-success' : 'bg-muted-foreground/40',
                    )}
                />
            </span>
            <div className="min-w-0 leading-tight">
                <h1 className="text-foreground truncate text-sm font-semibold tracking-tight">
                    {serverName || 'fxPanel'}
                </h1>
                <p className="text-muted-foreground/70 flex items-center gap-1 truncate text-[11px]">
                    <CircleIcon aria-hidden="true" className="h-1.5 w-1.5 fill-current opacity-60" />
                    <span className="font-mono font-medium">{playerCount}</span>
                    <span className="opacity-70">{playerCount === 1 ? 'player' : 'players'}</span>
                </p>
            </div>
        </div>
    );
}

// ─── Icon pill button ─────────────────────────────────────────────────────────
type IconButtonProps = {
    label: string;
    icon: React.ReactNode;
    badge?: React.ReactNode;
    onClick: () => void;
};

function IconButton({ label, icon, badge, onClick }: IconButtonProps) {
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            onClick={onClick}
            className="text-muted-foreground hover:text-foreground hover:bg-secondary/60 border-border/50 bg-secondary/30 focus-visible:ring-ring ring-offset-background relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden [&>svg]:size-4"
        >
            {icon}
            {badge ? (
                <span className="bg-primary text-primary-foreground absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[9px] leading-none font-bold">
                    {badge}
                </span>
            ) : null}
        </button>
    );
}

// ─── Account dropdown ─────────────────────────────────────────────────────────
function AuthedHeaderFragment() {
    const { authData, logout } = useAuth();
    const { setAccountModalOpen } = useAccountModal();
    const headerDropdownWidgets = useAddonWidgets('header.dropdown');
    if (!authData) return null;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                className="focus-visible:ring-ring ring-offset-background inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:brightness-110 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
                title="Account"
                aria-label="Account"
            >
                <Avatar
                    className="border-border/50 h-8 w-8 rounded-md border text-xs"
                    username={authData.name}
                    profilePicture={authData.profilePicture}
                />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
                <div className="border-border/40 border-b px-2 pt-1 pb-2">
                    <p className="text-foreground truncate text-sm leading-tight font-semibold">{authData.name}</p>
                    <p className="text-muted-foreground/70 mt-0.5 text-xs">Signed in</p>
                </div>
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
                        <DropdownMenuItem className="cursor-pointer" onClick={logout}>
                            <LogOutIcon className="mr-2 h-4 w-4" />
                            Logout
                        </DropdownMenuItem>
                    </>
                )}
                {headerDropdownWidgets.length > 0 && (
                    <>
                        <DropdownMenuSeparator />
                        {headerDropdownWidgets.map((w) => (
                            <w.Component key={`${w.addonId}-${w.title}`} />
                        ))}
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

// ─── Header (mobile / tablet only — hidden on lg+ where LeftSidebar is shown) ─
export function Header() {
    const { setIsSheetOpen: openMenu } = useGlobalMenuSheet();
    const { setIsSheetOpen: openPlayers } = usePlayerlistSheet();
    const playerCount = useAtomValue(playerCountAtom);
    const { isLg } = useShellBreakpoints();

    return (
        <header
            className={cn(
                'border-border/40 sticky top-0 z-20 border-b bg-[#0c0e16]/95 shadow-lg shadow-black/30 backdrop-blur-sm',
                isLg ? 'hidden' : 'block',
            )}
        >
            <div className="flex h-14 w-full items-center gap-2 px-3">
                <IconButton label="Open menu" icon={<MenuIcon />} onClick={() => openMenu(true)} />
                <div className="bg-border/40 h-6 w-px" />
                <div className="min-w-0 flex-1">
                    <ServerIdentity />
                </div>
                <IconButton
                    label="Players"
                    icon={<UsersIcon />}
                    badge={playerCount > 0 ? (playerCount > 99 ? '99+' : playerCount) : null}
                    onClick={() => openPlayers(true)}
                />
                <AuthedHeaderFragment />
            </div>
        </header>
    );
}
