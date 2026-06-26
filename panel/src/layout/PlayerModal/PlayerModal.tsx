import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIcon,
    BlocksIcon,
    GavelIcon,
    HistoryIcon,
    InfoIcon,
    ListIcon,
    SearchIcon,
    UserIcon,
} from 'lucide-react';
import { setPlayerModalUrlParam, usePlayerModalStateValue } from '@/hooks/playerModal';
import PlayerInfoTab from '@/layout/PlayerModal/PlayerInfoTab';
import PlayerInsightsTab from '@/layout/PlayerModal/PlayerInsightsTab';
import PlayerIdsTab from '@/layout/PlayerModal/PlayerIdsTab';
import PlayerHistoryTab from '@/layout/PlayerModal/PlayerHistoryTab';
import PlayerBanTab from '@/layout/PlayerModal/PlayerBanTab';
import PlayerActivityTab from '@/layout/PlayerModal/PlayerActivityTab';
import PlayerModalFooter from '@/layout/PlayerModal/PlayerModalFooter';
import GenericSpinner from '@/components/GenericSpinner';
import ModalCentralMessage from '@/components/ModalCentralMessage';
import { useBackendApi } from '@/hooks/fetch';
import type { PlayerModalResp, PlayerModalSuccess } from '@shared/playerApiTypes';
import { useAddonWidgets } from '@/hooks/addons';
import { ErrorBoundary } from 'react-error-boundary';
import { cn } from '@/lib/utils';
import { ModalShell, type ModalShellTab } from '@/components/modals/ModalShell';

const CORE_TABS: ModalShellTab[] = [
    { id: 'player-modal-tab-info', value: 'Info', label: 'Info', shortLabel: 'Info', icon: InfoIcon },
    { id: 'player-modal-tab-insights', value: 'Insights', label: 'Insights', shortLabel: 'Insights', icon: SearchIcon },
    {
        id: 'player-modal-tab-activity',
        value: 'Activity',
        label: 'Activity',
        shortLabel: 'Activity',
        icon: ActivityIcon,
    },
    { id: 'player-modal-tab-history', value: 'History', label: 'History', shortLabel: 'History', icon: HistoryIcon },
    { id: 'player-modal-tab-ids', value: 'IDs', label: 'IDs', shortLabel: 'IDs', icon: ListIcon },
    {
        id: 'player-modal-tab-ban',
        value: 'Ban',
        label: 'Ban',
        shortLabel: 'Ban',
        icon: GavelIcon,
        danger: true,
    },
];

function countActiveActions(player: PlayerModalSuccess['player'], type: 'ban' | 'warn') {
    return player.actionHistory.filter((a) => a.type === type && !a.revokedAt).length;
}

export default function PlayerModal() {
    const { isModalOpen, closeModal, playerRef } = usePlayerModalStateValue();
    const [selectedTab, setSelectedTab] = useState(CORE_TABS[0].value);
    const [currRefreshKey, setCurrRefreshKey] = useState(0);
    const [modalData, setModalData] = useState<PlayerModalSuccess | undefined>(undefined);
    const [modalError, setModalError] = useState('');
    const [tsFetch, setTsFetch] = useState(0);
    const addonTabs = useAddonWidgets('player-modal.tabs');
    const addonActions = useAddonWidgets('player-modal.actions');
    const playerQueryApi = useBackendApi<PlayerModalResp>({
        method: 'GET',
        path: `/player`,
        abortOnUnmount: true,
    });

    const refreshModalData = () => {
        setCurrRefreshKey((prev) => prev + 1);
    };

    useEffect(() => {
        if (!playerRef) return;
        setModalData(undefined);
        setModalError('');
        playerQueryApi({
            queryParams: playerRef,
            success: (resp) => {
                if ('error' in resp) {
                    setModalError(resp.error);
                } else {
                    setModalData(resp);
                    setTsFetch(Math.round(Date.now() / 1000));
                    if (!('license' in playerRef) && resp.player.license) {
                        setPlayerModalUrlParam(resp.player.license);
                    }
                }
            },
            error: (error) => {
                setModalError(error);
            },
        });
    }, [playerRef, currRefreshKey]);

    useEffect(() => {
        if (!isModalOpen) {
            const timer = setTimeout(() => setSelectedTab(CORE_TABS[0].value), 200);
            return () => clearTimeout(timer);
        }
    }, [isModalOpen]);

    const combinedTabs = useMemo((): ModalShellTab[] => {
        const addon: ModalShellTab[] = addonTabs.map((w, i) => {
            const sanitized = `${w.addonId}-${w.title}`.replace(/[^a-zA-Z0-9_-]/g, '-');
            return {
                id: `player-modal-tab-addon-${sanitized}-${i}`,
                value: `addon:${w.addonId}:${w.title}:${i}`,
                label: w.title,
                shortLabel: w.title,
                icon: BlocksIcon,
            };
        });
        return [...CORE_TABS, ...addon];
    }, [addonTabs]);

    const handleOpenClose = (newOpenState: boolean) => {
        if (isModalOpen && !newOpenState) {
            closeModal();
        }
    };

    const player = modalData?.player;
    const banCount = player ? countActiveActions(player, 'ban') : 0;
    const warnCount = player ? countActiveActions(player, 'warn') : 0;

    const header = (
        <div className="flex min-w-0 items-start gap-3">
            <div className="bg-muted flex size-11 shrink-0 items-center justify-center rounded-xl">
                <UserIcon className="text-foreground size-5" />
            </div>
            <div className="min-w-0 flex-1">
                {!modalData && !modalError ? (
                    <p className="text-muted-foreground text-sm italic">Loading player…</p>
                ) : modalError ? (
                    <p className="text-destructive-inline text-sm font-semibold">Error: {modalError}</p>
                ) : player ? (
                    <>
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <h2 className="text-foreground truncate text-lg font-semibold tracking-tight">
                                {player.displayName}
                            </h2>
                            {player.netid ? (
                                <span className="border-success/35 bg-success/12 text-success-inline inline-flex shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide">
                                    #{player.netid}
                                </span>
                            ) : (
                                <span className="border-border bg-muted/50 text-muted-foreground inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-widest uppercase">
                                    Offline
                                </span>
                            )}
                            {banCount > 0 ? (
                                <span className="border-destructive/35 bg-destructive/12 text-destructive-inline inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide">
                                    {banCount} ban{banCount === 1 ? '' : 's'}
                                </span>
                            ) : null}
                            {warnCount > 0 ? (
                                <span className="border-warning/35 bg-warning/12 text-warning-inline inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide">
                                    {warnCount} warn{warnCount === 1 ? '' : 's'}
                                </span>
                            ) : null}
                        </div>
                        <p className="text-muted-foreground mt-1 font-mono text-xs break-all">{player.license}</p>
                    </>
                ) : null}
            </div>
        </div>
    );

    let tabBody: React.ReactNode;
    if (!playerRef) {
        tabBody = (
            <ModalCentralMessage>
                <GenericSpinner msg="Loading..." />
            </ModalCentralMessage>
        );
    } else if (!modalData) {
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
                    <PlayerInfoTab
                        playerRef={playerRef}
                        player={modalData.player}
                        serverTime={modalData.serverTime}
                        tsFetch={tsFetch}
                        setSelectedTab={setSelectedTab}
                        refreshModalData={refreshModalData}
                        tagDefinitions={modalData.tagDefinitions}
                    />
                )}
                {selectedTab === 'Insights' && (
                    <PlayerInsightsTab player={modalData.player} serverTime={modalData.serverTime} />
                )}
                {selectedTab === 'Activity' && (
                    <PlayerActivityTab player={modalData.player} serverTime={modalData.serverTime} />
                )}
                {selectedTab === 'History' && (
                    <PlayerHistoryTab
                        actionHistory={modalData.player.actionHistory}
                        serverTime={modalData.serverTime}
                        refreshModalData={refreshModalData}
                    />
                )}
                {selectedTab === 'IDs' && (
                    <PlayerIdsTab player={modalData.player} refreshModalData={refreshModalData} />
                )}
                {selectedTab === 'Ban' && <PlayerBanTab playerRef={playerRef} />}
                {selectedTab.startsWith('addon:') &&
                    (() => {
                        const matchIndex = addonTabs.findIndex(
                            (w, i) => selectedTab === `addon:${w.addonId}:${w.title}:${i}`,
                        );
                        if (matchIndex === -1) return null;
                        const match = addonTabs[matchIndex];
                        return (
                            <ErrorBoundary
                                key={`${match.addonId}-${match.title}-${matchIndex}`}
                                fallback={
                                    <div className="text-destructive p-4 text-sm">Addon tab error: {match.title}</div>
                                }
                            >
                                <match.Component
                                    license={modalData.player.license}
                                    displayName={modalData.player.displayName}
                                    netid={modalData.player.netid}
                                    playerRef={playerRef}
                                />
                            </ErrorBoundary>
                        );
                    })()}
            </>
        );
    }

    return (
        <ModalShell
            open={isModalOpen}
            onOpenChange={handleOpenClose}
            srTitle={player?.displayName ?? 'Player'}
            srDescription="Player details and actions"
            header={header}
            tabs={combinedTabs}
            selectedTab={selectedTab}
            onSelectTab={setSelectedTab}
            footer={
                playerRef ? (
                    <PlayerModalFooter
                        playerRef={playerRef}
                        player={modalData?.player}
                        addonActions={addonActions}
                        designVariant="redesign"
                    />
                ) : undefined
            }
        >
            <div className={cn(!modalData && playerRef && 'min-h-32')}>{tabBody}</div>
        </ModalShell>
    );
}
