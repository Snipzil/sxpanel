import React from 'react';
import { AnnouncementOutlined, CenterFocusWeakOutlined, GroupsOutlined, MapOutlined } from '@mui/icons-material';
import { useDialogContext } from '../../../provider/DialogProvider';
import { fetchNui } from '../../../utils/fetchNui';
import { useTranslate } from 'react-polyglot';
import { useSnackbar } from 'notistack';
import { useIsRedmValue } from '@nui/src/state/isRedm.state';
import { useNuiEvent } from '@nui/src/hooks/useNuiEvent';
import { usePlayerModalContext } from '@nui/src/provider/PlayerModalProvider';

export function useMiscActions() {
    const t = useTranslate();
    const { enqueueSnackbar } = useSnackbar();
    const { openDialog } = useDialogContext();
    const isRedm = useIsRedmValue();
    const { closeMenu } = usePlayerModalContext();

    const handleAnnounceMessage = () => {
        openDialog({
            title: t('nui_menu.page_main.announcement.title'),
            description: t('nui_menu.page_main.announcement.dialog_desc'),
            placeholder: t('nui_menu.page_main.announcement.dialog_placeholder'),
            onSubmit: (message: string) => {
                enqueueSnackbar(t('nui_menu.page_main.announcement.dialog_success'), {
                    variant: 'success',
                });
                fetchNui('sendAnnouncement', { message }).catch(() => {});
            },
        });
    };

    const handleClearArea = (autoClose = false) => {
        if (isRedm) {
            return enqueueSnackbar(t('nui_menu.misc.redm_not_available'), { variant: 'error' });
        }
        openDialog({
            title: t('nui_menu.page_main.clear_area.title'),
            description: t('nui_menu.page_main.clear_area.dialog_desc'),
            placeholder: '300',
            suggestions: ['50', '150', '300'],
            onSubmit: (msg) => {
                const parsedRadius = parseInt(msg);

                if (isNaN(parsedRadius) || parsedRadius > 300 || parsedRadius < 0) {
                    return enqueueSnackbar(t('nui_menu.page_main.clear_area.dialog_error'), { variant: 'error' });
                }

                fetchNui('clearArea', parsedRadius).catch(() => {});
                if (autoClose) {
                    closeMenu();
                }
            },
        });
    };
    useNuiEvent('openClearAreaDialog', () => {
        handleClearArea(true);
    });

    const handleTogglePlayerIds = () => {
        fetchNui('togglePlayerIDs').catch(() => {});
    };

    const handleToggleMapBlips = () => {
        fetchNui('toggleMapBlips').catch(() => {});
    };

    return {
        menuItems: [
            {
                title: t('nui_menu.page_main.announcement.title'),
                label: t('nui_menu.page_main.announcement.label'),
                requiredPermission: 'announcement',
                icon: <AnnouncementOutlined />,
                onSelect: handleAnnounceMessage,
            },
            {
                title: t('nui_menu.page_main.clear_area.title'),
                label: t('nui_menu.page_main.clear_area.label'),
                requiredPermission: 'menu.clear_area',
                icon: <CenterFocusWeakOutlined />,
                onSelect: handleClearArea,
            },
            {
                title: t('nui_menu.page_main.toggles.title'),
                isMultiAction: true,
                icon: <GroupsOutlined />,
                actions: [
                    {
                        name: t('nui_menu.page_main.toggles.player_ids'),
                        label: t('nui_menu.page_main.player_ids.label'),
                        value: 'playerIds',
                        icon: <GroupsOutlined />,
                        requiredPermission: 'menu.viewids',
                        onSelect: handleTogglePlayerIds,
                    },
                    {
                        name: t('nui_menu.page_main.toggles.map_blips'),
                        label: t('nui_menu.page_main.map_blips.label'),
                        value: 'mapBlips',
                        icon: <MapOutlined />,
                        requiredPermission: 'menu.mapblips',
                        onSelect: handleToggleMapBlips,
                    },
                ],
            },
        ],
    };
}
