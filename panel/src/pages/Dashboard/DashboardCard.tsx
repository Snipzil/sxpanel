import { cn } from '@/lib/utils';

/**
 * Shared outer shell for every dashboard card.
 * Same color as the page background with just a soft theme-colored outline (no elevation/shadow),
 * so panels blend into the page instead of floating on top of it.
 */
export const dashboardCardClass = 'bg-background border-border/80 rounded-xl border';

type DashboardCardHeaderProps = {
    icon: React.ElementType;
    title: string;
    iconClassName?: string;
    children?: React.ReactNode;
};

/** Card title row: icon chip + real title text (not the old tiny tracking-widest uppercase label). */
export function DashboardCardHeader({ icon: Icon, title, iconClassName, children }: DashboardCardHeaderProps) {
    return (
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
            <div className="flex min-w-0 items-center gap-2.5">
                <div
                    className={cn(
                        'bg-secondary/50 text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-lg',
                        iconClassName,
                    )}
                >
                    <Icon className="size-3.5" />
                </div>
                <h3 className="text-foreground truncate text-sm font-semibold">{title}</h3>
            </div>
            {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
        </div>
    );
}
