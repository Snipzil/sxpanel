import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ResponsiveDataTableProps = {
    children: ReactNode;
    className?: string;
};

/**
 * Wraps wide HTML tables with horizontal scroll and min-w-0 containment.
 */
export function ResponsiveDataTable({ children, className }: ResponsiveDataTableProps) {
    return <div className={cn('min-w-0 overflow-x-auto', className)}>{children}</div>;
}
