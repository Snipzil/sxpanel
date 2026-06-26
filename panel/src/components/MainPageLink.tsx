import { useCloseAllSheets } from '@/hooks/sheets';
import { pageErrorStatusAtom, useContentRefresh } from '@/hooks/pages';
import { useAtomValue } from 'jotai';
import type { MouseEvent, ReactNode, Ref } from 'react';
import { useLocation, useRoute } from 'wouter';
import { Button, buttonVariants } from './ui/button';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

type MainPageLinkProps = {
    isActive?: boolean;
    href: string;
    children: ReactNode;
    className?: string;
    disabled?: boolean;
    ref?: Ref<HTMLAnchorElement>;
};

function MainPageLink({ isActive, href, children, className, disabled, ref }: MainPageLinkProps) {
    const isPageInError = useAtomValue(pageErrorStatusAtom);
    const refreshContent = useContentRefresh();
    const closeAllSheets = useCloseAllSheets();
    const [, navigate] = useLocation();
    const checkOnClick = (e: MouseEvent<HTMLAnchorElement>) => {
        if (disabled) {
            e.preventDefault();
            return;
        }
        closeAllSheets();
        if (isActive || isPageInError) {
            console.log('Page is already active or in error state. Forcing error boundry + router re-render.');
            refreshContent();
            e.preventDefault();
            return;
        }
        if (e.button === 0 && !e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey) {
            e.preventDefault();
            navigate(href);
        }
    };

    return (
        <a ref={ref} href={href} onClick={checkOnClick} className={className}>
            {children}
        </a>
    );
}

export default MainPageLink;

type MenuNavProps = {
    href: string;
    children: ReactNode;
    className?: string;
    disabled?: boolean;
};

export function MenuNavLink({ href, children, className, disabled }: MenuNavProps) {
    const [isActive] = useRoute(href);
    if (disabled) {
        return (
            <Tooltip>
                <TooltipTrigger className="cursor-help">
                    <Button variant="ghost" className="w-full justify-start py-1" disabled>
                        {children}
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-destructive-inline text-center">
                    You do not have permission <br />
                    to access this page.
                </TooltipContent>
            </Tooltip>
        );
    } else {
        return (
            <MainPageLink
                href={href}
                isActive={isActive}
                className={cn(
                    buttonVariants({ variant: isActive ? 'secondary' : 'ghost' }),
                    'w-full justify-start py-1',
                    className,
                )}
            >
                {children}
            </MainPageLink>
        );
    }
}

type NavLinkProps = {
    href: string;
    children: ReactNode;
    className?: string;
};

export function NavLink({ href, children, className }: NavLinkProps) {
    const [isActive] = useRoute(href);

    return (
        <MainPageLink href={href} isActive={isActive} className={className}>
            {children}
        </MainPageLink>
    );
}
