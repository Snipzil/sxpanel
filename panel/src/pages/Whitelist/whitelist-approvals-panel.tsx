import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useBackendApi } from '@/hooks/fetch';
import { useAdminPerms } from '@/hooks/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2Icon, PlusIcon, SearchXIcon, ShieldCheckIcon, Trash2Icon } from 'lucide-react';
import type { GenericApiOkResp } from '@shared/genericApiTypes';
import { useOpenConfirmDialog } from '@/hooks/dialogs';
import { tsToLocaleDateTimeString } from '@/lib/dateTime';
import { WhitelistToolbar } from './whitelist-toolbar';
import type { WhitelistApproval } from './whitelist-types';
import { useLocale } from '@/hooks/locale';
import { ResponsiveDataTable } from '@/components/responsive/ResponsiveDataTable';

type WhitelistApprovalsPanelProps = {
    onCountChange: (total: number | undefined) => void;
};

function displayInitial(name: string) {
    const t = name.trim();
    return t ? t.charAt(0).toUpperCase() : '?';
}

export function WhitelistApprovalsPanel({ onCountChange }: WhitelistApprovalsPanelProps) {
    const { t } = useLocale();
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

    useEffect(() => {
        if (!swr.isLoading) {
            onCountChange(approvals.length);
        }
    }, [swr.isLoading, approvals.length, onCountChange]);

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
                    success: () => swr.mutate(),
                });
            },
        });
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
            <WhitelistToolbar
                search={search}
                onSearchChange={setSearch}
                placeholder={t('panel.whitelist.search_players')}
                countFiltered={filtered.length}
                countTotal={approvals.length}
                countNoun="pending"
                footer={
                    canManage ? (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <p className="text-muted-foreground/60 text-[11px] font-semibold tracking-widest uppercase sm:mr-2 sm:mb-0">
                                Add identifier
                            </p>
                            <Input
                                placeholder={t('panel.whitelist.identifier_placeholder')}
                                value={addIdentifier}
                                onChange={(e) => setAddIdentifier(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addApproval()}
                                className="max-w-md flex-1 font-mono text-sm"
                            />
                            <Button size="sm" onClick={addApproval} disabled={isAdding || !addIdentifier.trim()}>
                                <PlusIcon className="mr-1 size-4" />
                                Add approval
                            </Button>
                        </div>
                    ) : undefined
                }
            />

            <div className="border-border/60 bg-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border shadow-sm">
                {swr.isLoading ? (
                    <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 py-16">
                        <Loader2Icon className="text-primary size-8 animate-spin" />
                        <p className="text-sm font-medium">Loading pending approvals…</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 py-16">
                        {search ? (
                            <SearchXIcon className="size-10 opacity-50" />
                        ) : (
                            <ShieldCheckIcon className="size-10 opacity-50" />
                        )}
                        <p className="text-foreground text-sm font-semibold">
                            {search ? 'No approvals match your search' : 'No pending approvals'}
                        </p>
                        <p className="max-w-sm text-center text-xs">
                            {search
                                ? 'Try another name, license, or staff member.'
                                : 'Pre-approved identifiers are consumed automatically when the player connects.'}
                        </p>
                    </div>
                ) : (
                    <ResponsiveDataTable className="min-h-0 flex-1">
                        <table className="w-full caption-bottom text-sm">
                            <TableHeader className="sticky top-0 z-10">
                                <TableRow className="border-border/50 bg-card/95 hover:bg-card/95 border-b shadow-sm backdrop-blur-md">
                                    <th className="text-muted-foreground/60 px-3 py-2.5 text-left text-[11px] font-semibold tracking-widest uppercase">
                                        Player
                                    </th>
                                    <th className="text-muted-foreground/60 px-3 py-2.5 text-left text-[11px] font-semibold tracking-widest uppercase">
                                        Identifier
                                    </th>
                                    <th className="text-muted-foreground/60 px-3 py-2.5 text-left text-[11px] font-semibold tracking-widest uppercase">
                                        Approved by
                                    </th>
                                    <th className="text-muted-foreground/60 px-3 py-2.5 text-left text-[11px] font-semibold tracking-widest uppercase">
                                        Date
                                    </th>
                                    {canManage ? (
                                        <th className="text-muted-foreground/60 w-[1%] px-3 py-2.5 text-right text-[11px] font-semibold tracking-widest uppercase">
                                            Actions
                                        </th>
                                    ) : null}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filtered.map((a) => (
                                    <TableRow
                                        key={a.identifier}
                                        className="border-border/40 hover:bg-accent/40 border-b transition-colors"
                                    >
                                        <TableCell className="px-3 py-2.5 align-middle">
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className="border-info/35 bg-info/12 text-info-inline flex size-10 shrink-0 items-center justify-center rounded-full border text-sm font-bold"
                                                    aria-hidden
                                                >
                                                    {displayInitial(a.playerName)}
                                                </div>
                                                <p className="text-foreground font-semibold">{a.playerName}</p>
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-3 py-2.5 align-middle">
                                            <code className="text-muted-foreground bg-muted/50 rounded-md px-1.5 py-0.5 font-mono text-[11px]">
                                                {a.identifier}
                                            </code>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground px-3 py-2.5 align-middle text-sm">
                                            {a.approvedBy}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground px-3 py-2.5 align-middle text-sm whitespace-nowrap">
                                            {tsToLocaleDateTimeString(a.tsApproved, 'short', 'short')}
                                        </TableCell>
                                        {canManage ? (
                                            <TableCell className="px-3 py-2.5 text-right align-middle">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-destructive hover:text-destructive size-8"
                                                    onClick={() => removeApproval(a.identifier)}
                                                    title={t('panel.whitelist.remove')}
                                                >
                                                    <Trash2Icon className="size-3.5" />
                                                </Button>
                                            </TableCell>
                                        ) : null}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </table>
                    </ResponsiveDataTable>
                )}
            </div>
        </div>
    );
}
