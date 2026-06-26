import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { SearchIcon, XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocale } from '@/hooks/locale';

type WhitelistToolbarProps = {
    search: string;
    onSearchChange: (value: string) => void;
    placeholder: string;
    countFiltered?: number;
    countTotal?: number;
    countNoun: string;
    trailing?: ReactNode;
    footer?: ReactNode;
    className?: string;
};

function formatCount(filtered?: number, total?: number, noun = 'items') {
    if (filtered === undefined || total === undefined) return null;
    if (filtered === total) return `${total.toLocaleString()} ${noun}`;
    return `${filtered.toLocaleString()} of ${total.toLocaleString()} ${noun}`;
}

export function WhitelistToolbar({
    search,
    onSearchChange,
    placeholder,
    countFiltered,
    countTotal,
    countNoun,
    trailing,
    footer,
    className,
}: WhitelistToolbarProps) {
    const { t } = useLocale();
    const countLabel = formatCount(countFiltered, countTotal, countNoun);

    return (
        <div className={cn('border-border/60 bg-card rounded-xl border shadow-sm', className)}>
            <div className="border-border/40 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <p className="text-muted-foreground/60 text-[11px] font-semibold tracking-widest uppercase">
                    {t('panel.whitelist.search_label')}
                </p>
                {countLabel ? (
                    <span className="text-muted-foreground text-xs font-medium tabular-nums">{countLabel}</span>
                ) : null}
            </div>
            <div className="flex flex-col gap-3 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="relative min-w-0 flex-1">
                        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                        <Input
                            placeholder={placeholder}
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="pr-9 pl-9"
                        />
                        {search ? (
                            <button
                                type="button"
                                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-0.5 transition-colors"
                                onClick={() => onSearchChange('')}
                                aria-label={t('panel.whitelist.clear_search')}
                            >
                                <XIcon className="size-4" />
                            </button>
                        ) : null}
                    </div>
                    {trailing ? <div className="flex shrink-0 flex-wrap items-center gap-2">{trailing}</div> : null}
                </div>
                {footer ? <div className="border-border/40 border-t pt-3">{footer}</div> : null}
            </div>
        </div>
    );
}
