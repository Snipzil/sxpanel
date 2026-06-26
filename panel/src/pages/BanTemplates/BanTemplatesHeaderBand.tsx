import { CheckIcon, ClockIcon, GavelIcon, ListIcon, Loader2Icon, Settings2Icon } from 'lucide-react';
import { Link } from 'wouter';
import { cn } from '@/lib/utils';

export type BanTemplatesSaveStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error';

type BanTemplatesHeaderBandProps = {
    title: string;
    parentName: string;
    totalCount?: number;
    permanentCount?: number;
    timedCount?: number;
    saveStatus: BanTemplatesSaveStatus;
};

/**
 * V2 header band for the Ban Templates page — icon tile, breadcrumb back to
 * Settings, description, and stat pills (total/permanent/timed) plus a live
 * save-status pill replacing the old loose status text row.
 */
export function BanTemplatesHeaderBand({
    title,
    parentName,
    totalCount,
    permanentCount,
    timedCount,
    saveStatus,
}: BanTemplatesHeaderBandProps) {
    const pill = (label: string, value: number | undefined, Icon: typeof ListIcon) => (
        <div
            className={cn(
                'border-border/50 bg-muted/15 inline-flex items-center gap-2 rounded-full border px-3 py-1.5',
                value === undefined && 'opacity-60',
            )}
        >
            <Icon className="text-muted-foreground size-3.5 shrink-0" />
            <span className="text-muted-foreground/70 text-[11px] font-semibold tracking-wider uppercase">{label}</span>
            <span className="text-foreground text-sm font-semibold tabular-nums">
                {value !== undefined ? value.toLocaleString() : '—'}
            </span>
        </div>
    );

    return (
        <div className="border-border/60 bg-card mb-4 rounded-xl border shadow-sm">
            <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-xl">
                        <Settings2Icon className="text-foreground size-5" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-baseline gap-1.5">
                            <Link
                                href="/settings"
                                className="text-muted-foreground hover:text-foreground text-xs font-medium transition-colors"
                            >
                                {parentName}
                            </Link>
                            <span className="text-muted-foreground/50 text-xs" aria-hidden="true">
                                /
                            </span>
                            <h1 className="text-foreground text-lg font-semibold tracking-tight">{title}</h1>
                        </div>
                        <p className="text-muted-foreground mt-0.5 text-xs">
                            Preset reasons and durations offered when banning a player.
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <SaveStatusPill status={saveStatus} />
                    {pill('Reasons', totalCount, ListIcon)}
                    {pill('Permanent', permanentCount, GavelIcon)}
                    {pill('Timed', timedCount, ClockIcon)}
                </div>
            </div>
        </div>
    );
}

function SaveStatusPill({ status }: { status: BanTemplatesSaveStatus }) {
    if (status === 'idle') return null;
    if (status === 'saving' || status === 'loading') {
        return (
            <div
                className="border-border/50 bg-muted/15 inline-flex items-center gap-2 rounded-full border px-3 py-1.5"
                role="status"
            >
                <Loader2Icon className="text-muted-foreground size-3.5 animate-spin" />
                <span className="text-muted-foreground/70 text-[11px] font-semibold tracking-wider uppercase">
                    {status === 'saving' ? 'Saving' : 'Loading'}
                </span>
            </div>
        );
    }
    if (status === 'saved') {
        return (
            <div
                className="border-success/30 bg-success/10 inline-flex items-center gap-2 rounded-full border px-3 py-1.5"
                role="status"
            >
                <CheckIcon className="text-success-inline size-3.5" />
                <span className="text-success-inline text-[11px] font-semibold tracking-wider uppercase">Saved</span>
            </div>
        );
    }
    return (
        <div
            className="border-destructive/40 bg-destructive/10 inline-flex items-center gap-2 rounded-full border px-3 py-1.5"
            role="status"
        >
            <span className="text-destructive-inline text-[11px] font-semibold tracking-wider uppercase">
                Save failed
            </span>
        </div>
    );
}
