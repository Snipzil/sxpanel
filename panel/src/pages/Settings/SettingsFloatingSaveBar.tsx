import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Loader2Icon } from 'lucide-react';
import type { SettingsPageContext } from './utils';

type SettingsFloatingSaveBarProps = {
    pageCtx: SettingsPageContext;
    className?: string;
};

export function SettingsFloatingSaveBar({ pageCtx, className }: SettingsFloatingSaveBarProps) {
    const pending = pageCtx.cardPendingSave;
    if (!pending) return null;

    return (
        <div
            className={cn(
                'pointer-events-none sticky bottom-4 z-30 flex justify-center px-2 sm:bottom-6 sm:px-4',
                className,
            )}
            role="region"
            aria-label="Save settings"
        >
            <div className="border-border/60 bg-card/95 pointer-events-auto flex w-full max-w-3xl items-center justify-between gap-4 rounded-2xl border px-4 py-3 shadow-lg backdrop-blur-md sm:px-6 sm:py-3.5">
                <div className="min-w-0">
                    <p className="text-foreground text-sm font-semibold">Unsaved changes</p>
                    <p className="text-muted-foreground truncate text-xs">{pending.cardTitle}</p>
                </div>
                <Button
                    size="default"
                    className="shrink-0"
                    disabled={pageCtx.isReadOnly || pageCtx.isSaving}
                    onClick={() => pageCtx.triggerPendingSave()}
                >
                    {pageCtx.isSaving ? <Loader2Icon className="size-4 animate-spin" /> : null}
                    Save changes
                </Button>
            </div>
        </div>
    );
}
