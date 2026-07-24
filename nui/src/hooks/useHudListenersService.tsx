import React from 'react';
import { SnackbarKey, useSnackbar } from 'notistack';
import { useNuiEvent } from './useNuiEvent';
import { Box, Typography } from '@mui/material';
import { useTranslate } from 'react-polyglot';
import { shouldHelpAlertShow } from '../utils/shouldHelpAlertShow';
import { debugData } from '../utils/debugData';
import { getNotiDuration } from '../utils/getNotiDuration';
import { usePlayersState, useSetPlayerFilter, useSetPlayersFilterIsTemp } from '../state/players.state';
import { useSetAssociatedPlayer } from '../state/playerDetails.state';
import { txAdminMenuPage, useSetPage } from '../state/page.state';
import { useAnnounceNotiPosValue } from '../state/server.state';
import { useSetPlayerModalVisibility } from '@nui/src/state/playerModal.state';
import { PlayerModalTabs, useSetPlayerModalTab, useSetPendingPlayerAction } from '@nui/src/state/playerModal.state';
import cleanPlayerName from '@shared/cleanPlayerName';
import { usePlayerModalContext } from '../provider/PlayerModalProvider';
import { fetchNui } from '../utils/fetchNui';
import { useAddPlayerModeIndicator, useRemovePlayerModeIndicator } from '../state/playerModeIndicators.state';

type SnackbarAlertSeverities = 'success' | 'error' | 'warning' | 'info';

interface SnackbarAlert {
    level: SnackbarAlertSeverities;
    message: string;
    isTranslationKey?: boolean;
    tOptions?: object;
}

interface SnackbarPersistentAlert extends SnackbarAlert {
    key: string;
}

interface AnnounceMessageProps {
    title: string;
    message: string;
}

export interface AddAnnounceData {
    message: string;
    author: string;
    isDirectMessage: boolean;
}

const AnnounceMessage: React.FC<AnnounceMessageProps> = ({ title, message }) => (
    <Box maxWidth={400} style={{ fontSize: 'large' }}>
        <Typography style={{ fontWeight: 'bold' }}>{title}</Typography>
        {message}
    </Box>
);

const alertMap = new Map<string, SnackbarKey>();

//Player-mode toggles (god mode, noclip, super jump) are long-lived states the
//player may stay in for a whole session — a persistent snackbar camping at
//the bottom of the screen the entire time is more annoying than useful, so
//these keys render as small icon badges (PlayerModeIndicators) instead.
const ICON_INDICATOR_KEYS = new Set(['godModeEnabled', 'noClipEnabled', 'superJumpEnabled']);

debugData(
    [
        {
            action: 'showMenuHelpInfo',
            data: {},
        },
    ],
    5000,
);

const announcementSound = new Audio('sounds/announcement.mp3');
const messageSound = new Audio('sounds/message.mp3');

export const useHudListenersService = () => {
    const { enqueueSnackbar, closeSnackbar } = useSnackbar();
    const t = useTranslate();
    const onlinePlayers = usePlayersState();
    const setAssocPlayer = useSetAssociatedPlayer();
    const setModalOpen = useSetPlayerModalVisibility();
    const setPlayerFilter = useSetPlayerFilter();
    const setPlayersFilterIsTemp = useSetPlayersFilterIsTemp();
    const setPage = useSetPage();
    const notiPos = useAnnounceNotiPosValue();
    const { closeMenu } = usePlayerModalContext();
    const setPlayerModalTab = useSetPlayerModalTab();
    const setPendingPlayerAction = useSetPendingPlayerAction();
    const addPlayerModeIndicator = useAddPlayerModeIndicator();
    const removePlayerModeIndicator = useRemovePlayerModeIndicator();

    const snackFormat = (m: string) => <span style={{ whiteSpace: 'pre-wrap' }}>{m}</span>;

    useNuiEvent<SnackbarAlert>('setSnackbarAlert', ({ level, message, isTranslationKey, tOptions }) => {
        if (isTranslationKey) {
            message = t(message, tOptions);
        }
        enqueueSnackbar(snackFormat(message), { variant: level });
    });

    useNuiEvent('showMenuHelpInfo', () => {
        const showAlert = shouldHelpAlertShow();
        if (showAlert) {
            enqueueSnackbar(snackFormat(t('nui_menu.misc.help_message')), {
                variant: 'info',
                anchorOrigin: {
                    horizontal: 'center',
                    vertical: 'bottom',
                },
                autoHideDuration: 10000,
            });
        }
    });

    useNuiEvent<SnackbarPersistentAlert>(
        'setPersistentAlert',
        ({ level, message, key, isTranslationKey, tOptions }) => {
            if (ICON_INDICATOR_KEYS.has(key)) {
                addPlayerModeIndicator({ key, message, isTranslationKey, tOptions });
                return;
            }

            if (alertMap.has(key)) return;
            const snackbarItem = enqueueSnackbar(isTranslationKey ? t(message, tOptions) : message, {
                variant: level,
                persist: true,
                anchorOrigin: {
                    horizontal: 'center',
                    vertical: 'bottom',
                },
            });
            alertMap.set(key, snackbarItem);
        },
    );

    useNuiEvent('clearPersistentAlert', ({ key }) => {
        if (ICON_INDICATOR_KEYS.has(key)) {
            removePlayerModeIndicator(key);
            return;
        }

        const snackbarItem = alertMap.get(key);
        if (!snackbarItem) return;
        closeSnackbar(snackbarItem);
        alertMap.delete(key);
    });

    // Handler for dynamically opening the player page & player modal with target
    useNuiEvent<string>('openPlayerModal', (target) => {
        let targetPlayer;

        //Search by ID
        const targetId = parseInt(target);
        if (!isNaN(targetId)) {
            targetPlayer = onlinePlayers.find((playerData) => playerData.id === targetId);
        }

        //Search by pure name
        if (!targetPlayer && typeof target === 'string') {
            const searchInput = cleanPlayerName(target).pureName;
            const foundPlayers = onlinePlayers.filter((playerData) => playerData.pureName?.includes(searchInput));

            if (foundPlayers.length === 1) {
                targetPlayer = foundPlayers[0];
            } else if (foundPlayers.length > 1) {
                setPlayerFilter(target);
                setPage(txAdminMenuPage.Players);
                setPlayersFilterIsTemp(true);
                return;
            }
        }

        if (targetPlayer) {
            setPage(txAdminMenuPage.PlayerModalOnly);
            setAssocPlayer(targetPlayer);
            setModalOpen(true);
        } else {
            closeMenu();
            setModalOpen(false);
            enqueueSnackbar(t('nui_menu.player_modal.misc.target_not_found', { target }), { variant: 'error' });
        }
    });

    // Handler for opening the player modal with a specific action (ban/kick/warn)
    useNuiEvent<{ target: string; action: string }>('openPlayerModalAction', ({ target, action }) => {
        let targetPlayer;

        const targetId = parseInt(target);
        if (!isNaN(targetId)) {
            targetPlayer = onlinePlayers.find((playerData) => playerData.id === targetId);
        }

        if (!targetPlayer && typeof target === 'string') {
            const searchInput = cleanPlayerName(target).pureName;
            const foundPlayers = onlinePlayers.filter((playerData) => playerData.pureName?.includes(searchInput));
            if (foundPlayers.length === 1) {
                targetPlayer = foundPlayers[0];
            }
        }

        if (targetPlayer) {
            setPage(txAdminMenuPage.PlayerModalOnly);
            setAssocPlayer(targetPlayer);
            setModalOpen(true);
            if (action === 'ban') {
                setPlayerModalTab(PlayerModalTabs.BAN);
                setPendingPlayerAction(null);
            } else if (action === 'kick' || action === 'warn') {
                setPlayerModalTab(PlayerModalTabs.ACTIONS);
                setPendingPlayerAction(action);
            }
        } else {
            closeMenu();
            setModalOpen(false);
            enqueueSnackbar(t('nui_menu.player_modal.misc.target_not_found', { target }), { variant: 'error' });
        }
    });

    useNuiEvent<AddAnnounceData>('addAnnounceMessage', ({ message, author }) => {
        announcementSound.play();
        enqueueSnackbar(
            <AnnounceMessage message={message} title={t('nui_menu.misc.announcement_title', { author })} />,
            {
                variant: 'warning',
                autoHideDuration: getNotiDuration(message) * 1000,
                anchorOrigin: {
                    horizontal: notiPos.horizontal,
                    vertical: notiPos.vertical,
                },
            },
        );
    });

    useNuiEvent<AddAnnounceData>('addDirectMessage', ({ message, author }) => {
        messageSound.play();
        enqueueSnackbar(
            <AnnounceMessage message={message} title={t('nui_menu.misc.directmessage_title', { author })} />,
            {
                variant: 'info',
                autoHideDuration: getNotiDuration(message) * 1000 * 2, //*2 to slow things down
                anchorOrigin: {
                    horizontal: notiPos.horizontal,
                    vertical: notiPos.vertical,
                },
            },
        );
    });
};
