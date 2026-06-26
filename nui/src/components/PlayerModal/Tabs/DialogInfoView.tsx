import React, { FormEventHandler, useEffect, useMemo, useState } from 'react';
import {
    Box,
    Button,
    Checkbox,
    DialogContent,
    ListItemIcon,
    ListItemText,
    Menu,
    MenuItem,
    TextField,
    Typography,
    useTheme,
} from '@mui/material';
import { useForcePlayerRefresh, usePlayerDetailsValue } from '../../../state/playerDetails.state';
import { fetchWebPipe } from '../../../utils/fetchWebPipe';
import { useSnackbar } from 'notistack';
import { useTranslate } from 'react-polyglot';
import { DialogLoadError } from './DialogLoadError';
import { GenericApiErrorResp, GenericApiResp } from '@shared/genericApiTypes';
import humanizeDuration, { Unit } from 'humanize-duration';
import { ButtonXS } from '../../misc/ButtonXS';
import { tsToLocaleDate, userHasPerm } from '@nui/src/utils/miscUtils';
import { PlayerModalTabs, useSetPlayerModalTab } from '@nui/src/state/playerModal.state';
import { usePermissionsValue } from '@nui/src/state/permissions.state';
import { AUTO_TAG_DEFINITIONS, type TagDefinition } from '@shared/socketioTypes';

const fallbackTagLookup = Object.fromEntries(
    AUTO_TAG_DEFINITIONS.map((definition) => [definition.id, definition]),
) as Record<string, TagDefinition>;

const deriveTagColors = (hex: string) => {
    const sanitized = hex.startsWith('#') ? hex.slice(1) : hex;
    const normalized =
        sanitized.length === 3
            ? sanitized
                  .split('')
                  .map((char) => `${char}${char}`)
                  .join('')
            : sanitized;
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);

    return {
        backgroundColor: `rgba(${r}, ${g}, ${b}, 0.16)`,
        borderColor: `rgba(${r}, ${g}, ${b}, 0.34)`,
        color: hex,
    };
};

const DialogInfoView: React.FC = () => {
    const [note, setNote] = useState('');
    const [tagMenuAnchor, setTagMenuAnchor] = useState<null | HTMLElement>(null);
    const [isTagUpdating, setIsTagUpdating] = useState(false);
    const { enqueueSnackbar } = useSnackbar();
    const playerDetails = usePlayerDetailsValue();
    const forceRefresh = useForcePlayerRefresh();
    const setTab = useSetPlayerModalTab();
    const t = useTranslate();
    const theme = useTheme();
    const userPerms = usePermissionsValue();
    if ('error' in playerDetails) return <DialogLoadError />;
    const player = playerDetails.player;
    const tagLookup = useMemo(() => {
        const lookup = { ...fallbackTagLookup };
        for (const definition of playerDetails.tagDefinitions ?? []) {
            lookup[definition.id] = definition;
        }
        return lookup;
    }, [playerDetails]);
    const playerTags = useMemo(() => {
        return [...(player.tags ?? [])]
            .map((tagId) => tagLookup[tagId] ?? { id: tagId, label: tagId, color: '#9ea4bd', priority: 999 })
            .sort((a, b) => a.priority - b.priority)
            .map((tag) => ({
                ...tag,
                styles: deriveTagColors(tag.color),
            }));
    }, [player.tags, tagLookup]);

    const autoTagIds = useMemo(() => new Set(AUTO_TAG_DEFINITIONS.map((def) => def.id)), []);
    const manualCustomTagDefs = useMemo(() => {
        return (playerDetails.tagDefinitions ?? [])
            .filter((def) => !autoTagIds.has(def.id))
            .filter((def) => !(def.discordRoleIds?.length ?? 0));
    }, [playerDetails, autoTagIds]);

    const canEditTags = userHasPerm('players.write', userPerms) && !!player.license;

    const handleToggleTag = async (tagId: string, currentlyHas: boolean) => {
        if (!canEditTags || isTagUpdating) return;
        setIsTagUpdating(true);
        try {
            const result = await fetchWebPipe<GenericApiResp>(`/player/set_tag?mutex=current&netid=${player.netid}`, {
                method: 'POST',
                data: { tagId, status: !currentlyHas },
            });
            if ('success' in result && result.success === true) {
                forceRefresh((val) => val + 1);
                enqueueSnackbar(t('nui_menu.player_modal.info.tag_updated'), { variant: 'success' });
            } else {
                enqueueSnackbar((result as GenericApiErrorResp).error ?? t('nui_menu.misc.unknown_error'), {
                    variant: 'error',
                });
            }
        } catch {
            enqueueSnackbar(t('nui_menu.misc.unknown_error'), { variant: 'error' });
        } finally {
            setIsTagUpdating(false);
        }
    };

    //Prepare vars
    const language = t('$meta.humanizer_language');
    function minsToDuration(seconds: number) {
        return humanizeDuration(seconds * 60_000, {
            language,
            round: true,
            units: ['d', 'h', 'm'] as Unit[],
            fallbacks: ['en'],
        });
    }

    const handleSaveNote: FormEventHandler = async (e) => {
        e.preventDefault();
        try {
            const result = await fetchWebPipe<GenericApiResp>(`/player/save_note?mutex=current&netid=${player.netid}`, {
                method: 'POST',
                data: { note: note.trim() },
            });
            if ('success' in result && result.success === true) {
                forceRefresh((val) => val + 1);
                enqueueSnackbar(t(`nui_menu.player_modal.info.notes_changed`), {
                    variant: 'success',
                });
            } else {
                enqueueSnackbar((result as GenericApiErrorResp).error ?? t('nui_menu.misc.unknown_error'), {
                    variant: 'error',
                });
            }
        } catch (e) {
            enqueueSnackbar(t('nui_menu.misc.unknown_error'), { variant: 'error' });
        }
    };

    useEffect(() => {
        setNote(player.notes ?? '');
    }, [playerDetails]);

    //Whitelist button
    const btnChangeWhitelistStatus = async () => {
        try {
            const result = await fetchWebPipe<GenericApiResp>(`/player/whitelist?mutex=current&netid=${player.netid}`, {
                method: 'POST',
                data: { status: !player.tsWhitelisted },
            });
            if ('success' in result && result.success === true) {
                forceRefresh((val) => val + 1);
                enqueueSnackbar(t(`nui_menu.player_modal.info.btn_wl_success`), {
                    variant: 'success',
                });
            } else {
                enqueueSnackbar((result as GenericApiErrorResp).error ?? t('nui_menu.misc.unknown_error'), {
                    variant: 'error',
                });
            }
        } catch (error) {
            enqueueSnackbar((error as Error).message, { variant: 'error' });
        }
    };

    //Log stuff
    const counts = { ban: 0, warn: 0, kick: 0 };
    for (const action of player.actionHistory) {
        counts[action.type]++;
    }
    const btnLogDetails = () => {
        setTab(PlayerModalTabs.HISTORY);
    };

    return (
        <DialogContent>
            <Typography variant="h6">{t('nui_menu.player_modal.info.title')}</Typography>
            <Typography>
                {t('nui_menu.player_modal.info.session_time')}:{' '}
                <span style={{ color: theme.palette.text.secondary }}>
                    {player.sessionTime ? minsToDuration(player.sessionTime) : '--'}
                </span>
            </Typography>
            <Typography>
                {t('nui_menu.player_modal.info.play_time')}:{' '}
                <span style={{ color: theme.palette.text.secondary }}>
                    {player.playTime ? minsToDuration(player.playTime) : '--'}
                </span>
            </Typography>
            <Typography>
                {t('nui_menu.player_modal.info.joined')}:{' '}
                <span style={{ color: theme.palette.text.secondary }}>
                    {player.tsJoined ? tsToLocaleDate(player.tsJoined) : '--'}
                </span>
            </Typography>
            <Typography>
                {t('nui_menu.player_modal.info.whitelisted_label')}:{' '}
                <span style={{ color: theme.palette.text.secondary }}>
                    {player.tsWhitelisted
                        ? tsToLocaleDate(player.tsWhitelisted)
                        : t('nui_menu.player_modal.info.whitelisted_notyet')}
                </span>{' '}
                <ButtonXS
                    color={player.tsWhitelisted ? 'error' : 'success'}
                    variant="outlined"
                    onClick={btnChangeWhitelistStatus as any}
                    disabled={!userHasPerm('players.whitelist', userPerms) || !player.license}
                >
                    {player.tsWhitelisted
                        ? t('nui_menu.player_modal.info.btn_wl_remove')
                        : t('nui_menu.player_modal.info.btn_wl_add')}
                </ButtonXS>
            </Typography>
            <Box pt={1}>
                <Box display="flex" alignItems="center" justifyContent="space-between" gap={1}>
                    <Typography>
                        {t('nui_menu.player_modal.info.tags_label')}:{' '}
                        {playerTags.length === 0 && <span style={{ color: theme.palette.text.secondary }}>--</span>}
                    </Typography>
                    {canEditTags && manualCustomTagDefs.length > 0 && (
                        <>
                            <ButtonXS
                                color="info"
                                variant="outlined"
                                onClick={(e) => setTagMenuAnchor(e.currentTarget)}
                                disabled={isTagUpdating}
                            >
                                {t('nui_menu.player_modal.info.edit_tags')}
                            </ButtonXS>
                            <Menu
                                anchorEl={tagMenuAnchor}
                                open={Boolean(tagMenuAnchor)}
                                onClose={() => setTagMenuAnchor(null)}
                                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                            >
                                {manualCustomTagDefs.map((def) => {
                                    const hasTag = player.tags?.includes(def.id) ?? false;
                                    return (
                                        <MenuItem
                                            key={def.id}
                                            dense
                                            disabled={isTagUpdating}
                                            onClick={() => handleToggleTag(def.id, hasTag)}
                                        >
                                            <ListItemIcon sx={{ minWidth: 32 }}>
                                                <Checkbox edge="start" checked={hasTag} tabIndex={-1} disableRipple />
                                            </ListItemIcon>
                                            <ListItemIcon sx={{ minWidth: 20 }}>
                                                <Box
                                                    component="span"
                                                    sx={{
                                                        display: 'inline-block',
                                                        width: 10,
                                                        height: 10,
                                                        borderRadius: '50%',
                                                        backgroundColor: def.color,
                                                    }}
                                                />
                                            </ListItemIcon>
                                            <ListItemText primary={def.label} />
                                        </MenuItem>
                                    );
                                })}
                            </Menu>
                        </>
                    )}
                </Box>
                {playerTags.length > 0 && (
                    <Box display="flex" flexWrap="wrap" gap={0.75} pt={0.75}>
                        {playerTags.map((tag) => (
                            <Box
                                key={tag.id}
                                component="span"
                                sx={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    px: 1,
                                    py: 0.4,
                                    borderRadius: '999px',
                                    border: '1px solid transparent',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    letterSpacing: '0.02em',
                                    ...tag.styles,
                                }}
                            >
                                {tag.label}
                            </Box>
                        ))}
                    </Box>
                )}
                {canEditTags && manualCustomTagDefs.length === 0 && (
                    <Typography variant="caption" color="text.secondary" display="block" pt={0.5}>
                        {t('nui_menu.player_modal.info.no_custom_tags')}
                    </Typography>
                )}
            </Box>
            <Typography>
                {t('nui_menu.player_modal.info.log_label')}:{' '}
                <span style={{ color: theme.palette.text.secondary }}>
                    {!counts.ban && !counts.warn ? (
                        t('nui_menu.player_modal.info.log_empty')
                    ) : (
                        <>
                            <span style={{ color: theme.palette.error.main }}>
                                {t('nui_menu.player_modal.info.log_ban_count', {
                                    smart_count: counts.ban,
                                })}
                            </span>
                            ,&nbsp;
                            <span style={{ color: theme.palette.warning.main }}>
                                {t('nui_menu.player_modal.info.log_warn_count', {
                                    smart_count: counts.warn,
                                })}
                            </span>
                        </>
                    )}
                </span>{' '}
                <ButtonXS color="info" variant="outlined" onClick={btnLogDetails as any}>
                    {t('nui_menu.player_modal.info.log_btn')}
                </ButtonXS>
            </Typography>
            <form onSubmit={handleSaveNote} style={{ marginBlockEnd: 0 }}>
                <Box pt={1}>
                    <TextField
                        autoFocus
                        margin="dense"
                        id="name"
                        label={t('nui_menu.player_modal.info.notes_placeholder')}
                        type="text"
                        value={note}
                        onChange={(e) => setNote(e.currentTarget.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSaveNote}
                        variant="outlined"
                        multiline
                        rows={4}
                        fullWidth
                    />
                    <Button type="submit" color="primary" variant="outlined" style={{ right: 0 }}>
                        Save Note
                    </Button>
                </Box>
            </form>
        </DialogContent>
    );
};

export default DialogInfoView;
