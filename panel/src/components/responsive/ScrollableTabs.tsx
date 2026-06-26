import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ScrollableTabsProps = {
    children: ReactNode;
    className?: string;
    'aria-label'?: string;
};

/**
 * Horizontal tab list that scrolls on narrow viewports instead of overflowing.
 */
export function ScrollableTabs({ children, className, 'aria-label': ariaLabel }: ScrollableTabsProps) {
    return (
        <div className={cn('-mx-1 overflow-x-auto px-1', className)} role="tablist" aria-label={ariaLabel}>
            <div className="border-border flex min-w-max gap-1 border-b">{children}</div>
        </div>
    );
}
