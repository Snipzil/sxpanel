import { UserCheckIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useLocale } from '@/hooks/locale';
import { cn } from '@/lib/utils';
import type { TicketListItem, TicketPriority, TicketStatus } from '@shared/ticketApiTypes';

const statusVariants: Record<TicketStatus, 'default' | 'secondary' | 'outline-solid' | 'destructive'> = {
    open: 'destructive',
    inReview: 'default',
    resolved: 'secondary',
    closed: 'outline-solid',
};

/** Theme-token priority chips (V1 used raw text-green-400/yellow-400/red-500). */
const priorityChipClasses: Record<TicketPriority, string> = {
    low: 'border-success/30 bg-success/10 text-success-inline',
    medium: 'border-info/30 bg-info/10 text-info-inline',
    high: 'border-warning/40 bg-warning/10 text-warning-inline',
    critical: 'border-destructive/40 bg-destructive/10 text-destructive-inline',
};

type TicketRowProps = {
    ticket: TicketListItem;
    formatDate: (ts: number) => string;
    statusLabel: string;
    onClick: () => void;
};

/**
 * V2 ticket row — `bg-card` shell, token-based priority chip, and a layout
 * that wraps gracefully on narrow viewports instead of overflowing.
 */
export function TicketRow({ ticket, formatDate, statusLabel, onClick }: TicketRowProps) {
    const { t } = useLocale();
    return (
        <button
            className="group bg-card hover:bg-muted/30 border-border/60 hover:border-border w-full cursor-pointer rounded-xl border p-4 text-left shadow-sm transition-all"
            onClick={onClick}
            aria-label={`Ticket ${ticket.id}, ${statusLabel}, reported by ${ticket.reporterName}`}
        >
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold tracking-wide">{ticket.id}</span>
                    <Badge variant={statusVariants[ticket.status]}>{statusLabel}</Badge>
                    <span className="text-muted-foreground text-xs">{ticket.category}</span>
                    {ticket.priority && (
                        <span
                            className={cn(
                                'rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase',
                                priorityChipClasses[ticket.priority],
                            )}
                        >
                            {ticket.priority}
                        </span>
                    )}
                    {ticket.claimedBy && (
                        <span className="text-muted-foreground flex items-center gap-1 text-xs">
                            <UserCheckIcon className="size-3" /> {ticket.claimedBy}
                        </span>
                    )}
                </div>
                <span className="text-muted-foreground shrink-0 text-xs">{formatDate(ticket.tsLastActivity)}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <div className="min-w-0 text-sm">
                    <span className="text-muted-foreground">{t('panel.reports.page.by_prefix')}</span>
                    <span className="font-medium">{ticket.reporterName}</span>
                    {ticket.targetNames.length > 0 && (
                        <>
                            <span className="text-muted-foreground"> → </span>
                            <span className="font-medium">{ticket.targetNames.join(', ')}</span>
                        </>
                    )}
                </div>
                <div className="text-muted-foreground flex items-center gap-2 text-xs">
                    {ticket.messageCount > 0 && (
                        <span>
                            {ticket.messageCount === 1
                                ? t('panel.reports.page.message_count', { count: ticket.messageCount })
                                : t('panel.reports.page.message_count_plural', { count: ticket.messageCount })}
                        </span>
                    )}
                </div>
            </div>
            <p className="text-muted-foreground mt-1.5 line-clamp-1 text-sm">{ticket.descriptionPreview}</p>
        </button>
    );
}
