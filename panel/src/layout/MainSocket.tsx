import { useEffect, useRef } from 'react';
import { destroySocket, getSocket } from '@/lib/socketClient';
import { useExpireAuthData, useSetAuthData } from '@/hooks/auth';
import { useOpenAccountModal } from '@/hooks/dialogs';
import { useSetGlobalStatus } from '@/hooks/status';
import { useProcessUpdateAvailableEvent, useSetOfflineWarning } from '@/hooks/useWarningBar';
import { useProcessPlayerlistEvents } from '@/hooks/playerlist';
import { useSetBanTemplates } from '@/hooks/banTemplates';
import { useAuthedFetcher } from '@/hooks/fetch';
import { LogoutReasonHash } from '@/lib/logoutReasonHash';
import type { GlobalStatusType } from '@shared/socketioTypes';
import { isDevMockStatusOptInEnabled, DEV_MOCK_STATUS_STORAGE_KEY } from '@/lib/devFlags';

/**
 * Responsible for starting and handling the main socket.io connection
 * This has been separated from the MainShell.tsx to avoid possible re-renders
 */
export default function MainSocket() {
    const expireSession = useExpireAuthData();
    const setAuthData = useSetAuthData();
    const openAccountModal = useOpenAccountModal();
    const socketStateChangeCounter = useRef(0);
    const setIsSocketOffline = useSetOfflineWarning();
    const setGlobalStatus = useSetGlobalStatus();
    const processPlayerlistEvents = useProcessPlayerlistEvents();
    const processUpdateAvailableEvent = useProcessUpdateAvailableEvent();
    const setBanTemplates = useSetBanTemplates();
    const authedFetcher = useAuthedFetcher();
    const setSocketOfflineState = (isOffline: boolean) => {
        setIsSocketOffline(isOffline);
    };
    const applyGlobalStatus = (status: GlobalStatusType | null) => {
        setGlobalStatus(status);
    };
    const applyPlayerlistEvents = (playerlistData: any) => {
        processPlayerlistEvents(playerlistData);
    };
    const applyBanTemplates = (banTemplates: any) => {
        setBanTemplates(banTemplates);
    };
    const applyAuthData = (authData: any) => {
        setAuthData(authData);
    };
    const applyUpdateAvailable = (data: any) => {
        processUpdateAvailableEvent(data);
    };

    //Runing on mount only
    // Mount-only socket setup: handlers/setters are stable singletons (Jotai
    // setters, refs, module-level helpers) and the socket itself is a singleton.
    // Re-running this effect would tear down and re-register all listeners.

    // react-doctor-disable-next-line react-doctor/no-cascading-set-state
    useEffect(() => {
        //SocketIO - singleton, rooms passed via query on first connect
        const socket = getSocket();
        const isDevMockMode = import.meta.env.DEV && isDevMockStatusOptInEnabled();
        let latestLiveStatus: GlobalStatusType | null = null;
        let devMockInterval: ReturnType<typeof setInterval> | undefined;
        let devMockCancelled = false;

        if (isDevMockMode) {
            // Visible signal so developers know createMockGlobalStatus and
            // processPlayerlistEvents output is being injected instead of real
            // socket events.
            console.warn(
                '%c[DEV MOCK MODE ACTIVE]%c Using createMockGlobalStatus / createMockPlayerlistEvents instead of live socket data.',
                'background:#b91c1c;color:#fff;font-weight:bold;padding:2px 6px;border-radius:3px;',
                'color:inherit;',
            );
        } else if (import.meta.env.DEV) {
            console.info(
                `[DEV MOCK MODE OFF] Using live socket status. To enable mock status, set ?devMockStatus=1 or localStorage["${DEV_MOCK_STATUS_STORAGE_KEY}"] = "1".`,
            );
        }

        const startDevMockLoop = async () => {
            const { createMockGlobalStatus, createMockPlayerlistEvents } =
                await import('@/pages/Dashboard/devMockData');
            if (devMockCancelled) return;

            const pushDevMockState = () => {
                const now = Date.now();
                applyGlobalStatus(createMockGlobalStatus(now, latestLiveStatus));
                if (window.txConsts.isWebInterface) {
                    applyPlayerlistEvents(createMockPlayerlistEvents(now));
                }
            };

            pushDevMockState();
            devMockInterval = setInterval(pushDevMockState, 4_000);
        };
        const connectHandler = () => {
            console.log('Main Socket.IO Connected.');
            setSocketOfflineState(false);
            authedFetcher('/settings/banTemplates')
                .then((data) => applyBanTemplates(data))
                .catch(() => {});
        };
        const disconnectHandler = (message: string) => {
            console.log('Main Socket.IO Disconnected:', message);
            //Grace period of 500ms to allow for quick reconnects
            //Tracking the state change ID for the timeout not to overwrite a reconnection
            const newId = socketStateChangeCounter.current + 1;
            socketStateChangeCounter.current = newId;
            setTimeout(() => {
                if (socketStateChangeCounter.current === newId) {
                    setSocketOfflineState(true);
                }
            }, 500);
        };
        const errorHandler = (reason?: string) => {
            console.log('Main Socket.IO', reason ?? 'unknown');
        };
        const logoutHandler = (reason?: string) => {
            if (reason === 'temp_password_change_required') {
                openAccountModal('password');
                return;
            }
            if (reason === 'two_factor_required') {
                openAccountModal('security');
                return;
            }
            expireSession('main socketio', reason);
        };
        const refreshHandler = () => {
            expireSession('main socketio', 'got refreshToUpdate', LogoutReasonHash.UPDATED);
        };
        const shutdownHandler = () => {
            expireSession('main socketio', 'got txAdminShuttingDown', LogoutReasonHash.SHUTDOWN);
        };
        const statusHandler = (status: any) => {
            if (isDevMockMode) {
                latestLiveStatus = status;
                return;
            }
            applyGlobalStatus(status);
        };
        const playerlistHandler = (playerlistData: any) => {
            if (!window.txConsts.isWebInterface) return;
            if (isDevMockMode) return;
            applyPlayerlistEvents(playerlistData);
        };
        const updateHandler = (data: any) => {
            applyUpdateAvailable(data);
        };
        const authDataHandler = (authData: any) => {
            console.warn('Got updateAuthData from websocket', authData);
            applyAuthData(authData);
        };
        const banTemplatesHandler = (data: any) => {
            applyBanTemplates(data);
        };

        socket.on('connect', connectHandler);
        socket.on('disconnect', disconnectHandler);
        socket.on('error', errorHandler);
        socket.on('logout', logoutHandler);
        socket.on('refreshToUpdate', refreshHandler);
        socket.on('txAdminShuttingDown', shutdownHandler);
        socket.on('fxpAdminShuttingDown', shutdownHandler);
        socket.on('status', statusHandler);
        socket.on('playerlist', playerlistHandler);
        socket.on('updateAvailable', updateHandler);
        socket.on('updateAuthData', authDataHandler);
        socket.on('banTemplatesUpdate', banTemplatesHandler);

        if (isDevMockMode) {
            void startDevMockLoop();
        }

        return () => {
            devMockCancelled = true;
            socket.off('connect', connectHandler);
            socket.off('disconnect', disconnectHandler);
            socket.off('error', errorHandler);
            socket.off('logout', logoutHandler);
            socket.off('refreshToUpdate', refreshHandler);
            socket.off('txAdminShuttingDown', shutdownHandler);
            socket.off('fxpAdminShuttingDown', shutdownHandler);
            socket.off('status', statusHandler);
            socket.off('playerlist', playerlistHandler);
            socket.off('updateAvailable', updateHandler);
            socket.off('updateAuthData', authDataHandler);
            socket.off('banTemplatesUpdate', banTemplatesHandler);
            if (devMockInterval) clearInterval(devMockInterval);
            applyGlobalStatus(null);
            destroySocket();
        };
    }, []);

    return null;
}
