import { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ScrollArea } from '@/components/ui/scroll-area';
import TxAnchor from '@/components/TxAnchor';
import { cn } from '@/lib/utils';
import { convertRowDateTime } from '@/lib/dateTime';
import { TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import {
    Loader2Icon,
    ChevronUpIcon,
    ChevronDownIcon,
    ChevronsUpDownIcon,
    SearchXIcon,
    AlertCircleIcon,
} from 'lucide-react';
import { useBackendApi } from '@/hooks/fetch';
import {
    HistoryTableActionType,
    HistoryTableSearchResp,
    HistoryTableSearchType,
    HistoryTableSortingType,
} from '@shared/historyApiTypes';
import { useOpenActionModal } from '@/hooks/actionModal';
import { SEARCH_ANY_STRING } from '@/pages/History/historySearchConfig';
import { emsg } from '@shared/emsg';
import { getActionStatusMeta, getActionTypeMeta } from './historyRowUtils';

type HistoryRowProps = {
    action: HistoryTableActionType;
    modalOpener: ReturnType<typeof useOpenActionModal>;
};

function HistoryRow({ action, modalOpener }: HistoryRowProps) {
    const typeMeta = getActionTypeMeta(action.type);
    const statusMeta = getActionStatusMeta(action);
    const TypeIcon = typeMeta.icon;
    const StatusIcon = statusMeta?.icon;

    return (
        <TableRow
            onClick={() => modalOpener(action.id)}
            className={cn(
                'border-border/40 cursor-pointer border-b transition-colors',
                'hover:bg-accent/40 hover:border-border/60',
                action.isRevoked && 'opacity-50',
            )}
        >
            <TableCell className="px-3 py-2.5 align-middle">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span
                        className={cn(
                            'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-widest uppercase',
                            typeMeta.badgeClass,
                        )}
                    >
                        <TypeIcon className="size-3" aria-hidden />
                        {typeMeta.label}
                    </span>
                    <code className="text-foreground truncate font-mono text-xs tracking-wide">{action.id}</code>
                    {StatusIcon ? (
                        <span
                            className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-[10px] font-medium"
                            title={statusMeta?.title}
                        >
                            <StatusIcon className="size-3.5" aria-hidden />
                        </span>
                    ) : null}
                </div>
            </TableCell>
            <TableCell className="px-3 py-2.5 align-middle">
                <span className="text-foreground truncate text-sm font-semibold">
                    {action.playerName ? (
                        action.playerName
                    ) : (
                        <span className="text-muted-foreground font-normal italic">unknown</span>
                    )}
                </span>
            </TableCell>
            <TableCell className="px-3 py-2.5 align-middle">
                <span className="text-muted-foreground line-clamp-2 text-sm">{action.reason}</span>
            </TableCell>
            <TableCell className="text-muted-foreground px-3 py-2.5 align-middle text-sm">{action.author}</TableCell>
            <TableCell className="text-muted-foreground px-3 py-2.5 align-middle text-sm whitespace-nowrap">
                {convertRowDateTime(action.timestamp)}
            </TableCell>
        </TableRow>
    );
}

type LastRowProps = {
    actionsCount: number;
    hasReachedEnd: boolean;
    loadError: string | null;
    isFetching: boolean;
    retryFetch: (_reset?: boolean) => Promise<void>;
};

function LastRow({ actionsCount, hasReachedEnd, isFetching, loadError, retryFetch }: LastRowProps) {
    let content: React.ReactNode;
    if (isFetching) {
        content = (
            <div className="text-muted-foreground flex flex-col items-center justify-center gap-3 py-10">
                <Loader2Icon className="text-primary size-8 animate-spin" />
                <p className="text-sm font-medium">Loading history…</p>
            </div>
        );
    } else if (loadError) {
        content = (
            <div className="flex flex-col items-center justify-center gap-3 py-10">
                <AlertCircleIcon className="text-destructive size-10" />
                <p className="text-destructive text-sm font-medium">Could not load history</p>
                <p className="text-muted-foreground max-w-md text-center text-xs">{loadError}</p>
                <button
                    type="button"
                    className="text-primary text-sm font-medium underline-offset-4 hover:underline"
                    onClick={() => retryFetch()}
                >
                    Try again
                </button>
            </div>
        );
    } else if (hasReachedEnd) {
        content =
            actionsCount === 0 ? (
                <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 py-12">
                    <SearchXIcon className="size-10 opacity-50" />
                    <p className="text-foreground text-sm font-semibold">No actions match</p>
                    <p className="max-w-sm text-center text-xs">Try widening your search or clearing filters.</p>
                </div>
            ) : (
                <div className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-sm">
                    <p className="text-foreground font-medium">End of list</p>
                    <p className="text-xs">
                        Showing {actionsCount.toLocaleString()} action{actionsCount === 1 ? '' : 's'}.
                    </p>
                </div>
            );
    } else {
        content = (
            <div className="text-muted-foreground py-6 text-center text-sm">
                <p>
                    Unexpected end of list.{' '}
                    <TxAnchor href="https://discord.gg/hUM3pQeGFc" target="_blank" rel="noopener noreferrer">
                        Report this
                    </TxAnchor>
                </p>
            </div>
        );
    }

    return (
        <TableRow className="hover:bg-transparent">
            <TableCell colSpan={5} className="px-4 py-2 text-center">
                {content}
            </TableCell>
        </TableRow>
    );
}

type SortableTableHeaderProps = {
    label: string;
    sortKey: 'timestamp';
    sortingState: HistoryTableSortingType;
    setSorting: (newState: HistoryTableSortingType) => void;
    align?: 'left' | 'right';
    className?: string;
};

function SortableTableHeader({
    label,
    sortKey,
    sortingState,
    setSorting,
    align = 'left',
    className,
}: SortableTableHeaderProps) {
    const isSorted = sortingState.key === sortKey;
    const isDesc = sortingState.desc;
    const SortIcon = isSorted ? (isDesc ? ChevronDownIcon : ChevronUpIcon) : ChevronsUpDownIcon;
    const onClick = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
        e.preventDefault();
        setSorting({
            key: sortKey,
            desc: isSorted ? !isDesc : true,
        });
    };
    return (
        <th
            onClick={onClick}
            className={cn(
                'hover:bg-muted/50 cursor-pointer px-3 py-2.5 text-[11px] font-semibold tracking-widest uppercase transition-colors select-none',
                align === 'right' ? 'text-right' : 'text-left',
                isSorted ? 'text-foreground' : 'text-muted-foreground/60',
                className,
            )}
        >
            <div className={cn('flex items-center gap-1', align === 'right' && 'justify-end')}>
                {label}
                <SortIcon className={cn('size-3.5', isSorted ? 'text-primary' : 'opacity-40')} />
            </div>
        </th>
    );
}

type HistoryListProps = {
    search: HistoryTableSearchType;
    filterByType: string | undefined;
    filterByAdmin: string | undefined;
};

export function HistoryList({ search, filterByType, filterByAdmin }: HistoryListProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const [history, setHistory] = useState<HistoryTableActionType[]>([]);
    const [hasReachedEnd, setHasReachedEnd] = useState(false);
    const [isFetching, setIsFetching] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [sorting, setSorting] = useState<HistoryTableSortingType>({ key: 'timestamp', desc: true });
    const [isResetting, setIsResetting] = useState(false);
    const openActionModal = useOpenActionModal();

    const historyListingApi = useBackendApi<HistoryTableSearchResp>({
        method: 'GET',
        path: '/history/search',
        abortOnUnmount: true,
    });

    const fetchNextPageRef = useRef<((resetOffset?: boolean) => Promise<void>) | undefined>(undefined);

    const fetchNextPage = async (resetOffset?: boolean) => {
        setIsFetching(true);
        setLoadError(null);
        if (resetOffset) {
            setIsResetting(true);
        }
        const handleError = (error: string) => {
            setLoadError(error);
            if (resetOffset) {
                setHistory([]);
            }
        };
        try {
            const queryParams: { [key: string]: string | number | boolean } = {
                sortingKey: sorting.key,
                sortingDesc: sorting.desc,
            };
            if (search.value) {
                queryParams.searchValue = search.value;
                queryParams.searchType = search.type;
            }
            if (filterByType && filterByType !== SEARCH_ANY_STRING) {
                queryParams.filterbyType = filterByType;
            }
            if (filterByAdmin && filterByAdmin !== SEARCH_ANY_STRING) {
                queryParams.filterbyAdmin = filterByAdmin;
            }
            if (!resetOffset && history.length) {
                queryParams.offsetParam = history[history.length - 1][sorting.key];
                queryParams.offsetActionId = history[history.length - 1].id;
            }
            const resp = await historyListingApi({ queryParams });

            if (resp === undefined) {
                return handleError('Request failed.');
            }
            if ('error' in resp) {
                return handleError(`Request failed: ${resp.error}`);
            }

            setLoadError(null);
            setHasReachedEnd(resp.hasReachedEnd);
            if (resp.history.length) {
                setHistory((prev) => (resetOffset ? resp.history : [...prev, ...resp.history]));
            } else if (resetOffset) {
                setHistory([]);
            }
        } catch (error) {
            handleError(`Failed to fetch more data: ${emsg(error)}`);
        } finally {
            setIsFetching(false);
            setIsResetting(false);
        }
    };

    useEffect(() => {
        fetchNextPageRef.current = fetchNextPage;
    });

    const rowVirtualizer = useVirtualizer({
        isScrollingResetDelay: 0,
        count: history.length + 1,
        getScrollElement: () => viewportRef.current,
        estimateSize: () => 52,
        overscan: 20,
    });
    const virtualItems = rowVirtualizer.getVirtualItems();
    const virtualizerTotalSize = rowVirtualizer.getTotalSize();

    let TopRowPad: React.ReactNode = null;
    let BottomRowPad: React.ReactNode = null;
    if (virtualItems.length > 0) {
        const padStart = virtualItems[0].start - rowVirtualizer.options.scrollMargin;
        if (padStart > 0) {
            TopRowPad = (
                <tr>
                    <td colSpan={5} style={{ height: padStart }} />
                </tr>
            );
        }
        const padEnd = virtualizerTotalSize - virtualItems[virtualItems.length - 1].end;
        if (padEnd > 0) {
            BottomRowPad = (
                <tr>
                    <td colSpan={5} style={{ height: padEnd }} />
                </tr>
            );
        }
    }

    useEffect(() => {
        if (!history.length || !virtualItems.length) return;
        const lastVirtualItemIndex = virtualItems[virtualItems.length - 1].index;
        if (history.length <= lastVirtualItemIndex && !hasReachedEnd && !isFetching) {
            fetchNextPageRef.current?.();
        }
    }, [history, virtualItems, hasReachedEnd, isFetching]);

    useEffect(() => {
        rowVirtualizer.scrollToIndex(0);
        fetchNextPageRef.current?.(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- reset list on query/sort only
    }, [search, filterByType, filterByAdmin, sorting]);

    return (
        <div
            className="border-border/60 bg-background flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border"
            style={{ overflowAnchor: 'none' }}
            ref={rootRef}
        >
            <ScrollArea className="min-h-0 flex-1" viewportRef={viewportRef}>
                <table className="w-full caption-bottom text-sm select-none">
                    <TableHeader className="sticky top-0 z-20">
                        <TableRow className="border-border/50 bg-card/95 hover:bg-card/95 border-b shadow-sm backdrop-blur-md">
                            <th className="text-muted-foreground/60 px-3 py-2.5 text-left text-[11px] font-semibold tracking-widest uppercase">
                                Action
                            </th>
                            <th className="text-muted-foreground/60 px-3 py-2.5 text-left text-[11px] font-semibold tracking-widest uppercase">
                                Player
                            </th>
                            <th className="text-muted-foreground/60 px-3 py-2.5 text-left text-[11px] font-semibold tracking-widest uppercase">
                                Reason
                            </th>
                            <th className="text-muted-foreground/60 px-3 py-2.5 text-left text-[11px] font-semibold tracking-widest uppercase">
                                Author
                            </th>
                            <SortableTableHeader
                                label="Date"
                                sortKey="timestamp"
                                sortingState={sorting}
                                setSorting={setSorting}
                                align="right"
                                className="w-[1%]"
                            />
                        </TableRow>
                    </TableHeader>
                    <TableBody className={cn(isResetting && 'opacity-25')}>
                        {TopRowPad}
                        {virtualItems.map((virtualItem) => {
                            const isLastRow = virtualItem.index > history.length - 1;
                            return isLastRow ? (
                                <LastRow
                                    key={virtualItem.key}
                                    actionsCount={history.length}
                                    hasReachedEnd={hasReachedEnd}
                                    loadError={loadError}
                                    isFetching={isFetching}
                                    retryFetch={fetchNextPage}
                                />
                            ) : (
                                <HistoryRow
                                    key={virtualItem.key}
                                    action={history[virtualItem.index]}
                                    modalOpener={openActionModal}
                                />
                            );
                        })}
                        {BottomRowPad}
                    </TableBody>
                </table>
            </ScrollArea>
        </div>
    );
}
