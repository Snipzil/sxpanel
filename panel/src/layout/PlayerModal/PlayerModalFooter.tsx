import { useReducer } from 'react';
import { DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PlayerModalRefType, useClosePlayerModal } from '@/hooks/playerModal';
import {
    AlertTriangleIcon,
    MailIcon,
    ShieldCheckIcon,
    HeartIcon,
    CameraIcon,
    MoreHorizontalIcon,
    Trash2Icon,
    EyeIcon,
} from 'lucide-react';
import { KickOneIcon } from '@/components/KickIcons';
import { useBackendApi, ApiTimeout } from '@/hooks/fetch';
import { useAdminPerms } from '@/hooks/auth';
import { useOpenPromptDialog, useOpenConfirmDialog } from '@/hooks/dialogs';
import { GenericApiOkResp } from '@shared/genericApiTypes';
import { PlayerModalPlayerData } from '@shared/playerApiTypes';
import { useLocation, useRoute } from 'wouter';
import { useContentRefresh } from '@/hooks/pages';
import { useCloseAllSheets } from '@/hooks/sheets';
import ScreenshotDialog from './ScreenshotDialog';
import LiveSpectateDialog from './LiveSpectateDialog';
import type { AddonWidgetEntry } from '@/hooks/addons';
import { ErrorBoundary } from 'react-error-boundary';
import { cn } from '@/lib/utils';
import { useLocale } from '@/hooks/locale';
import { translateApiError } from '@/lib/translateApiError';

type PlayerModalFooterProps = {
    playerRef: PlayerModalRefType;
    player?: PlayerModalPlayerData;
    addonActions?: AddonWidgetEntry[];
    /** Dev redesign: wider footer layout for V2 modal shell */
    designVariant?: 'original' | 'redesign';
};

type PlayerModalFooterState = {
    screenshotOpen: boolean;
    screenshotData: string | null;
    screenshotLoading: boolean;
    screenshotError: string | null;
    spectateOpen: boolean;
    spectateSessionId: string | null;
    spectateError: string | null;
};

const reducePlayerModalFooterState = (state: PlayerModalFooterState, action: Partial<PlayerModalFooterState>) => {
    return {
        ...state,
        ...action,
    };
};

type PlayerFooterActionsProps = {
    player?: PlayerModalPlayerData;
    addonActions?: AddonWidgetEntry[];
    hasPerm: ReturnType<typeof useAdminPerms>['hasPerm'];
    onDm: () => void;
    onKick: () => void;
    onWarn: () => void;
    onGiveAdmin: () => void;
    onHeal: () => void;
    onScreenshot: () => void;
    onLiveSpectate: () => void;
    onDeletePlayer: () => void;
};

function PlayerFooterActions({
    player,
    addonActions,
    hasPerm,
    onDm,
    onKick,
    onWarn,
    onGiveAdmin,
    onHeal,
    onScreenshot,
    onLiveSpectate,
    onDeletePlayer,
    designVariant = 'original',
}: PlayerFooterActionsProps & { designVariant?: 'original' | 'redesign' }) {
    const { t } = useLocale();

    return (
        <DialogFooter
            className={cn(
                'grid grid-cols-2 gap-2 p-2 sm:flex md:p-4',
                designVariant === 'redesign'
                    ? 'border-border/60 bg-muted/15 max-w-none gap-2.5 border-0 px-4 py-3 md:px-5'
                    : 'max-w-2xl border-t',
            )}
        >
            <Button
                variant="outline"
                size="sm"
                disabled={!hasPerm('players.direct_message') || !player || !player.isConnected}
                onClick={onDm}
                className="pl-2"
            >
                <MailIcon className="mr-1 h-5" /> {t('panel.player_modal.footer.dm')}
            </Button>
            <Button
                variant="outline"
                size="sm"
                disabled={!hasPerm('players.kick') || !player || !player.isConnected}
                onClick={onKick}
                className="pl-2"
            >
                <KickOneIcon
                    style={{
                        height: '1.25rem',
                        width: '1.75rem',
                        marginRight: '0.25rem',
                        fill: 'currentcolor',
                    }}
                />{' '}
                {t('panel.player_modal.footer.kick')}
            </Button>
            <Button
                variant="outline"
                size="sm"
                disabled={!hasPerm('players.warn') || !player}
                onClick={onWarn}
                className="pl-2"
            >
                <AlertTriangleIcon className="mr-1 h-5" /> {t('panel.player_modal.footer.warn')}
            </Button>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" disabled={!player} className="pl-2">
                        <MoreHorizontalIcon className="mr-1 h-5" /> {t('panel.player_modal.footer.more')}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem disabled={!hasPerm('manage.admins') || !player?.ids.length} onClick={onGiveAdmin}>
                        <ShieldCheckIcon className="mr-2 size-4" /> {t('panel.player_modal.footer.give_admin')}
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={!hasPerm('players.heal') || !player?.isConnected} onClick={onHeal}>
                        <HeartIcon className="mr-2 size-4" /> {t('panel.player_modal.footer.heal')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        disabled={!hasPerm('players.spectate') || !player?.isConnected}
                        onClick={onScreenshot}
                    >
                        <CameraIcon className="mr-2 size-4" /> {t('panel.player_modal.footer.screenshot')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        disabled={!hasPerm('players.spectate') || !player?.isConnected}
                        onClick={onLiveSpectate}
                    >
                        <EyeIcon className="mr-2 size-4" /> {t('panel.player_modal.footer.watch_live')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        disabled={!hasPerm('players.delete') || !player?.isRegistered}
                        onClick={onDeletePlayer}
                        className="text-destructive focus:text-destructive"
                    >
                        <Trash2Icon className="mr-2 size-4" /> {t('panel.player_modal.footer.delete_player')}
                    </DropdownMenuItem>
                    {addonActions && addonActions.length > 0 && (
                        <>
                            <DropdownMenuSeparator />
                            {addonActions.map((w) => (
                                <ErrorBoundary key={`${w.addonId}-${w.title}`} fallback={null}>
                                    <w.Component />
                                </ErrorBoundary>
                            ))}
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </DialogFooter>
    );
}

export default function PlayerModalFooter({
    playerRef,
    player,
    addonActions,
    designVariant = 'original',
}: PlayerModalFooterProps) {
    const { t } = useLocale();
    const { hasPerm } = useAdminPerms();
    const openPromptDialog = useOpenPromptDialog();
    const openConfirmDialog = useOpenConfirmDialog();
    const closeModal = useClosePlayerModal();
    const setLocation = useLocation()[1];
    const [isAlreadyInAdminPage] = useRoute('/admins');
    const refreshContent = useContentRefresh();
    const closeAllSheets = useCloseAllSheets();

    // Screenshot state
    const [state, dispatch] = useReducer(reducePlayerModalFooterState, {
        screenshotOpen: false,
        screenshotData: null,
        screenshotLoading: false,
        screenshotError: null,
        spectateOpen: false,
        spectateSessionId: null,
        spectateError: null,
    });
    const {
        screenshotOpen,
        screenshotData,
        screenshotLoading,
        screenshotError,
        spectateOpen,
        spectateSessionId,
        spectateError,
    } = state;

    const playerMessageApi = useBackendApi<GenericApiOkResp>({
        method: 'POST',
        path: `/player/message`,
    });
    const playerKickApi = useBackendApi<GenericApiOkResp>({
        method: 'POST',
        path: `/player/kick`,
    });
    const playerWarnApi = useBackendApi<GenericApiOkResp>({
        method: 'POST',
        path: `/player/warn`,
    });
    const playerHealApi = useBackendApi<GenericApiOkResp>({
        method: 'POST',
        path: `/player/heal`,
    });
    const playerScreenshotApi = useBackendApi<GenericApiOkResp & { imageData?: string }>({
        method: 'POST',
        path: `/player/screenshot`,
    });
    const playerDeleteApi = useBackendApi<GenericApiOkResp>({
        method: 'POST',
        path: `/player/delete_player`,
    });
    const liveSpectateStartApi = useBackendApi<GenericApiOkResp & { sessionId?: string }>({
        method: 'POST',
        path: `/player/liveSpectate/start`,
    });
    const liveSpectateStopApi = useBackendApi<GenericApiOkResp>({
        method: 'POST',
        path: `/player/liveSpectate/stop`,
    });

    const closeOnSuccess = (data: GenericApiOkResp) => {
        if ('success' in data) {
            closeModal();
            closeAllSheets();
        }
    };

    const handleGiveAdmin = () => {
        if (!player) return;
        const params = new URLSearchParams();
        params.set('autofill', 'true');
        params.set('name', player.pureName);
        for (const id of player.ids) {
            if (id.startsWith('discord:')) {
                params.set('discord', id);
            } else if (id.startsWith('fivem:')) {
                params.set('citizenfx', id);
            }
        }
        setLocation(`/admins?${params.toString()}`);
        if (isAlreadyInAdminPage) {
            refreshContent();
        }
        closeModal();
        closeAllSheets();
    };

    const handleDm = () => {
        if (!player) return;
        openPromptDialog({
            title: t('panel.player_modal.prompts.dm_title', { name: player.displayName }),
            message: t('panel.player_modal.prompts.dm_message'),
            placeholder: t('panel.player_modal.prompts.dm_placeholder'),
            submitLabel: t('panel.common.send'),
            required: true,
            onSubmit: (input) => {
                playerMessageApi({
                    queryParams: playerRef,
                    data: { message: input },
                    genericHandler: { successMsg: t('panel.player_modal.toasts.dm_sent') },
                    toastLoadingMessage: t('panel.player_modal.toasts.dm_sending'),
                    success: closeOnSuccess,
                });
            },
        });
    };

    const handleKick = () => {
        if (!player) return;
        openPromptDialog({
            title: t('panel.player_modal.prompts.kick_title', { name: player.displayName }),
            message: t('panel.player_modal.prompts.kick_message'),
            placeholder: t('panel.player_modal.prompts.kick_placeholder'),
            submitLabel: t('panel.common.send'),
            onSubmit: (input) => {
                playerKickApi({
                    queryParams: playerRef,
                    data: { reason: input },
                    genericHandler: { successMsg: t('panel.player_modal.toasts.player_kicked') },
                    toastLoadingMessage: t('panel.player_modal.toasts.kicking'),
                    success: closeOnSuccess,
                });
            },
        });
    };

    const handleWarn = () => {
        if (!player) return;
        openPromptDialog({
            title: t('panel.player_modal.prompts.warn_title', { name: player.displayName }),
            message: (
                <p>
                    {t('panel.player_modal.prompts.warn_message')} <br />
                    {t('panel.player_modal.prompts.warn_offline_hint')}
                </p>
            ),
            placeholder: t('panel.player_modal.prompts.warn_placeholder'),
            submitLabel: t('panel.common.send'),
            required: true,
            onSubmit: (input) => {
                playerWarnApi({
                    queryParams: playerRef,
                    data: { reason: input },
                    genericHandler: { successMsg: t('panel.player_modal.toasts.warning_sent') },
                    toastLoadingMessage: t('panel.player_modal.toasts.warning_sending'),
                    success: closeOnSuccess,
                });
            },
        });
    };

    const handleHeal = () => {
        if (!player) return;
        playerHealApi({
            queryParams: playerRef,
            data: {},
            genericHandler: { successMsg: t('panel.player_modal.toasts.healed', { name: player.displayName }) },
            toastLoadingMessage: t('panel.player_modal.toasts.healing'),
        });
    };

    const handleScreenshot = () => {
        if (!player) return;
        dispatch({
            screenshotData: null,
            screenshotError: null,
            screenshotLoading: true,
            screenshotOpen: true,
        });
        playerScreenshotApi({
            queryParams: playerRef,
            data: {},
            timeout: ApiTimeout.REALLY_REALLY_LONG,
            success: (data: any) => {
                dispatch({ screenshotLoading: false });
                if (data.imageData) {
                    dispatch({ screenshotData: data.imageData });
                } else if (data.error) {
                    dispatch({ screenshotError: translateApiError(t, data.errorCode, data.error) });
                }
            },
            error: (errorMsg) => {
                dispatch({
                    screenshotLoading: false,
                    screenshotError:
                        typeof errorMsg === 'string' ? errorMsg : t('panel.player_modal.toasts.screenshot_failed'),
                });
            },
        });
    };

    const handleLiveSpectate = () => {
        if (!player) return;
        dispatch({
            spectateError: null,
            spectateSessionId: null,
            spectateOpen: true,
        });
        liveSpectateStartApi({
            queryParams: playerRef,
            data: {},
            timeout: ApiTimeout.LONG,
            success: (data: any) => {
                if (data.sessionId) {
                    dispatch({ spectateSessionId: data.sessionId });
                } else if (data.error) {
                    dispatch({ spectateError: translateApiError(t, data.errorCode, data.error) });
                }
            },
            error: (errorMsg) => {
                dispatch({
                    spectateError:
                        typeof errorMsg === 'string' ? errorMsg : t('panel.player_modal.toasts.spectate_failed'),
                });
            },
        });
    };

    const handleStopSpectate = () => {
        if (spectateSessionId) {
            liveSpectateStopApi({
                data: { sessionId: spectateSessionId },
            });
        }
        dispatch({ spectateSessionId: null, spectateOpen: false });
    };

    const handleDeletePlayer = () => {
        if (!player) return;
        openConfirmDialog({
            title: t('panel.player_modal.prompts.delete_title'),
            message: (
                <p>
                    {t('panel.player_modal.prompts.delete_message', { name: player.displayName })}
                    <br />
                    {t('panel.player_modal.prompts.delete_detail')}
                    <br />
                    <strong>{t('panel.player_modal.prompts.delete_irreversible')}</strong>
                </p>
            ),
            onConfirm: () => {
                playerDeleteApi({
                    queryParams: playerRef,
                    data: {},
                    genericHandler: { successMsg: t('panel.player_modal.toasts.player_deleted') },
                    toastLoadingMessage: t('panel.player_modal.toasts.deleting'),
                    success: (data) => {
                        if ('success' in data) {
                            closeModal();
                            closeAllSheets();
                        }
                    },
                });
            },
        });
    };

    return (
        <>
            <PlayerFooterActions
                player={player}
                addonActions={addonActions}
                hasPerm={hasPerm}
                onDm={handleDm}
                onKick={handleKick}
                onWarn={handleWarn}
                onGiveAdmin={handleGiveAdmin}
                onHeal={handleHeal}
                onScreenshot={handleScreenshot}
                onLiveSpectate={handleLiveSpectate}
                onDeletePlayer={handleDeletePlayer}
                designVariant={designVariant}
            />
            <ScreenshotDialog
                open={screenshotOpen}
                onOpenChange={(open) => dispatch({ screenshotOpen: open })}
                imageData={screenshotData}
                loading={screenshotLoading}
                error={screenshotError}
                playerName={player?.displayName ?? ''}
            />
            <LiveSpectateDialog
                open={spectateOpen}
                onOpenChange={(open) => dispatch({ spectateOpen: open })}
                sessionId={spectateSessionId}
                playerName={player?.displayName ?? ''}
                onStop={handleStopSpectate}
                error={spectateError}
            />
        </>
    );
}
