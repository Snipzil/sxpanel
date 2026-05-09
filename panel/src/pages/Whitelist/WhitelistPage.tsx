import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useBackendApi } from '@/hooks/fetch';
import { useAdminPerms } from '@/hooks/auth';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    CheckCircle2Icon,
    ClockIcon,
    CopyIcon,
    Loader2Icon,
    PlusIcon,
    SearchIcon,
    ShieldCheckIcon,
    Trash2Icon,
    UserCheckIcon,
    UsersIcon,
    XIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
} from 'lucide-react';
import { txToast } from '@/components/TxToaster';
import { tsToLocaleDateTimeString } from '@/lib/dateTime';
import type { GenericApiOkResp } from '@shared/genericApiTypes';
import type { ApiWhitelistPlayersResp, WhitelistEntry } from '@shared/whitelistApiTypes';
import { useOpenConfirmDialog } from '@/hooks/dialogs';
import { PageHeader } from '@/components/page-header';

type WhitelistApproval = {
    identifier: string;
    playerName: string;
    playerAvatar: string | null;
    tsApproved: number;
    approvedBy: string;
};

type WhitelistRequest = {
    id: string;
    license: string;
    playerDisplayName: string;
    playerPureName: string;
    discordTag?: string;
    discordAvatar?: string;
    tsLastAttempt: number;
};

type WhitelistRequestsResp = {
    cntTotal: number;
    cntFiltered: number;
    newest: number | null;
    totalPages: number;
    currPage: number;
    requests: WhitelistRequest[];
};

function Pagination({
    currPage,
    totalPages,
    onPageChange,
}: {
    currPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
}) {
    if (totalPages <= 1) return null;
    return (
        <div className="flex items-center justify-center gap-2 pt-2">
            <Button variant="outline" size="xs" onClick={() => onPageChange(currPage - 1)} disabled={currPage <= 1}>
                <ChevronLeftIcon className="h-4 w-4" />
            </Button>
            <span className="text-muted-foreground text-sm">
                Page {currPage} of {totalPages}
            </span>
            <Button
                variant="outline"
                size="xs"
                onClick={() => onPageChange(currPage + 1)}
                disabled={currPage >= totalPages}
            >
                <ChevronRightIcon className="h-4 w-4" />
            </Button>
        </div>
    );
}

function WhitelistedPlayersTab() {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const debouncedSearch = useDebouncedValue(search, 300);

    useEffect(() => {
        setPage(1);
    }, [debouncedSearch]);

    const listApi = useBackendApi<ApiWhitelistPlayersResp>({
        method: 'GET',
        path: '/whitelist/players',
        throwGenericErrors: true,
    });

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

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <div className="relative grow">
                    <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                    <Input
                        placeholder="Search by name, identifier, or staff..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>
                {resp && (
                    <span className="text-muted-foreground text-sm whitespace-nowrap">
                        {resp.cntFiltered === resp.cntTotal
                            ? `${resp.cntTotal} players`
                            : `${resp.cntFiltered} of ${resp.cntTotal}`}
                    </span>
                )}
            </div>

            {swr.isLoading ? (
                <div className="flex justify-center py-8">
                    <Loader2Icon className="text-muted-foreground h-6 w-6 animate-spin" />
                </div>
            ) : !resp || resp.players.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center">
                    <UsersIcon className="mx-auto mb-2 h-8 w-8 opacity-50" />
                    <p>{debouncedSearch ? 'No players match your search.' : 'No whitelisted players found.'}</p>
                </div>
            ) : (
                <>
                    <div className="border-border/60 overflow-hidden rounded-xl border shadow-sm">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-card/95 border-border/40 text-muted-foreground/50 border-b text-[10px] font-semibold tracking-widest uppercase">
                                    <th className="px-4 py-2.5 text-left font-medium">Player</th>
                                    <th className="px-4 py-2.5 text-left font-medium">Identifier</th>
                                    <th className="px-4 py-2.5 text-left font-medium">Approved By</th>
                                    <th className="px-4 py-2.5 text-left font-medium">Date</th>
                                    <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {resp.players.map((player) => (
                                    <WhitelistedPlayerRow
                                        key={player.identifier}
                                        player={player}
                                        onRemoved={() => swr.mutate()}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination currPage={resp.currPage} totalPages={resp.totalPages} onPageChange={setPage} />
                </>
            )}
        </div>
    );
}

function WhitelistedPlayerRow({ player, onRemoved }: { player: WhitelistEntry; onRemoved: () => void }) {
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
            .then(() => {
                txToast.success('Identifier copied to clipboard');
            })
            .catch(() => {
                txToast.error('Failed to copy identifier to clipboard');
            });
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
        <tr className="hover:bg-secondary/30 border-border/30 border-b transition-colors last:border-b-0">
            <td className="px-4 py-2.5 font-medium">{player.name}</td>
            <td className="px-4 py-2.5">
                <code className="bg-secondary/60 rounded px-1.5 py-0.5 font-mono text-xs">{player.identifier}</code>
            </td>
            <td className="text-muted-foreground px-4 py-2.5">
                {player.approvedBy || <span className="italic">unknown</span>}
            </td>
            <td className="text-muted-foreground px-4 py-2.5">
                {tsToLocaleDateTimeString(player.tsApproved, 'short', 'short')}
            </td>
            <td className="px-4 py-2.5 text-right">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copyIdentifier} title="Copy ID">
                    <CopyIcon className="h-3.5 w-3.5" />
                </Button>
                {canManage && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive h-7 w-7"
                        onClick={handleRemove}
                        title="Remove whitelist"
                    >
                        <Trash2Icon className="h-3.5 w-3.5" />
                    </Button>
                )}
            </td>
        </tr>
    );
}

function RequestsTab() {
    const { hasPerm } = useAdminPerms();
    const canManage = hasPerm('players.whitelist');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const debouncedSearch = useDebouncedValue(search, 300);
    const openConfirmDialog = useOpenConfirmDialog();

    useEffect(() => {
        setPage(1);
    }, [debouncedSearch]);

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

    const approveRequest = (reqId: string) => {
        actionApi({
            pathParams: { action: 'approve' },
            data: { reqId },
            toastLoadingMessage: 'Approving...',
            genericHandler: { successMsg: 'Request approved' },
            success: () => {
                swr.mutate();
            },
        });
    };

    const denyRequest = (reqId: string) => {
        actionApi({
            pathParams: { action: 'deny' },
            data: { reqId },
            toastLoadingMessage: 'Denying...',
            genericHandler: { successMsg: 'Request denied' },
            success: () => {
                swr.mutate();
            },
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
                    success: () => {
                        swr.mutate();
                    },
                });
            },
        });
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <div className="relative grow">
                    <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                    <Input
                        placeholder="Search by ID, name, or Discord tag..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>
                {canManage && resp && resp.cntTotal > 0 && (
                    <Button variant="destructive" size="sm" onClick={denyAll}>
                        Deny All
                    </Button>
                )}
                {resp && (
                    <span className="text-muted-foreground text-sm whitespace-nowrap">
                        {resp.cntFiltered === resp.cntTotal
                            ? `${resp.cntTotal} requests`
                            : `${resp.cntFiltered} of ${resp.cntTotal}`}
                    </span>
                )}
            </div>

            {swr.isLoading ? (
                <div className="flex justify-center py-8">
                    <Loader2Icon className="text-muted-foreground h-6 w-6 animate-spin" />
                </div>
            ) : !resp || resp.requests.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center">
                    <ClockIcon className="mx-auto mb-2 h-8 w-8 opacity-50" />
                    <p>{debouncedSearch ? 'No requests match your search.' : 'No pending whitelist requests.'}</p>
                </div>
            ) : (
                <>
                    <div className="border-border/60 overflow-hidden rounded-xl border shadow-sm">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-card/95 border-border/40 text-muted-foreground/50 border-b text-[10px] font-semibold tracking-widest uppercase">
                                    <th className="px-4 py-2.5 text-left font-medium">ID</th>
                                    <th className="px-4 py-2.5 text-left font-medium">Player</th>
                                    <th className="px-4 py-2.5 text-left font-medium">Discord</th>
                                    <th className="px-4 py-2.5 text-left font-medium">Last Attempt</th>
                                    {canManage && <th className="px-4 py-2.5 text-right font-medium">Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {resp.requests.map((req) => (
                                    <tr
                                        key={req.id}
                                        className="hover:bg-secondary/30 border-border/30 border-b transition-colors last:border-b-0"
                                    >
                                        <td className="px-4 py-2.5">
                                            <code className="bg-secondary/60 rounded px-1.5 py-0.5 font-mono text-xs">
                                                {req.id}
                                            </code>
                                        </td>
                                        <td className="px-4 py-2.5 font-medium">{req.playerDisplayName}</td>
                                        <td className="text-muted-foreground px-4 py-2.5">
                                            {req.discordTag || <span className="italic"> - </span>}
                                        </td>
                                        <td className="text-muted-foreground px-4 py-2.5">
                                            {tsToLocaleDateTimeString(req.tsLastAttempt, 'short', 'short')}
                                        </td>
                                        {canManage && (
                                            <td className="px-4 py-2.5 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="xs"
                                                        className="text-success-inline hover:bg-success/10"
                                                        onClick={() => approveRequest(req.id)}
                                                    >
                                                        <CheckCircle2Icon className="mr-1 h-3.5 w-3.5" />
                                                        Approve
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="xs"
                                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                        onClick={() => denyRequest(req.id)}
                                                    >
                                                        <XIcon className="mr-1 h-3.5 w-3.5" />
                                                        Deny
                                                    </Button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination currPage={resp.currPage} totalPages={resp.totalPages} onPageChange={setPage} />
                </>
            )}
        </div>
    );
}

function ApprovalsTab() {
    const { hasPerm } = useAdminPerms();
    const canManage = hasPerm('players.whitelist');
    const [search, setSearch] = useState('');
    const [addIdentifier, setAddIdentifier] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const openConfirmDialog = useOpenConfirmDialog();

    const listApi = useBackendApi<WhitelistApproval[]>({
        method: 'GET',
        path: '/whitelist/approvals',
        throwGenericErrors: true,
    });
    const actionApi = useBackendApi<GenericApiOkResp>({
        method: 'POST',
        path: '/whitelist/approvals/:action',
    });

    const swr = useSWR(
        '/whitelist/approvals',
        async () => {
            const data = await listApi({});
            if (!data) throw new Error('Failed to load');
            return data;
        },
        { dedupingInterval: 5_000 },
    );

    const approvals = swr.data ?? [];

    const filtered = useMemo(() => {
        if (!search) return approvals;
        const q = search.toLowerCase();
        return approvals.filter(
            (a) =>
                a.playerName.toLowerCase().includes(q) ||
                a.identifier.toLowerCase().includes(q) ||
                a.approvedBy.toLowerCase().includes(q),
        );
    }, [approvals, search]);

    const addApproval = () => {
        if (!addIdentifier.trim()) return;
        setIsAdding(true);
        actionApi({
            pathParams: { action: 'add' },
            data: { identifier: addIdentifier.trim() },
            toastLoadingMessage: 'Adding approval...',
            genericHandler: { successMsg: 'Approval added' },
            success: () => {
                setAddIdentifier('');
                swr.mutate();
            },
            finally: () => setIsAdding(false),
        });
    };

    const removeApproval = (identifier: string) => {
        openConfirmDialog({
            title: 'Remove Approval',
            message: 'Are you sure you want to remove this approval?',
            onConfirm: () => {
                actionApi({
                    pathParams: { action: 'remove' },
                    data: { identifier },
                    toastLoadingMessage: 'Removing...',
                    genericHandler: { successMsg: 'Approval removed' },
                    success: () => {
                        swr.mutate();
                    },
                });
            },
        });
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <div className="relative grow">
                    <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                    <Input
                        placeholder="Search by name, identifier, or staff..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <span className="text-muted-foreground text-sm whitespace-nowrap">
                    {filtered.length === approvals.length
                        ? `${approvals.length} pending`
                        : `${filtered.length} of ${approvals.length}`}
                </span>
            </div>

            {canManage && (
                <div className="flex items-center gap-2">
                    <Input
                        placeholder="license:xxxx or discord:xxxx"
                        value={addIdentifier}
                        onChange={(e) => setAddIdentifier(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addApproval()}
                        className="max-w-sm"
                    />
                    <Button size="sm" onClick={addApproval} disabled={isAdding || !addIdentifier.trim()}>
                        <PlusIcon className="mr-1 h-4 w-4" />
                        Add
                    </Button>
                </div>
            )}

            {swr.isLoading ? (
                <div className="flex justify-center py-8">
                    <Loader2Icon className="text-muted-foreground h-6 w-6 animate-spin" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center">
                    <ShieldCheckIcon className="mx-auto mb-2 h-8 w-8 opacity-50" />
                    <p>{search ? 'No approvals match your search.' : 'No pending approvals.'}</p>
                </div>
            ) : (
                <div className="border-border/60 overflow-hidden rounded-xl border shadow-sm">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-card/95 border-border/40 text-muted-foreground/50 border-b text-[10px] font-semibold tracking-widest uppercase">
                                <th className="px-4 py-2.5 text-left font-medium">Player</th>
                                <th className="px-4 py-2.5 text-left font-medium">Identifier</th>
                                <th className="px-4 py-2.5 text-left font-medium">Approved By</th>
                                <th className="px-4 py-2.5 text-left font-medium">Date</th>
                                {canManage && <th className="px-4 py-2.5 text-right font-medium">Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((a) => {
                                return (
                                    <tr
                                        key={a.identifier}
                                        className="hover:bg-secondary/30 border-border/30 border-b transition-colors last:border-b-0"
                                    >
                                        <td className="px-4 py-2.5 font-medium">
                                            <div className="flex items-center gap-2">{a.playerName}</div>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <code className="bg-secondary/60 rounded px-1.5 py-0.5 font-mono text-xs">
                                                {a.identifier}
                                            </code>
                                        </td>
                                        <td className="text-muted-foreground px-4 py-2.5">{a.approvedBy}</td>
                                        <td className="text-muted-foreground px-4 py-2.5">
                                            {tsToLocaleDateTimeString(a.tsApproved, 'short', 'short')}
                                        </td>
                                        {canManage && (
                                            <td className="px-4 py-2.5 text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 w-7"
                                                    onClick={() => removeApproval(a.identifier)}
                                                    title="Remove"
                                                >
                                                    <Trash2Icon className="h-3.5 w-3.5" />
                                                </Button>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default function WhitelistPage() {
    return (
        <div className="h-contentvh mx-auto flex w-full max-w-[1200px] flex-col gap-4">
            <PageHeader icon={<ShieldCheckIcon />} title="Whitelist" />

            <Tabs defaultValue="players" className="flex min-h-0 flex-1 flex-col">
                <TabsList>
                    <TabsTrigger value="players" className="gap-1.5">
                        <UsersIcon className="h-3.5 w-3.5" />
                        Whitelisted Players
                    </TabsTrigger>
                    <TabsTrigger value="requests" className="gap-1.5">
                        <ClockIcon className="h-3.5 w-3.5" />
                        Requests
                    </TabsTrigger>
                    <TabsTrigger value="approvals" className="gap-1.5">
                        <UserCheckIcon className="h-3.5 w-3.5" />
                        Pending Approvals
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="players" className="flex min-h-0 flex-1 flex-col">
                    <Card className="flex min-h-0 flex-1 flex-col">
                        <CardHeader className="shrink-0 pb-3">
                            <CardTitle className="text-base font-semibold">Whitelisted Players</CardTitle>
                            <p className="text-muted-foreground/60 text-xs">
                                All players who have been whitelisted and have joined the server.
                            </p>
                        </CardHeader>
                        <CardContent className="flex-1 overflow-auto">
                            <WhitelistedPlayersTab />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="requests" className="flex min-h-0 flex-1 flex-col">
                    <Card className="flex min-h-0 flex-1 flex-col">
                        <CardHeader className="shrink-0 pb-3">
                            <CardTitle className="text-base font-semibold">Whitelist Requests</CardTitle>
                            <p className="text-muted-foreground/60 text-xs">
                                Players who attempted to join but are not yet whitelisted.
                            </p>
                        </CardHeader>
                        <CardContent className="flex-1 overflow-auto">
                            <RequestsTab />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="approvals" className="flex min-h-0 flex-1 flex-col">
                    <Card className="flex min-h-0 flex-1 flex-col">
                        <CardHeader className="shrink-0 pb-3">
                            <CardTitle className="text-base font-semibold">Pending Approvals</CardTitle>
                            <p className="text-muted-foreground/60 text-xs">
                                Pre-approved identifiers that haven't joined yet. Automatically consumed when the player
                                connects.
                            </p>
                        </CardHeader>
                        <CardContent className="flex-1 overflow-auto">
                            <ApprovalsTab />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
