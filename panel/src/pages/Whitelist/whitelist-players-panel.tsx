import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { useBackendApi } from '@/hooks/fetch';
import { useAdminPerms } from '@/hooks/auth';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Button } from '@/components/ui/button';
import { TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { CopyIcon, DownloadIcon, Loader2Icon, SearchXIcon, Trash2Icon, UploadIcon, UsersIcon } from 'lucide-react';
import { txToast } from '@/components/TxToaster';
import { tsToLocaleDateTimeString } from '@/lib/dateTime';
import type { GenericApiOkResp } from '@shared/genericApiTypes';
import type {
    ApiWhitelistBulkExportResp,
    ApiWhitelistBulkImportResp,
    ApiWhitelistPlayersResp,
    WhitelistEntry,
} from '@shared/whitelistApiTypes';
import { useOpenConfirmDialog } from '@/hooks/dialogs';
import { cn } from '@/lib/utils';
import { WhitelistPagination } from './whitelist-pagination';
import { WhitelistToolbar } from './whitelist-toolbar';
import { useLocale } from '@/hooks/locale';
import { ResponsiveDataTable } from '@/components/responsive/ResponsiveDataTable';

type WhitelistPlayersPanelProps = {
    onCountChange: (total: number | undefined) => void;
};

function displayInitial(name: string) {
    const t = name.trim();
    return t ? t.charAt(0).toUpperCase() : '?';
}

function WhitelistedPlayerRow({ player, onRemoved }: { player: WhitelistEntry; onRemoved: () => void }) {
    const { t } = useLocale();
    const { hasPerm } = useAdminPerms();
    const canManage = hasPerm('players.whitelist');
    const openConfirmDialog = useOpenConfirmDialog();

    const removeApi = useBackendApi<GenericApiOkResp>({
        method: 'POST',
        path: '/whitelist/approvals/remove',
    });

    const copyIdentifier = () => {
        navigator.clipboard
            .writeText(player.identifier)
            .then(() => txToast.success('Identifier copied to clipboard'))
            .catch(() => txToast.error('Failed to copy identifier to clipboard'));
    };

    const handleRemove = () => {
        openConfirmDialog({
            title: 'Remove Whitelist',
            message: `Remove whitelist approval for ${player.name || player.identifier}?`,
            onConfirm: () => {
                removeApi({
                    data: { identifier: player.identifier },
                    toastLoadingMessage: 'Removing...',
                    genericHandler: { successMsg: 'Whitelist approval removed.' },
                    success: onRemoved,
                });
            },
        });
    };

    return (
        <TableRow className="border-border/40 hover:bg-accent/40 border-b transition-colors">
            <TableCell className="px-3 py-2.5 align-middle">
                <div className="flex items-center gap-3">
                    <div
                        className="border-success/35 bg-success/12 text-success-inline flex size-10 shrink-0 items-center justify-center rounded-full border text-sm font-bold"
                        aria-hidden
                    >
                        {displayInitial(player.name || player.identifier)}
                    </div>
                    <div className="min-w-0">
                        <p className="text-foreground truncate font-semibold">{player.name || 'Unknown'}</p>
                        <code className="text-muted-foreground mt-0.5 block truncate font-mono text-[11px]">
                            {player.identifier}
                        </code>
                    </div>
                </div>
            </TableCell>
            <TableCell className="text-muted-foreground px-3 py-2.5 align-middle text-sm">
                {player.approvedBy || <span className="italic opacity-70">unknown</span>}
            </TableCell>
            <TableCell className="text-muted-foreground px-3 py-2.5 align-middle text-sm whitespace-nowrap">
                {tsToLocaleDateTimeString(player.tsApproved, 'short', 'short')}
            </TableCell>
            <TableCell className="px-3 py-2.5 text-right align-middle">
                <div className="flex items-center justify-end gap-0.5">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={copyIdentifier}
                        title={t('panel.whitelist.copy_identifier')}
                    >
                        <CopyIcon className="size-3.5" />
                    </Button>
                    {canManage ? (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive size-8"
                            onClick={handleRemove}
                            title={t('panel.whitelist.remove_whitelist')}
                        >
                            <Trash2Icon className="size-3.5" />
                        </Button>
                    ) : null}
                </div>
            </TableCell>
        </TableRow>
    );
}

export function WhitelistPlayersPanel({ onCountChange }: WhitelistPlayersPanelProps) {
    const { t } = useLocale();
    const { hasPerm } = useAdminPerms();
    const canManage = hasPerm('players.whitelist');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const debouncedSearch = useDebouncedValue(search, 300);

    const handleSearchChange = (value: string) => {
        setSearch(value);
        setPage(1);
    };

    const listApi = useBackendApi<ApiWhitelistPlayersResp>({
        method: 'GET',
        path: '/whitelist/players',
        throwGenericErrors: true,
    });

    const bulkExportApi = useBackendApi<ApiWhitelistBulkExportResp>({
        method: 'GET',
        path: '/whitelist/bulk/export',
    });
    const bulkImportApi = useBackendApi<ApiWhitelistBulkImportResp>({
        method: 'POST',
        path: '/whitelist/bulk/import',
    });

    const handleExport = async () => {
        const data = await bulkExportApi({});
        if (!data || 'error' in data) return;
        const blob = new Blob([JSON.stringify(data.entries, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'whitelist-export.json';
        a.click();
        URL.revokeObjectURL(url);
        txToast.success('Whitelist exported');
    };

    const handleImport = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                const entries = JSON.parse(text);
                if (!Array.isArray(entries)) throw new Error('Invalid file');
                bulkImportApi({
                    data: { entries },
                    toastLoadingMessage: 'Importing...',
                    genericHandler: { successMsg: 'Import complete' },
                    success: () => swr.mutate(),
                });
            } catch {
                txToast.error('Invalid whitelist JSON file');
            }
        };
        input.click();
    };

    const swr = useSWR(
        `/whitelist/players?search=${debouncedSearch}&page=${page}`,
        async () => {
            const data = await listApi({
                queryParams: {
                    searchString: debouncedSearch,
                    page: String(page),
                },
            });
            if (!data) throw new Error('Failed to load');
            return data;
        },
        { dedupingInterval: 5_000 },
    );

    const resp = swr.data && 'players' in swr.data ? swr.data : undefined;

    useEffect(() => {
        if (resp?.cntTotal !== undefined) {
            onCountChange(resp.cntTotal);
        } else if (!swr.isLoading) {
            onCountChange(undefined);
        }
    }, [resp?.cntTotal, swr.isLoading, onCountChange]);

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
            <WhitelistToolbar
                search={search}
                onSearchChange={handleSearchChange}
                placeholder={t('panel.whitelist.search_players')}
                countFiltered={resp?.cntFiltered}
                countTotal={resp?.cntTotal}
                countNoun="players"
                trailing={
                    canManage ? (
                        <>
                            <Button variant="outline" size="sm" onClick={handleExport}>
                                <DownloadIcon className="mr-1 size-3.5" />
                                Export
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleImport}>
                                <UploadIcon className="mr-1 size-3.5" />
                                Import
                            </Button>
                        </>
                    ) : null
                }
            />

            <div
                className={cn(
                    'border-border/60 bg-background flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border',
                )}
            >
                {swr.isLoading ? (
                    <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 py-16">
                        <Loader2Icon className="text-primary size-8 animate-spin" />
                        <p className="text-sm font-medium">Loading whitelisted players…</p>
                    </div>
                ) : !resp || resp.players.length === 0 ? (
                    <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 py-16">
                        {debouncedSearch ? (
                            <SearchXIcon className="size-10 opacity-50" />
                        ) : (
                            <UsersIcon className="size-10 opacity-50" />
                        )}
                        <p className="text-foreground text-sm font-semibold">
                            {debouncedSearch ? 'No players match your search' : 'No whitelisted players yet'}
                        </p>
                        <p className="max-w-sm text-center text-xs">
                            {debouncedSearch
                                ? 'Try a different name, license, or staff member.'
                                : 'Approved players appear here after they join the server.'}
                        </p>
                    </div>
                ) : (
                    <>
                        <ResponsiveDataTable className="min-h-0 flex-1">
                            <table className="w-full caption-bottom text-sm">
                                <TableHeader className="sticky top-0 z-10">
                                    <TableRow className="border-border/50 bg-card/95 hover:bg-card/95 border-b shadow-sm backdrop-blur-md">
                                        <th className="text-muted-foreground/60 px-3 py-2.5 text-left text-[11px] font-semibold tracking-widest uppercase">
                                            Player
                                        </th>
                                        <th className="text-muted-foreground/60 px-3 py-2.5 text-left text-[11px] font-semibold tracking-widest uppercase">
                                            Approved by
                                        </th>
                                        <th className="text-muted-foreground/60 px-3 py-2.5 text-left text-[11px] font-semibold tracking-widest uppercase">
                                            Date
                                        </th>
                                        <th className="text-muted-foreground/60 w-[1%] px-3 py-2.5 text-right text-[11px] font-semibold tracking-widest uppercase">
                                            Actions
                                        </th>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {resp.players.map((player) => (
                                        <WhitelistedPlayerRow
                                            key={player.identifier}
                                            player={player}
                                            onRemoved={() => swr.mutate()}
                                        />
                                    ))}
                                </TableBody>
                            </table>
                        </ResponsiveDataTable>
                        <div className="shrink-0 px-4 pb-4">
                            <WhitelistPagination
                                currPage={resp.currPage}
                                totalPages={resp.totalPages}
                                onPageChange={setPage}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
