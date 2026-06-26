import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function KeyValueRow({
    label,
    value,
    mono = false,
    breakAll = false,
}: {
    label: string;
    value: ReactNode;
    mono?: boolean;
    breakAll?: boolean;
}) {
    return (
        <div className="border-border/40 flex flex-col gap-0.5 border-b py-2.5 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
            <span className="text-muted-foreground/60 text-[11px] font-semibold tracking-widest uppercase sm:min-w-[9rem] sm:shrink-0">
                {label}
            </span>
            <div
                className={cn(
                    'text-foreground text-sm sm:text-right',
                    mono && 'font-mono text-xs',
                    breakAll && 'break-all',
                )}
            >
                {value}
            </div>
        </div>
    );
}

export function SectionLabel({ children }: { children: ReactNode }) {
    return <p className="text-muted-foreground/60 text-[11px] font-semibold tracking-widest uppercase">{children}</p>;
}

export function SlimPercentBar({
    value,
    className,
    trackClassName,
}: {
    value: number;
    className?: string;
    trackClassName?: string;
}) {
    const pct = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
    return (
        <div className={cn('bg-muted h-1.5 w-full overflow-hidden rounded-full', trackClassName)}>
            <div
                className={cn('bg-primary h-full rounded-full transition-[width]', className)}
                style={{ width: `${pct}%` }}
            />
        </div>
    );
}
