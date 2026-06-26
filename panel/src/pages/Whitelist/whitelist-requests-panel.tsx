import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { useBackendApi } from '@/hooks/fetch';
import { useAdminPerms } from '@/hooks/auth';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Button } from '@/components/ui/button';
import { TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle2Icon, ClockIcon, Loader2Icon, SearchXIcon, XIcon } from 'lucide-react';
import type { GenericApiOkResp } from '@shared/genericApiTypes';
import { useOpenConfirmDialog } from '@/hooks/dialogs';
import { tsToLocaleDateTimeString } from '@/lib/dateTime';
import { WhitelistPagination } from './whitelist-pagination';
import { WhitelistToolbar } from './whitelist-toolbar';
import type { WhitelistRequestsResp } from './whitelist-types';
import { useLocale } from '@/hooks/locale';
import { ResponsiveDataTable } from '@/components/responsive/ResponsiveDataTable';

type WhitelistRequestsPanelProps = {
    onCountChange: (total: number | undefined) => void;
};

function displayInitial(name: string) {
    const t = name.trim();
    return t ? t.charAt(0).toUpperCase() : '?';
}

export function WhitelistRequestsPanel({ onCountChange }: WhitelistRequestsPanelProps) {
    const { t } = useLocale();
    const { hasPerm } = useAdminPerms();
    const canManage = hasPerm('players.whitelist');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const debouncedSearch = useDebouncedValue(search, 300);
    const openConfirmDialog = useOpenConfirmDialog();

    const handleSearchChange = (value: string) => {
        setSearch(value);
        setPage(1);
    };

    const listApi = useBackendApi<WhitelistRequestsResp>({
        method: 'GET',
        path: '/whitelist/requests',
        throwGenericErrors: true,
    });
    const actionApi = useBackendApi<GenericApiOkResp>({
        method: 'POST',
        path: '/whitelist/requests/:action',
    });

    const swr = useSWR(
        `/whitelist/requests?search=${debouncedSearch}&page=${page}`,
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

    const resp = swr.data && 'requests' in swr.data ? swr.data : undefined;

    useEffect(() => {
        if (resp?.cntTotal !== undefined) {
            onCountChange(resp.cntTotal);
        } else if (!swr.isLoading) {
            onCountChange(undefined);
        }
    }, [resp?.cntTotal, swr.isLoading, onCountChange]);

    const approveRequest = (reqId: string) => {
        actionApi({
            pathParams: { action: 'approve' },
            data: { reqId },
            toastLoadingMessage: 'Approving...',
            genericHandler: { successMsg: 'Request approved' },
            success: () => swr.mutate(),
        });
    };

    const denyRequest = (reqId: string) => {
        actionApi({
            pathParams: { action: 'deny' },
            data: { reqId },
            toastLoadingMessage: 'Denying...',
            genericHandler: { successMsg: 'Request denied' },
            success: () => swr.mutate(),
        });
    };

    const denyAll = () => {
        if (!resp || resp.newest == null) return;
        openConfirmDialog({
            title: 'Deny All Requests',
            message: `Are you sure you want to deny all ${resp.cntTotal} pending whitelist requests?`,
            onConfirm: () => {
                actionApi({
                    pathParams: { action: 'deny_all' },
                    data: { newestVisible: resp.newest },
                    toastLoadingMessage: 'Denying all...',
                    genericHandler: { successMsg: 'All requests denied' },
                    success: () => swr.mutate(),
                });
            },
        });
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
            <WhitelistToolbar
                search={search}
                onSearchChange={handleSearchChange}
                placeholder={t('panel.whitelist.search_requests')}
                countFiltered={resp?.cntFiltered}
                countTotal={resp?.cntTotal}
                countNoun="requests"
                trailing={
                    canManage && resp && resp.cntTotal > 0 ? (
                        <Button variant="destructive" size="sm" onClick={denyAll}>
                            Deny all
                        </Button>
                    ) : null
                }
            />

            <div className="border-border/60 bg-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border shadow-sm">
                {swr.isLoading ? (
                    <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 py-16">
                        <Loader2Icon className="text-primary size-8 animate-spin" />
                        <p className="text-sm font-medium">Loading requests…</p>
                    </div>
                ) : !resp || resp.requests.length === 0 ? (
                    <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 py-16">
                        {debouncedSearch ? (
                            <SearchXIcon className="size-10 opacity-50" />
                        ) : (
                            <ClockIcon className="size-10 opacity-50" />
                        )}
                        <p className="text-foreground text-sm font-semibold">
                            {debouncedSearch ? 'No requests match your search' : 'No pending requests'}
                        </p>
                        <p className="max-w-sm text-center text-xs">
                            {debouncedSearch
                                ? 'Try another request ID, player name, or Discord tag.'
                                : 'Players who try to join without whitelist approval show up here.'}
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
                                            Request ID
                                        </th>
                                        <th className="text-muted-foreground/60 px-3 py-2.5 text-left text-[11px] font-semibold tracking-widest uppercase">
                                            Discord
                                        </th>
                                        <th className="text-muted-foreground/60 px-3 py-2.5 text-left text-[11px] font-semibold tracking-widest uppercase">
                                            Last attempt
                                        </th>
                                        {canManage ? (
                                            <th className="text-muted-foreground/60 w-[1%] px-3 py-2.5 text-right text-[11px] font-semibold tracking-widest uppercase">
                                                Actions
                                            </th>
                                        ) : null}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {resp.requests.map((req) => (
                                        <TableRow
                                            key={req.id}
                                            className="border-border/40 hover:bg-accent/40 border-b transition-colors"
                                        >
                                            <TableCell className="px-3 py-2.5 align-middle">
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className="border-warning/35 bg-warning/12 text-warning-inline flex size-10 shrink-0 items-center justify-center rounded-full border text-sm font-bold"
                                                        aria-hidden
                                                    >
                                                        {displayInitial(req.playerDisplayName)}
                                                    </div>
                                                    <p className="text-foreground font-semibold">
                                                        {req.playerDisplayName}
                                                    </p>
                                                </div>
                                            </TableCell>
                                            <TableCell className="px-3 py-2.5 align-middle">
                                                <code className="text-muted-foreground bg-muted/50 rounded-md px-1.5 py-0.5 font-mono text-[11px]">
                                                    {req.id}
                                                </code>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground px-3 py-2.5 align-middle text-sm">
                                                {req.discordTag || <span className="italic opacity-70">—</span>}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground px-3 py-2.5 align-middle text-sm whitespace-nowrap">
                                                {tsToLocaleDateTimeString(req.tsLastAttempt, 'short', 'short')}
                                            </TableCell>
                                            {canManage ? (
                                                <TableCell className="px-3 py-2.5 text-right align-middle">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-success-inline hover:bg-success/10 h-8"
                                                            onClick={() => approveRequest(req.id)}
                                                        >
                                                            <CheckCircle2Icon className="mr-1 size-3.5" />
                                                            Approve
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-destructive hover:bg-destructive/10 h-8"
                                                            onClick={() => denyRequest(req.id)}
                                                        >
                                                            <XIcon className="mr-1 size-3.5" />
                                                            Deny
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            ) : null}
                                        </TableRow>
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
