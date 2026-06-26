import { useEffect, useMemo, useState } from 'react';
import { InfoIcon, ListIcon, PencilIcon, Undo2Icon } from 'lucide-react';
import { useActionModalStateValue } from '@/hooks/actionModal';
import GenericSpinner from '@/components/GenericSpinner';
import ModalCentralMessage from '@/components/ModalCentralMessage';
import { useBackendApi } from '@/hooks/fetch';
import type { HistoryActionModalResp, HistoryActionModalSuccess } from '@shared/historyApiTypes';
import ActionIdsTab from '@/layout/ActionModal/ActionIdsTab';
import ActionInfoTab from '@/layout/ActionModal/ActionInfoTab';
import ActionEditTab from '@/layout/ActionModal/ActionEditTab';
import ActionModifyTab from '@/layout/ActionModal/ActionModifyTab';
import type { DatabaseActionType } from '../../../../core/modules/Database/databaseTypes';
import { cn } from '@/lib/utils';
import { getActionTypeMeta } from '@/pages/History/historyRowUtils';
import { ModalShell, type ModalShellTab } from '@/components/modals/ModalShell';

const BASE_TABS: ModalShellTab[] = [
    { id: 'action-modal-tab-info', value: 'Info', label: 'Info', shortLabel: 'Info', icon: InfoIcon },
    { id: 'action-modal-tab-ids', value: 'IDs', label: 'IDs', shortLabel: 'IDs', icon: ListIcon },
];

const EDIT_TAB: ModalShellTab = {
    id: 'action-modal-tab-edit',
    value: 'Edit',
    label: 'Edit',
    shortLabel: 'Edit',
    icon: PencilIcon,
};

const REVOKE_TAB: ModalShellTab = {
    id: 'action-modal-tab-revoke',
    value: 'Revoke',
    label: 'Revoke',
    shortLabel: 'Revoke',
    icon: Undo2Icon,
    danger: true,
};

const getTabsForAction = (action?: DatabaseActionType): ModalShellTab[] => {
    if (!action) return [...BASE_TABS, REVOKE_TAB];
    if (action.type === 'ban') return [...BASE_TABS, EDIT_TAB, REVOKE_TAB];
    return [...BASE_TABS, REVOKE_TAB];
};

export default function ActionModal() {
    const { isModalOpen, closeModal, actionRef } = useActionModalStateValue();
    const [selectedTab, setSelectedTab] = useState('Info');
    const [currRefreshKey, setCurrRefreshKey] = useState(0);
    const [modalData, setModalData] = useState<HistoryActionModalSuccess | undefined>(undefined);
    const [modalError, setModalError] = useState('');
    const [tsFetch, setTsFetch] = useState(0);
    const historyGetActionApi = useBackendApi<HistoryActionModalResp>({
        method: 'GET',
        path: `/history/action`,
        abortOnUnmount: true,
    });

    const refreshModalData = () => {
        setCurrRefreshKey((k) => k + 1);
    };

    useEffect(() => {
        if (!actionRef) return;
        setModalData(undefined);
        setModalError('');
        historyGetActionApi({
            queryParams: { id: actionRef },
            success: (resp) => {
                if ('error' in resp) {
                    setModalError(resp.error);
                } else {
                    setModalData(resp);
                    setTsFetch(Math.round(Date.now() / 1000));
                }
            },
            error: (error) => {
                setModalError(error);
            },
        });
    }, [actionRef, currRefreshKey]);

    useEffect(() => {
        if (!isModalOpen) {
            const timer = setTimeout(() => setSelectedTab('Info'), 200);
            return () => clearTimeout(timer);
        }
    }, [isModalOpen]);

    const modalTabs = useMemo(() => getTabsForAction(modalData?.action), [modalData?.action]);

    useEffect(() => {
        if (!modalTabs.some((t) => t.value === selectedTab)) {
            setSelectedTab(modalTabs[0]?.value ?? 'Info');
        }
    }, [modalTabs, selectedTab]);

    const handleOpenClose = (newOpenState: boolean) => {
        if (isModalOpen && !newOpenState) {
            closeModal();
        }
    };

    const action = modalData?.action;
    const typeMeta = action ? getActionTypeMeta(action.type) : null;
    const TypeIcon = typeMeta?.icon;

    const header = (
        <div className="flex min-w-0 items-start gap-3">
            {typeMeta && TypeIcon ? (
                <div
                    className={cn(
                        'flex size-11 shrink-0 items-center justify-center rounded-xl border',
                        typeMeta.badgeClass,
                    )}
                >
                    <TypeIcon className="size-5" aria-hidden />
                </div>
            ) : (
                <div className="bg-muted flex size-11 shrink-0 items-center justify-center rounded-xl">
                    <InfoIcon className="text-muted-foreground size-5" />
                </div>
            )}
            <div className="min-w-0 flex-1">
                {!modalData && !modalError ? (
                    <p className="text-muted-foreground text-sm italic">Loading action…</p>
                ) : modalError ? (
                    <p className="text-destructive-inline text-sm font-semibold">Error: {modalError}</p>
                ) : action && typeMeta ? (
                    <>
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span
                                className={cn(
                                    'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-widest uppercase',
                                    typeMeta.badgeClass,
                                )}
                            >
                                {typeMeta.label}
                            </span>
                            <code className="text-foreground truncate font-mono text-sm tracking-wide">
                                {action.id}
                            </code>
                            {action.revocation?.timestamp ? (
                                <span className="border-border bg-muted/50 text-muted-foreground inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase">
                                    Revoked
                                </span>
                            ) : null}
                        </div>
                        <p className="text-muted-foreground mt-1 truncate text-sm">
                            {action.playerName !== false ? (
                                <span className="text-foreground font-medium">{action.playerName}</span>
                            ) : (
                                <span className="italic">Unknown player</span>
                            )}
                            <span className="mx-1.5 opacity-40">·</span>
                            <span>{action.author}</span>
                        </p>
                    </>
                ) : null}
            </div>
        </div>
    );

    let tabBody: React.ReactNode;
    if (!modalData) {
        tabBody = (
            <ModalCentralMessage>
                {modalError ? (
                    <span className="text-destructive-inline text-sm">Error: {modalError}</span>
                ) : (
                    <GenericSpinner msg="Loading..." />
                )}
            </ModalCentralMessage>
        );
    } else {
        tabBody = (
            <>
                {selectedTab === 'Info' && (
                    <ActionInfoTab action={modalData.action} serverTime={modalData.serverTime} tsFetch={tsFetch} />
                )}
                {selectedTab === 'IDs' && <ActionIdsTab action={modalData.action} />}
                {selectedTab === 'Edit' && modalData.action.type === 'ban' && (
                    <ActionEditTab action={modalData.action} refreshModalData={refreshModalData} />
                )}
                {selectedTab === 'Revoke' && (
                    <ActionModifyTab action={modalData.action} refreshModalData={refreshModalData} />
                )}
            </>
        );
    }

    return (
        <ModalShell
            open={isModalOpen}
            onOpenChange={handleOpenClose}
            srTitle={action?.id ?? 'Action'}
            srDescription="Action details"
            header={header}
            tabs={modalTabs}
            selectedTab={selectedTab}
            onSelectTab={setSelectedTab}
        >
            <div className={cn(!modalData && 'min-h-32')}>{tabBody}</div>
        </ModalShell>
    );
}
