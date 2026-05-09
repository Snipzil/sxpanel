import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { setPlayerModalUrlParam, usePlayerModalStateValue } from '@/hooks/playerModal';
import { InfoIcon, ListIcon, HistoryIcon, GavelIcon, SearchIcon, ActivityIcon, BlocksIcon } from 'lucide-react';
import PlayerInfoTab from './PlayerInfoTab';
import PlayerInsightsTab from './PlayerInsightsTab';
import { useEffect, useMemo, useState } from 'react';
import PlayerIdsTab from './PlayerIdsTab';
import { ScrollArea } from '@/components/ui/scroll-area';
import PlayerHistoryTab from './PlayerHistoryTab';
import PlayerBanTab from './PlayerBanTab';
import PlayerActivityTab from './PlayerActivityTab';
import GenericSpinner from '@/components/GenericSpinner';
import { cn } from '@/lib/utils';
import { useBackendApi } from '@/hooks/fetch';
import { PlayerModalResp, PlayerModalSuccess } from '@shared/playerApiTypes';
import PlayerModalFooter from './PlayerModalFooter';
import ModalCentralMessage from '@/components/ModalCentralMessage';
import { useAddonWidgets } from '@/hooks/addons';
import { ErrorBoundary } from 'react-error-boundary';

const modalTabs = [
    {
        title: 'Info',
        icon: <InfoIcon className="xs:block mr-2 hidden h-5 w-5" />,
    },
    {
        title: 'Insights',
        icon: <SearchIcon className="xs:block mr-2 hidden h-5 w-5" />,
    },
    {
        title: 'Activity',
        icon: <ActivityIcon className="xs:block mr-2 hidden h-5 w-5" />,
    },
    {
        title: 'History',
        icon: <HistoryIcon className="xs:block mr-2 hidden h-5 w-5" />,
    },
    {
        title: 'IDs',
        icon: <ListIcon className="xs:block mr-2 hidden h-5 w-5" />,
    },
    {
        title: 'Ban',
        icon: <GavelIcon className="xs:block mr-2 hidden h-5 w-5" />,
        className: 'hover:bg-destructive hover:text-destructive-foreground',
    },
];

export default function PlayerModal() {
    const { isModalOpen, closeModal, playerRef } = usePlayerModalStateValue();
    const [selectedTab, setSelectedTab] = useState(modalTabs[0].title);
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

    //Helper for tabs to be able to refresh the modal data
    const refreshModalData = () => {
        setCurrRefreshKey((prev) => prev + 1);
    };

    //Querying player data when reference is available
    // eslint-disable-next-line react-hooks/exhaustive-deps -- playerQueryApi identity changes each render; effect is intentionally keyed only on playerRef and currRefreshKey
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
                    //Update the ref param to use a license, if possible
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

    //Resetting selected tab when modal is closed
    useEffect(() => {
        if (!isModalOpen) {
            const timer = setTimeout(() => {
                setSelectedTab(modalTabs[0].title);
            }, 200);
            return () => clearTimeout(timer);
        }
    }, [isModalOpen]);

    const combinedTabs = useMemo(
        () => [
            ...modalTabs.map((t) => ({
                value: t.title,
                id: `player-modal-tab-${t.title.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
            })),
            ...addonTabs.map((w, i) => {
                const sanitized = `${w.addonId}-${w.title}`.replace(/[^a-zA-Z0-9_-]/g, '-');
                return {
                    value: `addon:${w.addonId}:${w.title}:${i}`,
                    id: `player-modal-tab-addon-${sanitized}-${i}`,
                };
            }),
        ],
        [addonTabs],
    );

    const handleOpenClose = (newOpenState: boolean) => {
        if (isModalOpen && !newOpenState) {
            closeModal();
        }
    };

    //Move to tab up or down
    const handleTabButtonKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const currentIndex = combinedTabs.findIndex((t) => t.value === selectedTab);
            const nextIndex = e.key === 'ArrowUp' ? currentIndex - 1 : currentIndex + 1;
            const next = combinedTabs[nextIndex];
            if (next) {
                setSelectedTab(next.value);
                const nextButton = document.getElementById(next.id);
                if (nextButton) {
                    nextButton.focus();
                }
            }
        }
    };

    let pageTitle: JSX.Element;
    if (modalData) {
        if (modalData.player.netid) {
            pageTitle = (
                <>
                    <span className="text-success-inline mr-2 font-mono">[{modalData.player.netid}]</span>
                    {modalData.player.displayName}
                </>
            );
        } else {
            pageTitle = (
                <>
                    <span className="text-destructive-inline mr-2 font-mono">[OFF]</span>
                    {modalData.player.displayName}
                </>
            );
        }
    } else if (modalError) {
        pageTitle = <span className="text-destructive-inline">Error!</span>;
    } else {
        pageTitle = <span className="text-muted-foreground italic">Loading...</span>;
    }

    if (!playerRef) {
        return (
            <Dialog open={isModalOpen} onOpenChange={handleOpenClose}>
                <DialogContent className="flex h-full max-h-full max-w-2xl flex-col gap-1 p-0 sm:h-auto sm:gap-4">
                    <DialogHeader className="border-b px-4 py-3">
                        <DialogTitle className="sr-only">Player Modal</DialogTitle>
                        <DialogDescription className="sr-only">Player details and actions</DialogDescription>
                    </DialogHeader>
                    <ModalCentralMessage>
                        <GenericSpinner msg="Loading..." />
                    </ModalCentralMessage>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Dialog open={isModalOpen} onOpenChange={handleOpenClose}>
            <DialogContent
                className="flex h-full max-h-full max-w-2xl flex-col gap-1 p-0 sm:h-auto sm:gap-4"
                // onOpenAutoFocus={(e) => e.preventDefault()}
            >
                <DialogHeader className="border-b px-4 py-3">
                    <DialogTitle className="mr-6 line-clamp-1 leading-7 tracking-wide break-all">
                        {pageTitle}
                    </DialogTitle>
                    <DialogDescription className="sr-only">Player details and actions</DialogDescription>
                </DialogHeader>

                <div className="flex h-full flex-col md:flex-row md:px-4">
                    <div className="bg-muted mx-2 flex flex-row gap-1 rounded-md p-1 md:mx-0 md:flex-col md:bg-transparent md:p-0">
                        {modalTabs.map((tab) => {
                            const tabEntry = combinedTabs.find((t) => t.value === tab.title);
                            if (!tabEntry) {
                                console.warn(
                                    '[PlayerModal] No combinedTabs entry for tab:',
                                    tab.title,
                                    'available:',
                                    combinedTabs.map((t) => t.value),
                                );
                                return null;
                            }
                            return (
                                <Button
                                    id={tabEntry.id}
                                    key={tab.title}
                                    variant={selectedTab === tab.title ? 'secondary' : 'ghost'}
                                    className={cn(
                                        'w-full justify-center tracking-wider md:justify-start',
                                        'h-7 rounded-sm px-2 text-sm',
                                        'md:h-10 md:text-base',
                                        tab.className,
                                    )}
                                    onClick={() => setSelectedTab(tab.title)}
                                    onKeyDown={handleTabButtonKeyDown}
                                >
                                    {tab.icon} {tab.title}
                                </Button>
                            );
                        })}
                        {addonTabs.length > 0 && (
                            <>
                                <hr className="border-border my-1 hidden md:block" />
                                {addonTabs.map((w, i) => {
                                    const tabEntry = combinedTabs.find(
                                        (t) => t.value === `addon:${w.addonId}:${w.title}:${i}`,
                                    );
                                    if (!tabEntry) {
                                        console.warn(
                                            '[PlayerModal] No combinedTabs entry for addon tab:',
                                            `addon:${w.addonId}:${w.title}:${i}`,
                                            'available:',
                                            combinedTabs.map((t) => t.value),
                                        );
                                        return null;
                                    }
                                    return (
                                        <Button
                                            key={tabEntry.id}
                                            id={tabEntry.id}
                                            variant={selectedTab === tabEntry.value ? 'secondary' : 'ghost'}
                                            className={cn(
                                                'w-full justify-center tracking-wider md:justify-start',
                                                'h-7 rounded-sm px-2 text-sm',
                                                'md:h-10 md:text-base',
                                            )}
                                            onClick={() => setSelectedTab(tabEntry.value)}
                                            onKeyDown={handleTabButtonKeyDown}
                                        >
                                            <BlocksIcon className="xs:block mr-2 hidden h-5 w-5" /> {w.title}
                                        </Button>
                                    );
                                })}
                            </>
                        )}
                    </div>
                    {/* NOTE: consistent height: sm:h-66 */}
                    <ScrollArea className="max-h-[calc(100dvh-3.125rem-4rem-5rem)] min-h-66 w-full px-4 py-2 md:max-h-[50vh] md:py-0">
                        {!modalData ? (
                            <ModalCentralMessage>
                                {modalError ? (
                                    <span className="text-destructive-inline">Error: {modalError}</span>
                                ) : (
                                    <GenericSpinner msg="Loading..." />
                                )}
                            </ModalCentralMessage>
                        ) : (
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
                                                    <div className="text-destructive p-4 text-sm">
                                                        Addon tab error: {match.title}
                                                    </div>
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
                        )}
                    </ScrollArea>
                </div>
                <PlayerModalFooter playerRef={playerRef} player={modalData?.player} addonActions={addonActions} />
            </DialogContent>
        </Dialog>
    );
}
