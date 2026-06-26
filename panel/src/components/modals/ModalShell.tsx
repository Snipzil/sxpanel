import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export type ModalShellTab = {
    id: string;
    value: string;
    label: string;
    shortLabel?: string;
    icon?: LucideIcon;
    danger?: boolean;
};

type ModalShellProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    srTitle: string;
    srDescription?: string;
    header: ReactNode;
    tabs: ModalShellTab[];
    selectedTab: string;
    onSelectTab: (value: string) => void;
    footer?: ReactNode;
    children: ReactNode;
};

export function ModalShell({
    open,
    onOpenChange,
    srTitle,
    srDescription = 'Details and actions',
    header,
    tabs,
    selectedTab,
    onSelectTab,
    footer,
    children,
}: ModalShellProps) {
    const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const delta = e.key === 'ArrowLeft' ? -1 : 1;
        const next = tabs[index + delta];
        if (!next) return;
        onSelectTab(next.value);
        document.getElementById(next.id)?.focus();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0 md:max-w-3xl">
                <DialogHeader className="sr-only">
                    <DialogTitle>{srTitle}</DialogTitle>
                    <DialogDescription>{srDescription}</DialogDescription>
                </DialogHeader>

                <div className="border-border/60 shrink-0 border-b px-4 py-4 md:px-5">{header}</div>

                <div
                    className="border-border/60 flex shrink-0 flex-wrap gap-1 border-b px-4 py-2 md:px-5"
                    role="tablist"
                >
                    {tabs.map((tab, index) => {
                        const Icon = tab.icon;
                        const isActive = selectedTab === tab.value;
                        return (
                            <button
                                key={tab.id}
                                id={tab.id}
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                onClick={() => onSelectTab(tab.value)}
                                onKeyDown={(e) => handleTabKeyDown(e, index)}
                                className={cn(
                                    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold tracking-wide transition-colors sm:text-sm',
                                    isActive
                                        ? 'bg-card text-foreground shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                                    tab.danger && !isActive && 'hover:text-destructive',
                                    tab.danger && isActive && 'text-destructive-inline',
                                )}
                            >
                                {Icon ? <Icon className="size-3.5 shrink-0 sm:size-4" aria-hidden /> : null}
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3 md:px-5 md:py-4">
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
                </div>

                {footer ? <div className="border-border/60 shrink-0 border-t">{footer}</div> : null}
            </DialogContent>
        </Dialog>
    );
}
