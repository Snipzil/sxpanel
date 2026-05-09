import * as React from 'react';
import {
    NavigationMenu,
    NavigationMenuContent,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuList,
    NavigationMenuTrigger,
} from '@/components/ui/navigation-menu';
import { cn } from '@/lib/utils';
import { useRoute } from 'wouter';
import MainPageLink from '@/components/MainPageLink';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAdminPerms } from '@/hooks/auth';
import { useAddonLoader } from '@/hooks/addons';

const navLinkBase = `relative inline-flex h-9 items-center justify-center rounded-md px-3 text-sm transition-colors focus:outline-hidden disabled:pointer-events-none disabled:opacity-50 ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`;
const navLinkActive = `text-foreground font-medium after:absolute after:bottom-0.5 after:left-3 after:right-3 after:h-px after:rounded-full after:bg-accent`;
const navLinkDefault = `text-muted-foreground font-normal hover:text-foreground hover:bg-secondary/40`;

type HeaderMenuLinkProps = {
    href: string;
    children: React.ReactNode;
    className?: string;
    disabled?: boolean;
};
function HeaderMenuLink(props: HeaderMenuLinkProps) {
    const [isActive] = useRoute(props.href);
    return (
        <NavigationMenuLink asChild active={isActive}>
            {props.disabled ? (
                <Tooltip>
                    <TooltipTrigger className="cursor-help">
                        <a
                            className={cn(
                                navLinkBase,
                                navLinkDefault,
                                'pointer-events-none opacity-40',
                                props.className,
                            )}
                        >
                            {props.children}
                        </a>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-destructive-inline text-center">
                        You do not have permission <br />
                        to access this page.
                    </TooltipContent>
                </Tooltip>
            ) : (
                <MainPageLink
                    href={props.href}
                    isActive={isActive}
                    className={cn(navLinkBase, isActive ? navLinkActive : navLinkDefault, props.className)}
                >
                    {props.children}
                </MainPageLink>
            )}
        </NavigationMenuLink>
    );
}

function HeaderMenuItem(props: HeaderMenuLinkProps) {
    return (
        <NavigationMenuItem>
            <HeaderMenuLink href={props.href} disabled={props.disabled} className={props.className}>
                {props.children}
            </HeaderMenuLink>
        </NavigationMenuItem>
    );
}

const dropdownLinkClass = `w-44 justify-start rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors`;
const dropdownContentClass = `flex list-none flex-col gap-0.5 p-2 min-w-[10rem]`;

//NOTE: breaking NavigationMenuItem into a separate menu because the dropdown is positioned wrong otherwise
export default function DesktopNavbar() {
    const { hasPerm } = useAdminPerms();
    const { pages: addonPages } = useAddonLoader();

    const handleTriggerClick = (e: React.MouseEvent<HTMLElement>) => {
        if (e.currentTarget.dataset['state'] === 'open') e.preventDefault();
    };

    return (
        <div className="flex flex-row items-center gap-0.5 select-none">
            <NavigationMenu>
                <NavigationMenuList>
                    <HeaderMenuItem href="/players">Players</HeaderMenuItem>
                    <HeaderMenuItem href="/history">History</HeaderMenuItem>
                </NavigationMenuList>
            </NavigationMenu>

            {hasPerm('players.reports') && (
                <NavigationMenu>
                    <NavigationMenuList>
                        <NavigationMenuItem>
                            <NavigationMenuTrigger
                                className={cn(
                                    navLinkBase,
                                    navLinkDefault,
                                    'data-[state=open]:text-foreground data-[state=open]:bg-secondary/40',
                                )}
                                onClick={handleTriggerClick}
                            >
                                Reports
                            </NavigationMenuTrigger>
                            <NavigationMenuContent className={dropdownContentClass}>
                                <HeaderMenuLink className={dropdownLinkClass} href="/reports">
                                    Open Tickets
                                </HeaderMenuLink>
                                <HeaderMenuLink className={dropdownLinkClass} href="/reports/analytics">
                                    Analytics
                                </HeaderMenuLink>
                            </NavigationMenuContent>
                        </NavigationMenuItem>
                    </NavigationMenuList>
                </NavigationMenu>
            )}

            <NavigationMenu>
                <NavigationMenuList>
                    <NavigationMenuItem>
                        <NavigationMenuTrigger
                            className={cn(
                                navLinkBase,
                                navLinkDefault,
                                'data-[state=open]:text-foreground data-[state=open]:bg-secondary/40',
                            )}
                            onClick={handleTriggerClick}
                        >
                            Insights
                        </NavigationMenuTrigger>
                        <NavigationMenuContent className={dropdownContentClass}>
                            <HeaderMenuLink className={dropdownLinkClass} href="/insights">
                                Overview
                            </HeaderMenuLink>
                            <HeaderMenuLink className={dropdownLinkClass} href="/server/player-drops">
                                Player Drops
                            </HeaderMenuLink>
                        </NavigationMenuContent>
                    </NavigationMenuItem>
                </NavigationMenuList>
            </NavigationMenu>

            <NavigationMenu>
                <NavigationMenuList>
                    <HeaderMenuItem href="/whitelist">Whitelist</HeaderMenuItem>
                    <HeaderMenuItem href="/admins" disabled={!hasPerm('manage.admins')}>
                        Admins
                    </HeaderMenuItem>
                    <HeaderMenuItem href="/settings" disabled={!hasPerm('settings.view')}>
                        Settings
                    </HeaderMenuItem>
                </NavigationMenuList>
            </NavigationMenu>

            <NavigationMenu>
                <NavigationMenuList>
                    <NavigationMenuItem>
                        <NavigationMenuTrigger
                            className={cn(
                                navLinkBase,
                                navLinkDefault,
                                'data-[state=open]:text-foreground data-[state=open]:bg-secondary/40',
                            )}
                            onClick={handleTriggerClick}
                        >
                            System
                        </NavigationMenuTrigger>
                        <NavigationMenuContent className={dropdownContentClass}>
                            <HeaderMenuLink className={dropdownLinkClass} href="/system/master-actions">
                                Master Actions
                            </HeaderMenuLink>
                            <HeaderMenuLink className={dropdownLinkClass} href="/system/diagnostics">
                                Diagnostics
                            </HeaderMenuLink>
                            <HeaderMenuLink
                                className={dropdownLinkClass}
                                href="/system/console-log"
                                disabled={!hasPerm('txadmin.log.view')}
                            >
                                Console Log
                            </HeaderMenuLink>
                            <HeaderMenuLink
                                className={dropdownLinkClass}
                                href="/system/action-log"
                                disabled={!hasPerm('txadmin.log.view')}
                            >
                                Action Log
                            </HeaderMenuLink>
                            <HeaderMenuLink
                                className={dropdownLinkClass}
                                href="/system/artifacts"
                                disabled={!hasPerm('all_permissions')}
                            >
                                Artifacts
                            </HeaderMenuLink>
                        </NavigationMenuContent>
                    </NavigationMenuItem>
                </NavigationMenuList>
            </NavigationMenu>

            {addonPages.length > 0 && (
                <NavigationMenu>
                    <NavigationMenuList>
                        {addonPages.length === 1 ? (
                            <HeaderMenuItem
                                href={addonPages[0].path}
                                disabled={addonPages[0].permission ? !hasPerm(addonPages[0].permission) : false}
                            >
                                {addonPages[0].title}
                            </HeaderMenuItem>
                        ) : (
                            <NavigationMenuItem>
                                <NavigationMenuTrigger
                                    className={cn(
                                        navLinkBase,
                                        navLinkDefault,
                                        'data-[state=open]:text-foreground data-[state=open]:bg-secondary/40',
                                    )}
                                    onClick={handleTriggerClick}
                                >
                                    Addons
                                </NavigationMenuTrigger>
                                <NavigationMenuContent className={dropdownContentClass}>
                                    {addonPages.map((page) => (
                                        <HeaderMenuLink
                                            key={page.path}
                                            className={dropdownLinkClass}
                                            href={page.path}
                                            disabled={page.permission ? !hasPerm(page.permission) : false}
                                        >
                                            {page.title}
                                        </HeaderMenuLink>
                                    ))}
                                </NavigationMenuContent>
                            </NavigationMenuItem>
                        )}
                    </NavigationMenuList>
                </NavigationMenu>
            )}
        </div>
    );
}
