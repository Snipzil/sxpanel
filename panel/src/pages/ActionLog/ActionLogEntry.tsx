import { memo, useMemo, useRef, useState } from 'react';
import { cn, copyToClipboard } from '@/lib/utils';
import {
    ZapIcon,
    TerminalIcon,
    SettingsIcon,
    LogInIcon,
    ActivityIcon,
    ClockIcon,
    CpuIcon,
    CircleHelpIcon,
    CopyIcon,
    CheckIcon,
    UserIcon,
    TagIcon,
    TextIcon,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { SystemLogEntry, SystemLogCategory } from '@shared/systemLogTypes';

const categoryConfig: Record<
    SystemLogCategory,
    { icon: typeof ZapIcon; color: string; borderColor: string; label: string }
> = {
    action: { icon: ZapIcon, color: 'text-blue-400', borderColor: 'border-l-blue-400', label: 'Action' },
    command: { icon: TerminalIcon, color: 'text-purple-400', borderColor: 'border-l-purple-400', label: 'Command' },
    config: { icon: SettingsIcon, color: 'text-amber-400', borderColor: 'border-l-amber-400', label: 'Config' },
    login: { icon: LogInIcon, color: 'text-green-400', borderColor: 'border-l-green-400', label: 'Login' },
    monitor: { icon: ActivityIcon, color: 'text-red-400', borderColor: 'border-l-red-400', label: 'Monitor' },
    scheduler: { icon: ClockIcon, color: 'text-cyan-400', borderColor: 'border-l-cyan-400', label: 'Scheduler' },
    system: {
        icon: CpuIcon,
        color: 'text-muted-foreground',
        borderColor: 'border-l-muted-foreground',
        label: 'System',
    },
};

const defaultConfig = {
    icon: CircleHelpIcon,
    color: 'text-muted-foreground',
    borderColor: 'border-l-muted-foreground',
    label: 'Unknown',
};

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

const ActionLogEntry = memo(function ActionLogEntry({ event, onAdminClick }: ActionLogEntryProps) {
    const cfg = categoryConfig[event.category] ?? defaultConfig;
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
        const text = `[${fullTime}] [${cfg.label}] ${event.author}: ${event.action}`;
        copyToClipboard(text, surrogateRef.current ?? document.body as unknown as HTMLDivElement).then(() => {
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
                    cfg.borderColor,
                )}
                onClick={() => setModalOpen(true)}
            >
                <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', cfg.color)} />

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
                >
                    {event.author}
                </button>

                <span className="text-secondary-foreground min-w-0 wrap-break-word">{event.action}</span>
            </div>

            <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Icon className={cn('h-5 w-5', cfg.color)} />
                            <span className={cfg.color}>{cfg.label}</span>
                        </DialogTitle>
                        <DialogDescription>
                            {fullTime} ({getRelativeTime(event.ts)})
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 text-sm">
                        {/* Admin */}
                        <div className="flex items-start gap-2">
                            <UserIcon className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
                            <div>
                                <p className="text-muted-foreground text-xs font-medium">Admin</p>
                                <p className="font-semibold">{event.author}</p>
                            </div>
                        </div>

                        {/* Timestamp */}
                        <div className="flex items-start gap-2">
                            <ClockIcon className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
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
                            <TagIcon className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
                            <div>
                                <p className="text-muted-foreground text-xs font-medium">Category</p>
                                <p className={cfg.color}>{cfg.label}</p>
                            </div>
                        </div>

                        {/* Action */}
                        {event.action && (
                            <div className="flex items-start gap-2">
                                <TextIcon className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
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
                                    <CheckIcon className="h-3.5 w-3.5 text-green-500" /> Copied
                                </>
                            ) : (
                                <>
                                    <CopyIcon className="h-3.5 w-3.5" /> Copy
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
