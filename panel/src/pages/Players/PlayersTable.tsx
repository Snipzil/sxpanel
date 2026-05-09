import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ScrollArea } from '@/components/ui/scroll-area';
import TxAnchor from '@/components/TxAnchor';
import { cn } from '@/lib/utils';
import { convertRowDateTime, msToShortDuration } from '@/lib/dateTime';
import { TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2Icon, ChevronUpIcon, ChevronDownIcon, ChevronsUpDownIcon } from 'lucide-react';
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
import { PlayerTag, TagDefinition, AUTO_TAG_DEFINITIONS } from '@shared/socketioTypes';
import { searchMockPlayers } from './devMockPlayers';
import { isDevMockStatusOptInEnabled } from '@/lib/devFlags';

const FALLBACK_TAG_LOOKUP: Record<string, { label: string; color: string; priority: number }> = {
    staff: { label: 'Staff', color: '#EF4444', priority: 1 },
    problematic: { label: 'Problematic', color: '#FB923C', priority: 2 },
    newplayer: { label: 'Newcomer', color: '#A3E635', priority: 3 },
};

const buildTagLookup = (defs: TagDefinition[]) => {
    const lookup: Record<string, { label: string; color: string; priority: number }> = { ...FALLBACK_TAG_LOOKUP };
    for (const d of defs) {
        if (d.enabled === false) {
            delete lookup[d.id];
        } else {
            lookup[d.id] = { label: d.label, color: d.color, priority: d.priority };
        }
    }
    return lookup;
};

const getTopTag = (tags: PlayerTag[], lookup: Record<string, { label: string; color: string; priority: number }>) => {
    if (!tags.length) return null;
    return tags.reduce((top, tag) => {
        const topPriority = lookup[top]?.priority ?? 999;
        const tagPriority = lookup[tag]?.priority ?? 999;
        return tagPriority < topPriority ? tag : top;
    });
};

const deriveTagStyles = (hex: string) => {
    const sanitized = hex.startsWith('#') ? hex.slice(1) : hex;
    const normalized =
        sanitized.length === 3
            ? sanitized
                  .split('')
                  .map((char) => `${char}${char}`)
                  .join('')
            : sanitized;
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);

    return {
        backgroundColor: `rgba(${r}, ${g}, ${b}, 0.12)`,
        borderColor: `rgba(${r}, ${g}, ${b}, 0.28)`,
        accentColor: hex,
    };
};

/**
 * Player row
 */
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
            className="cursor-pointer transition-colors"
            style={
                tagStyles
                    ? {
                          backgroundColor: tagStyles.backgroundColor,
                          backgroundImage: `linear-gradient(90deg, ${tagStyles.backgroundColor}, transparent 42%)`,
                          boxShadow: `inset 2px 0 0 ${tagStyles.accentColor}, inset 0 0 0 1px ${tagStyles.borderColor}`,
                      }
                    : undefined
            }
        >
            <TableCell className={'flex justify-between border-r px-4 py-2'}>
                <div className="flex min-w-0 items-center gap-2">
                    <span className="line-clamp-1 overflow-hidden break-all text-ellipsis">{rowData.displayName}</span>
                    {topTag && (
                        <span
                            className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-[0.04em]"
                            style={{
                                color: topTag.color,
                                borderColor: tagStyles?.borderColor,
                                backgroundColor: tagStyles?.backgroundColor,
                            }}
                        >
                            {topTag.label}
                        </span>
                    )}
                    <span
                        className={cn(
                            'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em]',
                            rowData.isOnline
                                ? 'border-success/35 bg-success/12 text-success-inline'
                                : 'border-border bg-muted text-muted-foreground',
                        )}
                    >
                        {rowData.isOnline ? 'ONLINE' : 'OFFLINE'}
                    </span>
                </div>
            </TableCell>
            <TableCell className="min-w-32 border-r px-4 py-2">
                {msToShortDuration(rowData.playTime * 60_000)}
            </TableCell>
            <TableCell className="min-w-40 border-r px-4 py-2">{convertRowDateTime(rowData.tsJoined)}</TableCell>
            <TableCell className="min-w-40 px-4 py-2">{convertRowDateTime(rowData.tsLastConnection)}</TableCell>
        </TableRow>
    );
}

/**
 * Last row
 */
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
        content = <Loader2Icon className="mx-auto animate-spin" />;
    } else if (loadError) {
        content = (
            <>
                <span className="text-destructive-inline">Error: {loadError}</span>
                <br />
                <button className="underline" onClick={() => retryFetch()}>
                    Try again?
                </button>
            </>
        );
    } else if (hasReachedEnd) {
        content = (
            <span className="text-muted-foreground font-bold">
                {playersCount ? 'You have reached the end of the list.' : 'No players found.'}
            </span>
        );
    } else {
        content = (
            <span>
                You've found the end of the rainbow, but there's no pot of gold here. <br />
                <i>
                    (this is a bug, please report it in{' '}
                    <TxAnchor href="https://discord.gg/6FcqBYwxH5" target="_blank" rel="noopener noreferrer">
                        https://discord.gg/6FcqBYwxH5
                    </TxAnchor>
                    )
                </i>
            </span>
        );
    }

    return (
        <TableRow>
            <TableCell colSpan={4} className="px-4 py-2 text-center">
                {content}
            </TableCell>
        </TableRow>
    );
}

/**
 * Sortable table header
 */
type SortableTableHeaderProps = {
    label: string;
    sortKey: 'playTime' | 'tsJoined' | 'tsLastConnection';
    sortingState: PlayersTableSortingType;
    setSorting: (newState: PlayersTableSortingType) => void;
    className?: string;
};

function SortableTableHeader({ label, sortKey, sortingState, setSorting, className }: SortableTableHeaderProps) {
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
                'hover:bg-secondary/40 cursor-pointer px-4 py-2.5 text-left font-medium transition-colors select-none',
                isSorted && 'bg-secondary/30 text-foreground',
                className,
            )}
        >
            <div className="flex items-center gap-1">
                {label}
                <SortIcon className={cn('h-3 w-3', isSorted ? 'text-accent' : 'opacity-40')} />
            </div>
        </th>
    );
}

/**
 * Players table
 */
type PlayersTableProps = {
    search: PlayersTableSearchType;
    filters: PlayersTableFiltersType;
};

export default function PlayersTable({ search, filters }: PlayersTableProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
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

    const fetchNextPageRef = useRef<(resetOffset?: boolean) => Promise<void>>();

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
            const resp = isDevMockMode
                ? await searchMockPlayers(queryParams)
                : await playerListingApi({ queryParams });

            //Dealing with errors
            if (resp === undefined) {
                return handleError(`Request failed.`);
            } else if ('error' in resp) {
                return handleError(`Request failed: ${resp.error}`);
            }

            //Setting the states
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

    // Stable ref so effects always call the latest fetchNextPage without
    // depending on its identity (which changes every render).
    useEffect(() => {
        fetchNextPageRef.current = fetchNextPage;
    });

    // The virtualizer
    const rowVirtualizer = useVirtualizer({
        isScrollingResetDelay: 0,
        count: players.length + 1,
        getScrollElement: () => (scrollRef.current as HTMLDivElement)?.getElementsByTagName('div')[0],
        estimateSize: () => 38, // border-b
        overscan: 25,
    });
    const virtualItems = rowVirtualizer.getVirtualItems();
    const virtualizerTotalSize = rowVirtualizer.getTotalSize();

    //NOTE: This is required due to how css works on tables
    //ref: https://github.com/TanStack/virtual/issues/585
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

    // Automagically fetch next page when reaching the end
    useEffect(() => {
        if (!players.length || !virtualItems.length) return;
        const lastVirtualItemIndex = virtualItems[virtualItems.length - 1].index;
        if (players.length <= lastVirtualItemIndex && !hasReachedEnd && !isFetching) {
            fetchNextPageRef.current?.();
        }
    }, [players, virtualItems, hasReachedEnd, isFetching]);

    //on state change, reset the list
    // rowVirtualizer is a stable object from useVirtualizer and fetchNextPageRef is a ref —
    // neither should trigger re-runs, so they are intentionally omitted from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        rowVirtualizer.scrollToIndex(0);
        fetchNextPageRef.current?.(true);
    }, [search, filters, sorting]);

    return (
        <div
            className="border-border/60 min-h-0 w-full flex-1 overflow-auto border shadow-sm md:rounded-xl"
            style={{ overflowAnchor: 'none' }}
        >
            <ScrollArea className="h-full" ref={scrollRef}>
                <table className="w-full caption-bottom text-sm select-none">
                    <TableHeader>
                        <tr className="bg-card/95 text-muted-foreground/60 border-border/40 sticky top-0 z-10 border-b text-[11px] tracking-wider uppercase shadow-sm backdrop-blur-sm transition-colors">
                            <th className="px-4 py-2.5 text-left font-medium">Display Name</th>
                            <SortableTableHeader
                                label="Play Time"
                                sortKey="playTime"
                                sortingState={sorting}
                                setSorting={setSorting}
                            />
                            <SortableTableHeader
                                label="First Joined"
                                sortKey="tsJoined"
                                sortingState={sorting}
                                setSorting={setSorting}
                            />
                            <SortableTableHeader
                                label="Last Connection"
                                sortKey="tsLastConnection"
                                sortingState={sorting}
                                setSorting={setSorting}
                            />
                        </tr>
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
