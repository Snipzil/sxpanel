import { memo, useMemo, useRef, useState } from 'react';
import { cn, copyToClipboard } from '@/lib/utils';
import { CheckIcon, ClockIcon, CopyIcon, NetworkIcon, TagIcon, TextIcon, UserIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { SystemLogEntry } from '@shared/systemLogTypes';
import { ACTION_LOG_CATEGORY_STYLES, ACTION_LOG_DEFAULT_CATEGORY_STYLE } from './actionLogCategoryStyles';

const timeOptions: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit' };
const fullTimeOptions: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
};

const getRelativeTime = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 5_000) return 'just now';
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
};

type ActionLogEntryProps = {
    event: SystemLogEntry;
    onAdminClick: (name: string) => void;
};

/**
 * Action Log entry, V2 — identical interaction model to V1 (row opens a
 * detail dialog, author opens admin stats) but the category colorway is
 * light/dark adaptive and the copy confirmation uses the success token.
 */
const ActionLogEntry = memo(function ActionLogEntry({ event, onAdminClick }: ActionLogEntryProps) {
    const cfg = ACTION_LOG_CATEGORY_STYLES[event.category] ?? ACTION_LOG_DEFAULT_CATEGORY_STYLE;
    const Icon = cfg.icon;
    const [modalOpen, setModalOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const surrogateRef = useRef<HTMLDivElement>(null);

    const absoluteTime = useMemo(() => new Date(event.ts).toLocaleTimeString(undefined, timeOptions), [event.ts]);
    const fullTime = useMemo(() => new Date(event.ts).toLocaleString(undefined, fullTimeOptions), [event.ts]);

    const handleAdminClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onAdminClick(event.author);
    };

    const handleCopy = () => {
        const actionText = event.ip ? `${event.action} from ${event.ip}` : event.action;
        const text = `[${fullTime}] [${cfg.label}] ${event.author}: ${actionText}`;
        copyToClipboard(text, surrogateRef.current ?? (document.body as unknown as HTMLDivElement)).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    return (
        <>
            <div
                ref={surrogateRef}
                className={cn(
                    'hover:bg-secondary/30 flex cursor-pointer items-start gap-2 border-l-2 px-3 py-1.5 text-sm transition-colors',
                    cfg.border,
                )}
                onClick={() => setModalOpen(true)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        if (e.key === ' ') e.preventDefault();
                        setModalOpen(true);
                    }
                }}
                role="button"
                tabIndex={0}
                aria-label={`${cfg.label} by ${event.author} at ${absoluteTime} — open details`}
            >
                <Icon className={cn('mt-0.5 size-3.5 shrink-0', cfg.text)} aria-hidden="true" />

                <span
                    className="text-muted-foreground mt-px w-18 shrink-0 text-xs tabular-nums"
                    title={getRelativeTime(event.ts)}
                >
                    {absoluteTime}
                </span>

                <button
                    type="button"
                    className="text-primary shrink-0 text-left font-semibold hover:underline"
                    onClick={handleAdminClick}
                    aria-label={`View stats for ${event.author}`}
                >
                    {event.author}
                </button>

                <span className="text-secondary-foreground min-w-0 wrap-break-word">
                    {event.action}
                    {event.ip ? <span className="text-muted-foreground"> from {event.ip}</span> : null}
                </span>
            </div>

            <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Icon className={cn('size-5', cfg.text)} />
                            <span className={cfg.text}>{cfg.label}</span>
                        </DialogTitle>
                        <DialogDescription>
                            {fullTime} ({getRelativeTime(event.ts)})
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 text-sm">
                        {/* Admin */}
                        <div className="flex items-start gap-2">
                            <UserIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                            <div>
                                <p className="text-muted-foreground text-xs font-medium">Admin</p>
                                <p className="font-semibold">{event.author}</p>
                            </div>
                        </div>

                        {/* Timestamp */}
                        <div className="flex items-start gap-2">
                            <ClockIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                            <div>
                                <p className="text-muted-foreground text-xs font-medium">Timestamp</p>
                                <p>{fullTime}</p>
                                <p className="text-muted-foreground text-xs">
                                    {getRelativeTime(event.ts)} &middot; Unix: {event.ts}
                                </p>
                            </div>
                        </div>

                        {/* Category */}
                        <div className="flex items-start gap-2">
                            <TagIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                            <div>
                                <p className="text-muted-foreground text-xs font-medium">Category</p>
                                <p className={cfg.text}>{cfg.label}</p>
                            </div>
                        </div>

                        {/* IP Address */}
                        {event.ip && (
                            <div className="flex items-start gap-2">
                                <NetworkIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                                <div>
                                    <p className="text-muted-foreground text-xs font-medium">IP Address</p>
                                    <p className="font-mono">{event.ip}</p>
                                </div>
                            </div>
                        )}

                        {/* Action */}
                        {event.action && (
                            <div className="flex items-start gap-2">
                                <TextIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-muted-foreground text-xs font-medium">Action</p>
                                    <p className="wrap-break-word whitespace-pre-wrap">{event.action}</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 border-t pt-2">
                        <Button variant="secondary" size="xs" onClick={handleCopy} className="gap-1.5">
                            {copied ? (
                                <>
                                    <CheckIcon className="text-success-inline size-3.5" /> Copied
                                </>
                            ) : (
                                <>
                                    <CopyIcon className="size-3.5" /> Copy
                                </>
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
});

export default ActionLogEntry;
