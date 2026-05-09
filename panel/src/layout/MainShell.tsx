import { useEventListener } from 'usehooks-ts';
import MainRouter from './MainRouter';
import { useExpireAuthData } from '../hooks/auth';
import { Header } from './Header';
import { PlayerlistSidebar } from './PlayerlistSidebar/PlayerlistSidebar';
import MainSheets from './MainSheets';
import WarningBar from './WarningBar';
import AddonWarningBar from './AddonWarningBar';
import ConfirmDialog from '@/components/ConfirmDialog';
import PromptDialog from '@/components/PromptDialog';
import TxToaster from '@/components/TxToaster';
import AccountDialog from '@/components/AccountDialog';
import { useOpenAccountModal } from '@/hooks/dialogs';
import PlayerModal from './PlayerModal/PlayerModal';
import { playerModalUrlParam, useOpenPlayerModal } from '@/hooks/playerModal';
import { navigate as setLocation } from 'wouter/use-browser-location';
import MainSocket from './MainSocket';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useToggleTheme } from '@/hooks/theme';
import { hotkeyEventListener } from '@/lib/hotkeyEventListener';
import BreakpointDebugger from '@/components/BreakpointDebugger';
import ActionModal from './ActionModal/ActionModal';
import { useEffect } from 'react';
import { actionModalUrlParam, useOpenActionModal } from '@/hooks/actionModal';
import LeftSidebar from './LeftSidebar';
import { useAtomValue } from 'jotai';
import { pageHeaderAtom } from '@/hooks/pages';
import { useDynamicScale } from '@/hooks/useDynamicScale';
import OnboardingOverlay from './OnboardingOverlay';
import { cn } from '@/lib/utils';
import { useShellViewportStyles } from '@/hooks/useShellViewportStyles';

export default function MainShell() {
    const expireSession = useExpireAuthData();
    const openAccountModal = useOpenAccountModal();
    const openPlayerModal = useOpenPlayerModal();
    const openActionModal = useOpenActionModal();
    const toggleTheme = useToggleTheme();
    const { scaledViewportMode } = useShellViewportStyles();
    const isCompactScaledViewport = scaledViewportMode === 'compact';
    const isExpandedScaledViewport = scaledViewportMode === 'expanded';

    // Expose modal openers so addons can call them directly
    (window as any).txAddonApi = (window as any).txAddonApi || {};
    (window as any).txAddonApi.openPlayerModal = openPlayerModal;

    //Listener for messages from child iframes (legacy routes) or other sources
    useEventListener('message', (e: TxMessageEvent) => {
        if (e.data.type === 'logoutNotice') {
            expireSession('child iframe', 'got logoutNotice');
        } else if (e.data.type === 'openAccountModal') {
            openAccountModal();
        } else if (e.data.type === 'openPlayerModal') {
            openPlayerModal(e.data.ref);
        } else if (e.data.type === 'navigateToPage') {
            setLocation(e.data.href);
        } else if (e.data.type === 'globalHotkey' && e.data.action === 'toggleLightMode') {
            toggleTheme();
        }
    });

    //auto open the player or action modals
    useEffect(() => {
        const pageUrl = new URL(window.location.toString());
        const playerModalRef = pageUrl.searchParams.get(playerModalUrlParam);
        const actionModalRef = pageUrl.searchParams.get(actionModalUrlParam);
        if (!playerModalRef && !actionModalRef) return;

        if (playerModalRef) {
            if (playerModalRef.includes('#')) {
                const [mutex, rawNetid] = playerModalRef.split('#');
                const netid = parseInt(rawNetid, 10);
                if (mutex.length && rawNetid.length && !isNaN(netid)) {
                    openPlayerModal({ mutex, netid });
                }
            } else if (playerModalRef.length) {
                openPlayerModal({ license: playerModalRef });
            }
        } else if (actionModalRef && actionModalRef.length) {
            openActionModal(actionModalRef);
        }

        //Remove the query params
        pageUrl.searchParams.delete(playerModalUrlParam);
        pageUrl.searchParams.delete(actionModalUrlParam);
        window.history.replaceState({}, '', pageUrl);
    }, []);

    useEffect(() => {
        const densityMode = isCompactScaledViewport ? 'compact' : 'default';
        document.documentElement.dataset.txShellDensity = densityMode;

        return () => {
            delete document.documentElement.dataset.txShellDensity;
        };
    }, [isCompactScaledViewport]);

    //Listens to hotkeys (doesn't work if the focus is on an iframe)
    useEventListener('keydown', hotkeyEventListener);

    const pageHeader = useAtomValue(pageHeaderAtom);
    const { containerRef, contentRef } = useDynamicScale<HTMLDivElement, HTMLDivElement>({
        maxScale: 0.94,
        enabled: isCompactScaledViewport,
    });

    return (
        <>
            <TooltipProvider delayDuration={300} disableHoverableContent={true}>
                {/* Full-height sidebar layout */}
                <div className="flex h-screen overflow-hidden">
                    {/* Left nav sidebar (desktop only, hidden on < lg) */}
                    <LeftSidebar />

                    {/* Right content column */}
                    <div className="flex flex-1 flex-col overflow-hidden">
                        {/* Mobile top header (shown on < lg, hidden on desktop where sidebar takes over) */}
                        <Header />

                        {/* Scrollable page area (auto-scaled to fit; scroll is a fallback if we hit the minimum zoom) */}
                        <div ref={containerRef} className="flex flex-1 overflow-auto">
                            <div
                                ref={contentRef}
                                className={cn(
                                    'flex min-h-full w-full flex-col px-3 pt-(--page-pt) pb-(--page-pb) md:px-5 2xl:px-8',
                                    isExpandedScaledViewport ? 'max-w-none' : 'max-w-[160rem]',
                                )}
                            >
                                {pageHeader}
                                <div className="flex w-full flex-1 flex-row gap-4">
                                    <main className="flex min-w-0 flex-1">
                                        <MainRouter />
                                    </main>
                                    {window.txConsts.isWebInterface && <PlayerlistSidebar />}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <MainSheets />
                <WarningBar />
                <AddonWarningBar />
                <ConfirmDialog />
                <PromptDialog />
                <TxToaster />
                <AccountDialog />
                <PlayerModal />
                <ActionModal />
                <MainSocket />
                <OnboardingOverlay />
                {/* <BreakpointDebugger /> */}
            </TooltipProvider>
        </>
    );
}
