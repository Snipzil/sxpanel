import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PageToolbarProps = {
    children: ReactNode;
    className?: string;
};

/**
 * Flex-wrap toolbar row for filters, search, and actions on narrow viewports.
 */
export function PageToolbar({ children, className }: PageToolbarProps) {
    return <div className={cn('flex min-w-0 flex-wrap items-center gap-2 sm:gap-3', className)}>{children}</div>;
}
