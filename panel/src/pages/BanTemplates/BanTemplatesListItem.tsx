import { banDurationToString, cn } from '@/lib/utils';
import { BanDurationType } from '@shared/otherTypes';
import { PencilIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';

type BanTemplatesListItemProps = {
    id: string;
    reason: string;
    duration: BanDurationType;
    onEdit: (id: string) => void;
    onRemove: (id: string) => void;
    disabled: boolean;
};

/**
 * V2 list row for a ban template — theme-token duration chips (no more
 * `bg-black/40`), labeled icon buttons, and consistent action sizing.
 */
export default function BanTemplatesListItem({
    id,
    reason,
    duration,
    onEdit,
    onRemove,
    disabled,
}: BanTemplatesListItemProps) {
    return (
        <>
            <div className="flex min-w-0 grow flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                <span className="line-clamp-5 text-sm md:line-clamp-3">{reason}</span>
                <span
                    className={cn(
                        'w-max shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wider uppercase select-none',
                        duration === 'permanent'
                            ? 'border-destructive/40 bg-destructive/10 text-destructive-inline'
                            : 'border-primary/40 bg-primary/10 text-primary',
                    )}
                >
                    {banDurationToString(duration)}
                </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
                <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-primary size-8"
                    aria-label={`Edit template: ${reason}`}
                    onClick={() => onEdit(id)}
                    disabled={disabled}
                >
                    <PencilIcon className="size-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive size-8"
                    aria-label={`Remove template: ${reason}`}
                    onClick={() => onRemove(id)}
                    disabled={disabled}
                >
                    <Trash2Icon className="size-4" />
                </Button>
            </div>
        </>
    );
}
