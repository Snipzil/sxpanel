import React, { useCallback, useEffect, useRef } from 'react';
import { styled } from '@mui/material/styles';
import { Box, Button, DialogContent, Tooltip, TooltipProps, Typography } from '@mui/material';
import { useAssociatedPlayerValue, usePlayerDetailsValue } from '../../../state/playerDetails.state';
import { fetchWebPipe } from '../../../utils/fetchWebPipe';
import { fetchNui } from '../../../utils/fetchNui';
import { useDialogContext } from '../../../provider/DialogProvider';
import { useSnackbar } from 'notistack';
import { usePlayerModalContext } from '@nui/src/provider/PlayerModalProvider';
import { userHasPerm } from '@nui/src/utils/miscUtils';
import { useTranslate } from 'react-polyglot';
import { usePermissionsValue } from '../../../state/permissions.state';
import { DialogLoadError } from './DialogLoadError';
import { useServerCtxValue } from '../../../state/server.state';
import { GenericApiErrorResp, GenericApiResp } from '@shared/genericApiTypes';
import { usePendingPlayerActionValue, useSetPendingPlayerAction } from '../../../state/playerModal.state';

const PREFIX = 'DialogActionView';

const classes = {
    actionGrid: `${PREFIX}-actionGrid`,
    tooltipOverride: `${PREFIX}-tooltipOverride`,
    sectionTitle: `${PREFIX}-sectionTitle`,
};

const StyledDialogContent = styled(DialogContent)({
    [`& .${classes.actionGrid}`]: {
        display: 'flex',
        columnGap: 10,
        rowGap: 10,
        paddingBottom: 15,
    },
    [`& .${classes.tooltipOverride}`]: {
        fontSize: 12,
    },
    [`& .${classes.sectionTitle}`]: {
        paddingBottom: 5,
    },
});

export type TxAdminActionRespType = 'success' | 'warning' | 'danger';

export interface TxAdminAPIResp {
    type: TxAdminActionRespType;
    message: string;
}

const DialogActionView: React.FC = () => {
    const { openDialog } = useDialogContext();
    const playerDetails = usePlayerDetailsValue();
    const assocPlayer = useAssociatedPlayerValue();
    const { enqueueSnackbar } = useSnackbar();
    const t = useTranslate();
    const serverCtx = useServerCtxValue();
    const playerPerms = usePermissionsValue();
    const { closeMenu, showNoPerms } = usePlayerModalContext();
    const pendingAction = usePendingPlayerActionValue();
    const setPendingAction = useSetPendingPlayerAction();

    const handleKickRef = useRef<() => void>(() => {});
    const handleWarnRef = useRef<() => void>(() => {});

    // Auto-trigger kick/warn dialog when opened via /kick or /warn command
    useEffect(() => {
        if (!pendingAction) return;
        if ('error' in playerDetails) {
            enqueueSnackbar(`Cannot ${pendingAction}: failed to load player details`, { variant: 'error' });
            setPendingAction(null);
            return;
        }
        if (pendingAction === 'kick') {
            handleKickRef.current();
        } else if (pendingAction === 'warn') {
            handleWarnRef.current();
        }
        setPendingAction(null);
    }, [pendingAction, setPendingAction, playerDetails, enqueueSnackbar]);

    if ('error' in playerDetails) return <DialogLoadError />;

    //Helper
    const handleGenericApiResponse = (result: GenericApiResp, successMessageKey: string) => {
        if ('success' in result && result.success === true) {
            enqueueSnackbar(t(`nui_menu.player_modal.actions.${successMessageKey}`), {
                variant: 'success',
            });
        } else {
            enqueueSnackbar((result as GenericApiErrorResp).error ?? t('nui_menu.misc.unknown_error'), {
                variant: 'error',
            });
        }
    };

    //Moderation
    const handleDM = () => {
        if (!userHasPerm('players.direct_message', playerPerms)) return showNoPerms('Direct Message');

        openDialog({
            title: `${t('nui_menu.player_modal.actions.moderation.dm_dialog.title')} ${assocPlayer.displayName}`,
            description: t('nui_menu.player_modal.actions.moderation.dm_dialog.description'),
            placeholder: t('nui_menu.player_modal.actions.moderation.dm_dialog.placeholder'),
            onSubmit: async (message: string) => {
                try {
                    const result = await fetchWebPipe<GenericApiResp>(
                        `/player/message?mutex=current&netid=${assocPlayer.id}`,
                        {
                            method: 'POST',
                            data: { message: message.trim() },
                        },
                    );
                    handleGenericApiResponse(result, 'moderation.dm_dialog.success');
                } catch (error) {
                    enqueueSnackbar((error as Error).message, { variant: 'error' });
                }
            },
        });
    };

    const handleWarn = useCallback(() => {
        if (!userHasPerm('players.warn', playerPerms)) return showNoPerms('Warn');

        openDialog({
            title: `${t('nui_menu.player_modal.actions.moderation.warn_dialog.title')} ${assocPlayer.displayName}`,
            description: t('nui_menu.player_modal.actions.moderation.warn_dialog.description'),
            placeholder: t('nui_menu.player_modal.actions.moderation.warn_dialog.placeholder'),
            onSubmit: async (reason: string) => {
                try {
                    const result = await fetchWebPipe<GenericApiResp>(
                        `/player/warn?mutex=current&netid=${assocPlayer.id}`,
                        {
                            method: 'POST',
                            data: { reason: reason.trim() },
                        },
                    );
                    handleGenericApiResponse(result, 'moderation.warn_dialog.success');
                } catch (error) {
                    enqueueSnackbar((error as Error).message, { variant: 'error' });
                }
            },
        });
    }, [playerPerms, showNoPerms, openDialog, assocPlayer, t, enqueueSnackbar]);
    handleWarnRef.current = handleWarn;

    const handleKick = useCallback(() => {
        if (!userHasPerm('players.kick', playerPerms)) return showNoPerms('Kick');

        openDialog({
            title: `${t('nui_menu.player_modal.actions.moderation.kick_dialog.title')} ${assocPlayer.displayName}`,
            description: t('nui_menu.player_modal.actions.moderation.kick_dialog.description'),
            placeholder: t('nui_menu.player_modal.actions.moderation.kick_dialog.placeholder'),
            onSubmit: async (reason: string) => {
                try {
                    const result = await fetchWebPipe<GenericApiResp>(
                        `/player/kick?mutex=current&netid=${assocPlayer.id}`,
                        {
                            method: 'POST',
                            data: { reason: reason.trim() },
                        },
                    );
                    handleGenericApiResponse(result, 'moderation.kick_dialog.success');
                } catch (error) {
                    enqueueSnackbar((error as Error).message, { variant: 'error' });
                }
            },
        });
    }, [playerPerms, showNoPerms, openDialog, assocPlayer, t, enqueueSnackbar]);
    handleKickRef.current = handleKick;

    const handleSetAdmin = () => {
        if (!userHasPerm('manage.admins', playerPerms)) {
            return showNoPerms('Manage Admins');
        }
        enqueueSnackbar(t('nui_menu.player_modal.actions.moderation.options.set_admin') + ': use the panel', {
            variant: 'info',
        });
    };

    //Interaction
    const handleHeal = async () => {
        if (!userHasPerm('players.heal', playerPerms)) return showNoPerms('Heal');

        try {
            const result = await fetchWebPipe<GenericApiResp>(`/player/heal?mutex=current&netid=${assocPlayer.id}`, {
                method: 'POST',
                data: {},
            });
            handleGenericApiResponse(result, 'interaction.notifications.heal_player');
        } catch (error) {
            enqueueSnackbar((error as Error).message, { variant: 'error' });
        }
    };

    const handleGoTo = () => {
        if (!userHasPerm('players.teleport', playerPerms)) return showNoPerms('Teleport');

        // Only works with onesync because server needs to know the player's coords
        if (!serverCtx.oneSync.status) {
            return enqueueSnackbar(t('nui_menu.misc.onesync_error'), {
                variant: 'error',
            });
        }

        closeMenu();
        fetchNui('tpToPlayer', { id: assocPlayer.id });
        enqueueSnackbar(t('nui_menu.player_modal.actions.interaction.notifications.tp_player'), { variant: 'success' });
    };

    const handleBring = () => {
        if (!userHasPerm('players.teleport', playerPerms)) return showNoPerms('Teleport');

        // Only works with onesync because server needs to know the player's coords
        if (!serverCtx.oneSync.status) {
            return enqueueSnackbar(t('nui_menu.misc.onesync_error'), {
                variant: 'error',
            });
        }

        closeMenu();
        fetchNui('summonPlayer', { id: assocPlayer.id });
        enqueueSnackbar(t('nui_menu.player_modal.actions.interaction.notifications.bring_player'), {
            variant: 'success',
        });
    };

    const handleSpectate = () => {
        if (!userHasPerm('players.spectate', playerPerms)) return showNoPerms('Spectate');

        closeMenu();
        fetchNui('spectatePlayer', { id: assocPlayer.id });
    };

    const handleFreeze = () => {
        if (!userHasPerm('players.freeze', playerPerms)) return showNoPerms('Freeze');
        fetchNui('togglePlayerFreeze', { id: assocPlayer.id });
    };

    //Troll
    const handleDrunk = () => {
        if (!userHasPerm('players.troll', playerPerms)) return showNoPerms('Troll');
        fetchNui('drunkEffectPlayer', { id: assocPlayer.id });
        enqueueSnackbar(t('nui_menu.player_modal.actions.command_sent'));
    };

    const handleSetOnFire = () => {
        if (!userHasPerm('players.troll', playerPerms)) return showNoPerms('Troll');
        fetchNui('setOnFire', { id: assocPlayer.id });
        enqueueSnackbar(t('nui_menu.player_modal.actions.command_sent'));
    };

    const handleWildAttack = () => {
        if (!userHasPerm('players.troll', playerPerms)) return showNoPerms('Troll');
        fetchNui('wildAttack', { id: assocPlayer.id });
        enqueueSnackbar(t('nui_menu.player_modal.actions.command_sent'));
    };

    const TooltipOverride: React.FC<TooltipProps> = (props) => (
        <Tooltip
            classes={{
                tooltip: classes.tooltipOverride,
            }}
            {...props}
        >
            {props.children}
        </Tooltip>
    );

    return (
        <StyledDialogContent>
            <Box pb={1}>
                <Typography variant="h6">{t('nui_menu.player_modal.actions.title')}</Typography>
            </Box>
            <Typography className={classes.sectionTitle}>
                {t('nui_menu.player_modal.actions.moderation.title')}
            </Typography>
            <Box className={classes.actionGrid}>
                <Button
                    variant="outlined"
                    color="primary"
                    onClick={handleDM}
                    disabled={!userHasPerm('players.direct_message', playerPerms)}
                >
                    {t('nui_menu.player_modal.actions.moderation.options.dm')}
                </Button>
                <Button
                    variant="outlined"
                    color="primary"
                    onClick={handleWarn}
                    disabled={!userHasPerm('players.warn', playerPerms)}
                >
                    {t('nui_menu.player_modal.actions.moderation.options.warn')}
                </Button>
                <Button
                    variant="outlined"
                    color="primary"
                    onClick={handleKick}
                    disabled={!userHasPerm('players.kick', playerPerms)}
                >
                    {t('nui_menu.player_modal.actions.moderation.options.kick')}
                </Button>
                <Button
                    variant="outlined"
                    color="primary"
                    onClick={handleSetAdmin}
                    disabled={!userHasPerm('manage.admins', playerPerms)}
                >
                    {t('nui_menu.player_modal.actions.moderation.options.set_admin')}
                </Button>
            </Box>
            <Typography className={classes.sectionTitle}>
                {t('nui_menu.player_modal.actions.interaction.title')}
            </Typography>
            <Box className={classes.actionGrid}>
                <Button
                    variant="outlined"
                    color="primary"
                    onClick={handleHeal}
                    disabled={!userHasPerm('players.heal', playerPerms)}
                >
                    {t('nui_menu.player_modal.actions.interaction.options.heal')}
                </Button>
                <Button
                    variant="outlined"
                    color="primary"
                    onClick={handleGoTo}
                    disabled={!userHasPerm('players.teleport', playerPerms)}
                >
                    {t('nui_menu.player_modal.actions.interaction.options.go_to')}
                </Button>
                <Button
                    variant="outlined"
                    color="primary"
                    onClick={handleBring}
                    disabled={!userHasPerm('players.teleport', playerPerms)}
                >
                    {t('nui_menu.player_modal.actions.interaction.options.bring')}
                </Button>
                <Button
                    variant="outlined"
                    color="primary"
                    onClick={handleSpectate}
                    disabled={!userHasPerm('players.spectate', playerPerms)}
                >
                    {t('nui_menu.player_modal.actions.interaction.options.spectate')}
                </Button>
                <Button
                    variant="outlined"
                    color="primary"
                    onClick={handleFreeze}
                    disabled={!userHasPerm('players.freeze', playerPerms)}
                >
                    {t('nui_menu.player_modal.actions.interaction.options.toggle_freeze')}
                </Button>
            </Box>
            <Typography className={classes.sectionTitle}>{t('nui_menu.player_modal.actions.troll.title')}</Typography>
            <Box className={classes.actionGrid}>
                <Button
                    variant="outlined"
                    color="primary"
                    onClick={handleDrunk}
                    disabled={!userHasPerm('players.troll', playerPerms)}
                >
                    {t('nui_menu.player_modal.actions.troll.options.drunk')}
                </Button>
                <Button
                    variant="outlined"
                    color="primary"
                    onClick={handleSetOnFire}
                    disabled={!userHasPerm('players.troll', playerPerms)}
                >
                    {t('nui_menu.player_modal.actions.troll.options.fire')}
                </Button>
                <Button
                    variant="outlined"
                    color="primary"
                    onClick={handleWildAttack}
                    disabled={!userHasPerm('players.troll', playerPerms)}
                >
                    {t('nui_menu.player_modal.actions.troll.options.wild_attack')}
                </Button>
            </Box>
        </StyledDialogContent>
    );
};

export default DialogActionView;
