import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type SplitPaneLayoutProps = {
    left?: ReactNode;
    center: ReactNode;
    right?: ReactNode;
    className?: string;
    leftClassName?: string;
    centerClassName?: string;
    rightClassName?: string;
};

/**
 * Three-column editor layout: stacks vertically below shell-xl, side-by-side at xl+.
 */
export function SplitPaneLayout({
    left,
    center,
    right,
    className,
    leftClassName,
    centerClassName,
    rightClassName,
}: SplitPaneLayoutProps) {
    return (
        <div className={cn('shell-xl:flex-row flex min-h-0 min-w-0 flex-1 flex-col gap-3', className)}>
            {left ? (
                <aside
                    className={cn(
                        'bg-card shell-xl:w-44 shell-xl:max-w-[12rem] shell-2xl:w-48 flex min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-xl border',
                        leftClassName,
                    )}
                >
                    {left}
                </aside>
            ) : null}
            <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col', centerClassName)}>{center}</div>
            {right ? (
                <aside
                    className={cn(
                        'bg-card shell-xl:w-64 shell-xl:max-w-[18rem] shell-2xl:w-72 flex min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-xl border',
                        rightClassName,
                    )}
                >
                    {right}
                </aside>
            ) : null}
        </div>
    );
}
