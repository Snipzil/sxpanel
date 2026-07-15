import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { cn } from '@/lib/utils';

import { openExternalLink } from '@/lib/navigation';

import { KeyRoundIcon, LogOutIcon, MenuIcon, UsersIcon } from 'lucide-react';

import Avatar from '@/components/Avatar';

import { useAuth } from '@/hooks/auth';

import { useGlobalMenuSheet, usePlayerlistSheet } from '@/hooks/sheets';

import { DiscordIcon } from '@/components/icons/discord-icon';

import { useAtomValue } from 'jotai';

import { serverNameAtom, fxRunnerStateAtom } from '@/hooks/status';

import { playerCountAtom } from '@/hooks/playerlist';

import { useAccountModal } from '@/hooks/dialogs';

import { useAddonWidgets } from '@/hooks/addons';

import { useLocale } from '@/hooks/locale';

const headerIconButtonClassName =
    'text-muted-foreground hover:text-foreground hover:bg-secondary/60 border-border/50 bg-secondary/30 focus-visible:ring-ring ring-offset-background relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden [&>svg]:size-4';

function ServerIdentity() {
    const { t } = useLocale();

    const serverName = useAtomValue(serverNameAtom);

    const playerCount = useAtomValue(playerCountAtom);

    const fxRunnerState = useAtomValue(fxRunnerStateAtom);

    const isOnline = fxRunnerState.isChildAlive;

    return (
        <div className="flex min-w-0 items-start gap-2">
            <span
                className={cn(
                    'mt-1 size-2 shrink-0 rounded-full',

                    isOnline ? 'bg-success animate-pulse' : 'bg-muted-foreground/40',
                )}
                title={isOnline ? t('panel.shell.header.server_online') : t('panel.shell.header.server_offline')}
            />

            <div className="min-w-0 leading-tight">
                <p className="text-foreground truncate text-sm font-semibold">{serverName || 'sxPanel'}</p>

                <p className="text-muted-foreground mt-0.5 truncate text-xs">
                    <span className="font-mono font-medium tabular-nums">{playerCount}</span>{' '}
                    {playerCount === 1 ? t('panel.shell.header.player_one') : t('panel.shell.header.player_other')}
                </p>
            </div>
        </div>
    );
}

type IconButtonProps = {
    label: string;

    icon: React.ReactNode;

    badge?: React.ReactNode;

    onClick: () => void;
};

function IconButton({ label, icon, badge, onClick }: IconButtonProps) {
    return (
        <button type="button" title={label} aria-label={label} onClick={onClick} className={headerIconButtonClassName}>
            {icon}

            {badge ? (
                <span className="bg-primary text-primary-foreground absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[9px] leading-none font-bold">
                    {badge}
                </span>
            ) : null}
        </button>
    );
}

function AuthedHeaderFragment() {
    const { t } = useLocale();

    const { authData, logout } = useAuth();

    const { setAccountModalOpen } = useAccountModal();

    const headerDropdownWidgets = useAddonWidgets('header.dropdown');

    if (!authData) return null;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                className={headerIconButtonClassName}
                title={t('panel.shell.header.account')}
                aria-label={t('panel.shell.header.account')}
            >
                <Avatar
                    className="size-7 rounded-md text-[10px]"
                    username={authData.name}
                    profilePicture={authData.profilePicture}
                />
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-52">
                <div className="border-border/40 border-b px-2 pt-1 pb-2">
                    <p className="text-foreground truncate text-sm leading-tight font-semibold">{authData.name}</p>

                    <p className="text-muted-foreground/70 mt-0.5 text-xs">{t('panel.shell.header.signed_in')}</p>
                </div>

                <DropdownMenuItem className="cursor-pointer" onClick={() => setAccountModalOpen(true)}>
                    <KeyRoundIcon className="mr-2 size-4" />

                    {t('panel.shell.header.your_account')}
                </DropdownMenuItem>

                <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => openExternalLink('https://discord.gg/hUM3pQeGFc')}
                >
                    <DiscordIcon className="mr-2 size-3.5" />

                    {t('panel.shell.header.support')}
                </DropdownMenuItem>

                {window.txConsts.isWebInterface && (
                    <>
                        <DropdownMenuSeparator />

                        <DropdownMenuItem className="cursor-pointer" onClick={logout}>
                            <LogOutIcon className="mr-2 size-4" />

                            {t('panel.shell.header.logout')}
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

export function Header() {
    const { t } = useLocale();

    const { setIsSheetOpen: openMenu } = useGlobalMenuSheet();

    const { setIsSheetOpen: openPlayers } = usePlayerlistSheet();

    const playerCount = useAtomValue(playerCountAtom);

    return (
        <header className="tx-shell-mobile-header border-border/40 sticky top-0 z-20 shrink-0 border-b bg-[#0c0e16]">
            <div className="flex h-14 w-full items-center gap-1.5 px-2.5 sm:gap-2 sm:px-3">
                <IconButton
                    label={t('panel.shell.header.open_menu')}
                    icon={<MenuIcon />}
                    onClick={() => openMenu(true)}
                />

                <div className="min-w-0 flex-1 px-1">
                    <ServerIdentity />
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                    <IconButton
                        label={t('panel.shell.header.players')}
                        icon={<UsersIcon />}
                        badge={playerCount > 0 ? (playerCount > 99 ? '99+' : playerCount) : null}
                        onClick={() => openPlayers(true)}
                    />

                    <AuthedHeaderFragment />
                </div>
            </div>
        </header>
    );
}
