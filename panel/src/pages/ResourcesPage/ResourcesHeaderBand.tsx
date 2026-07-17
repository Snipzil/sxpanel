import { PackageIcon, PlayIcon, SquareIcon, FolderIcon, ArrowUpCircleIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type PillAccent = 'success' | 'warning' | undefined;

type ResourcesHeaderBandProps = {
    title: string;
    total?: number;
    started?: number;
    stopped?: number;
    folders?: number;
    updates?: number;
    isLoading: boolean;
};

/**
 * V2 header band for the Resources page — icon tile, description,
 * and live resource count pills, matching the Players/Action Log bands.
 */
export function ResourcesHeaderBand({
    title,
    total,
    started,
    stopped,
    folders,
    updates,
    isLoading,
}: ResourcesHeaderBandProps) {
    const pill = (label: string, value: number | undefined, Icon: typeof PackageIcon, accent?: PillAccent) => {
        const show = !isLoading && value !== undefined;
        const accented = show && accent !== undefined && value > 0;
        return (
            <div
                className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-3 py-1.5',
                    accented && accent === 'success' && 'border-success/30 bg-success/10',
                    accented && accent === 'warning' && 'border-warning/40 bg-warning/10',
                    !accented && 'border-border/50 bg-secondary/40',
                    !show && 'opacity-60',
                )}
            >
                <Icon
                    className={cn(
                        'size-3.5 shrink-0',
                        accented && accent === 'success' && 'text-success-inline',
                        accented && accent === 'warning' && 'text-warning',
                        !accented && 'text-muted-foreground',
                    )}
                />
                <span className="text-muted-foreground/70 text-[11px] font-semibold tracking-wider uppercase">
                    {label}
                </span>
                <span className="text-foreground text-sm font-semibold tabular-nums">
                    {show ? value.toLocaleString() : '—'}
                </span>
            </div>
        );
    };

    return (
        <div className="border-border/60 bg-background mb-4 rounded-xl border">
            <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="bg-secondary/50 text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-xl">
                        <PackageIcon className="size-5" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-foreground text-lg font-semibold tracking-tight">{title}</h1>
                        <p className="text-muted-foreground mt-0.5 text-xs">
                            Monitor, start, stop and restart your server resources.
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {pill('Total', total, PackageIcon)}
                    {pill('Started', started, PlayIcon, 'success')}
                    {pill('Stopped', stopped, SquareIcon)}
                    {pill('Updates', updates, ArrowUpCircleIcon, 'warning')}
                    {pill('Folders', folders, FolderIcon)}
                </div>
            </div>
        </div>
    );
}
