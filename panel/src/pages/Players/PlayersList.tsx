import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ScrollArea } from '@/components/ui/scroll-area';
import TxAnchor from '@/components/TxAnchor';
import { cn } from '@/lib/utils';
import { convertRowDateTime, msToShortDuration } from '@/lib/dateTime';
import { TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import {
    Loader2Icon,
    ChevronUpIcon,
    ChevronDownIcon,
    ChevronsUpDownIcon,
    ClockIcon,
    TimerIcon,
    SearchXIcon,
    AlertCircleIcon,
} from 'lucide-react';
import { useOpenPlayerModal } from '@/hooks/playerModal';
import {
    PlayersTableSearchResp,
    PlayersTableFiltersType,
    PlayersTableSearchType,
    PlayersTableSortingType,
    PlayersTablePlayerType,
} from '@shared/playerApiTypes';
import { useBackendApi } from '@/hooks/fetch';
import { emsg } from '@shared/emsg';
import { useAtomValue } from 'jotai';
import { tagDefinitionsAtom } from '@/hooks/playerlist';
import { AUTO_TAG_DEFINITIONS } from '@shared/socketioTypes';
import { searchMockPlayers } from '@/pages/Players/devMockPlayers';
import { isDevMockStatusOptInEnabled } from '@/lib/devFlags';
import {
    buildTagLookup,
    deriveTagStyles,
    formatLicenseHint,
    formatRelativeLastSeen,
    getTopTag,
} from './playerRowUtils';

type PlayerRowProps = {
    rowData: PlayersTablePlayerType;
    modalOpener: ReturnType<typeof useOpenPlayerModal>;
    tagLookup: Record<string, { label: string; color: string; priority: number }>;
};

function PlayerRow({ rowData, modalOpener, tagLookup }: PlayerRowProps) {
    const openModal = () => {
        modalOpener({ license: rowData.license });
    };
    const topTagId = getTopTag(rowData.tags ?? [], tagLookup);
    const topTag = topTagId ? tagLookup[topTagId] : undefined;
    const tagStyles = topTag ? deriveTagStyles(topTag.color) : undefined;

    return (
        <TableRow
            onClick={openModal}
            className={cn(
                'border-border/40 cursor-pointer border-b transition-colors',
                'hover:bg-accent/40 hover:border-border/60',
            )}
        >
            <TableCell className="px-3 py-2.5 align-middle">
                <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-foreground truncate text-sm font-semibold">{rowData.displayName}</span>
                        {topTag ? (
                            <span
                                className="inline-flex max-w-[10rem] shrink-0 truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide"
                                style={{
                                    color: topTag.color,
                                    borderColor: tagStyles?.borderColor,
                                    backgroundColor: tagStyles?.backgroundColor,
                                }}
                            >
                                {topTag.label}
                            </span>
                        ) : null}
                        <span
                            className={cn(
                                'inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-widest uppercase',
                                rowData.isOnline
                                    ? 'border-success/35 bg-success/12 text-success-inline'
                                    : 'border-border bg-muted/50 text-muted-foreground',
                            )}
                        >
                            {rowData.isOnline ? 'Online' : 'Offline'}
                        </span>
                    </div>
                    <p className="text-muted-foreground mt-0.5 truncate font-mono text-[11px]">
                        {formatLicenseHint(rowData.license)}
                    </p>
                </div>
            </TableCell>
            <TableCell className="text-muted-foreground px-3 py-2.5 align-middle text-sm whitespace-nowrap">
                {convertRowDateTime(rowData.tsJoined)}
            </TableCell>
            <TableCell className="px-3 py-2.5 align-middle">
                <div className="text-muted-foreground flex items-center gap-1.5 text-sm whitespace-nowrap">
                    <ClockIcon className="size-3.5 shrink-0 opacity-70" />
                    <span>{formatRelativeLastSeen(rowData.tsLastConnection)}</span>
                </div>
            </TableCell>
            <TableCell className="px-3 py-2.5 align-middle">
                <div className="text-muted-foreground flex items-center justify-end gap-1.5 text-sm whitespace-nowrap">
                    <TimerIcon className="size-3.5 shrink-0 opacity-70" />
                    <span className="text-foreground font-medium tabular-nums">
                        {msToShortDuration(rowData.playTime * 60_000)}
                    </span>
                </div>
            </TableCell>
        </TableRow>
    );
}

type LastRowProps = {
    playersCount: number;
    hasReachedEnd: boolean;
    loadError: string | null;
    isFetching: boolean;
    retryFetch: (_reset?: boolean) => Promise<void>;
};

function LastRow({ playersCount, hasReachedEnd, isFetching, loadError, retryFetch }: LastRowProps) {
    let content: React.ReactNode;
    if (isFetching) {
        content = (
            <div className="text-muted-foreground flex flex-col items-center justify-center gap-3 py-10">
                <Loader2Icon className="text-primary size-8 animate-spin" />
                <p className="text-sm font-medium">Loading players…</p>
                <div className="bg-muted h-1.5 w-40 overflow-hidden rounded-full">
                    <div className="bg-primary/70 h-full w-1/2 animate-pulse rounded-full" />
                </div>
            </div>
        );
    } else if (loadError) {
        content = (
            <div className="flex flex-col items-center justify-center gap-3 py-10">
                <AlertCircleIcon className="text-destructive size-10" />
                <p className="text-destructive text-sm font-medium">Could not load players</p>
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
            playersCount === 0 ? (
                <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 py-12">
                    <SearchXIcon className="size-10 opacity-50" />
                    <p className="text-foreground text-sm font-semibold">No players match</p>
                    <p className="max-w-sm text-center text-xs">Try widening your search or clearing filters.</p>
                </div>
            ) : (
                <div className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-sm">
                    <p className="text-foreground font-medium">End of list</p>
                    <p className="text-xs">
                        Showing {playersCount.toLocaleString()} player{playersCount === 1 ? '' : 's'}.
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
            <TableCell colSpan={4} className="px-4 py-2 text-center">
                {content}
            </TableCell>
        </TableRow>
    );
}

type SortableTableHeaderProps = {
    label: string;
    sortKey: 'playTime' | 'tsJoined' | 'tsLastConnection';
    sortingState: PlayersTableSortingType;
    setSorting: (newState: PlayersTableSortingType) => void;
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

type PlayersListProps = {
    search: PlayersTableSearchType;
    filters: PlayersTableFiltersType;
};

export function PlayersList({ search, filters }: PlayersListProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const [players, setPlayers] = useState<PlayersTablePlayerType[]>([]);
    const [hasReachedEnd, setHasReachedEnd] = useState(false);
    const [isFetching, setIsFetching] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [sorting, setSorting] = useState<PlayersTableSortingType>({ key: 'tsJoined', desc: true });
    const [isResetting, setIsResetting] = useState(false);
    const openPlayerModal = useOpenPlayerModal();
    const tagDefs = useAtomValue(tagDefinitionsAtom);
    const tagLookup = useMemo(() => buildTagLookup(tagDefs.length ? tagDefs : AUTO_TAG_DEFINITIONS), [tagDefs]);

    const playerListingApi = useBackendApi<PlayersTableSearchResp>({
        method: 'GET',
        path: '/player/search',
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
                setPlayers([]);
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
            if (filters.length) {
                queryParams.filters = filters.join(',');
            }
            if (!resetOffset && players.length) {
                queryParams.offsetParam = players[players.length - 1][sorting.key];
                queryParams.offsetLicense = players[players.length - 1].license;
            }
            const isDevMockMode = import.meta.env.DEV && isDevMockStatusOptInEnabled();
            const resp = isDevMockMode ? await searchMockPlayers(queryParams) : await playerListingApi({ queryParams });

            if (resp === undefined) {
                return handleError(`Request failed.`);
            }
            if ('error' in resp) {
                return handleError(`Request failed: ${resp.error}`);
            }

            setLoadError(null);
            setHasReachedEnd(resp.hasReachedEnd);
            if (resp.players.length) {
                setPlayers((prev) => (resetOffset ? resp.players : [...prev, ...resp.players]));
            } else if (resetOffset) {
                setPlayers([]);
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
        count: players.length + 1,
        getScrollElement: () => viewportRef.current,
        estimateSize: () => 56,
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
                    <td colSpan={4} style={{ height: padStart }} />
                </tr>
            );
        }
        const padEnd = virtualizerTotalSize - virtualItems[virtualItems.length - 1].end;
        if (padEnd > 0) {
            BottomRowPad = (
                <tr>
                    <td colSpan={4} style={{ height: padEnd }} />
                </tr>
            );
        }
    }

    useEffect(() => {
        if (!players.length || !virtualItems.length) return;
        const lastVirtualItemIndex = virtualItems[virtualItems.length - 1].index;
        if (players.length <= lastVirtualItemIndex && !hasReachedEnd && !isFetching) {
            fetchNextPageRef.current?.();
        }
    }, [players, virtualItems, hasReachedEnd, isFetching]);

    // rowVirtualizer is stable from useVirtualizer; fetchNextPageRef is a ref — omitted from deps intentionally.
    useEffect(() => {
        rowVirtualizer.scrollToIndex(0);
        fetchNextPageRef.current?.(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- reset list on query/sort only
    }, [search, filters, sorting]);

    return (
        <div
            className="border-border/60 bg-card flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border shadow-sm"
            style={{ overflowAnchor: 'none' }}
        >
            <ScrollArea className="min-h-0 flex-1" ref={rootRef} viewportRef={viewportRef}>
                <table className="w-full caption-bottom text-sm select-none">
                    <TableHeader className="sticky top-0 z-20">
                        <TableRow className="border-border/50 bg-card/95 hover:bg-card/95 border-b shadow-sm backdrop-blur-md">
                            <th className="text-muted-foreground/60 px-3 py-2.5 text-left text-[11px] font-semibold tracking-widest uppercase">
                                Player
                            </th>
                            <SortableTableHeader
                                label="Joined"
                                sortKey="tsJoined"
                                sortingState={sorting}
                                setSorting={setSorting}
                            />
                            <SortableTableHeader
                                label="Last seen"
                                sortKey="tsLastConnection"
                                sortingState={sorting}
                                setSorting={setSorting}
                            />
                            <SortableTableHeader
                                label="Playtime"
                                sortKey="playTime"
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
                            const isLastRow = virtualItem.index > players.length - 1;
                            return isLastRow ? (
                                <LastRow
                                    key={virtualItem.key}
                                    playersCount={players.length}
                                    hasReachedEnd={hasReachedEnd}
                                    loadError={loadError}
                                    isFetching={isFetching}
                                    retryFetch={fetchNextPage}
                                />
                            ) : (
                                <PlayerRow
                                    key={virtualItem.key}
                                    rowData={players[virtualItem.index]}
                                    modalOpener={openPlayerModal}
                                    tagLookup={tagLookup}
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
