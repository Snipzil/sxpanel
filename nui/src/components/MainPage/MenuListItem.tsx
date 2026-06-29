import React, { memo, useEffect, useRef, useState } from 'react';
import {
    Box,
    BoxProps,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemSecondaryAction,
    ListItemText,
    Typography,
    styled,
} from '@mui/material';
import { useKeyboardNavigation } from '../../hooks/useKeyboardNavigation';
import { Code } from '@mui/icons-material';
import { fetchNui } from '../../utils/fetchNui';
import { useTranslate } from 'react-polyglot';
import { ResolvablePermission, usePermissionsValue } from '../../state/permissions.state';
import { userHasPerm } from '../../utils/miscUtils';
import { useSnackbar } from 'notistack';
import { useTooltip } from '../../provider/TooltipProvider';

const PREFIX = 'MenuListItem';

const classes = {
    root: `${PREFIX}-root`,
    rootDisabled: `${PREFIX}-rootDisabled`,
    icon: `${PREFIX}-icon`,
    overrideText: `${PREFIX}-overrideText`,
};

const Root = styled('div')(({ theme }) => ({
    //Rows are individual raised panels (surface/border/selection styling comes
    //from the MuiListItemButton theme override); this adds the row spacing.
    marginBottom: 3,
    '&:last-of-type': {
        marginBottom: 0,
    },

    [`& .${classes.rootDisabled}`]: {
        opacity: 0.35,
    },

    [`& .${classes.icon}`]: {
        color: theme.palette.text.secondary,
        transition: 'color 120ms ease',
        flexShrink: 0,
    },

    [`& .Mui-selected .${classes.icon}`]: {
        color: theme.palette.primary.main,
    },

    [`& .Mui-selected .MuiListItemSecondaryAction-root, & .Mui-selected .MuiTypography-root`]: {
        color: theme.tokens.textPrimary,
    },

    [`& .${classes.overrideText}`]: {
        color: theme.palette.text.primary,
        fontSize: 13,
        lineHeight: 1.3,
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },

    '& .MuiListItemButton-root': {
        minWidth: 0,
    },

    '& .MuiListItemText-root': {
        minWidth: 0,
    },
}));

export interface MenuListItemProps {
    title: string;
    label: string;
    requiredPermission?: ResolvablePermission;
    icon: React.ReactElement;
    selected: boolean;
    onSelect: () => void;
}

export const MenuListItem: React.FC<MenuListItemProps> = memo(
    ({ title, label, requiredPermission, icon, selected, onSelect }) => {
        const t = useTranslate();
        const divRef = useRef<HTMLDivElement | null>(null);
        const userPerms = usePermissionsValue();
        const isUserAllowed = requiredPermission ? userHasPerm(requiredPermission, userPerms) : true;
        const { enqueueSnackbar } = useSnackbar();
        const { setTooltipText } = useTooltip();

        const handleEnter = (): void => {
            if (!selected) return;

            if (!isUserAllowed) {
                enqueueSnackbar(t('nui_menu.misc.no_perms'), {
                    variant: 'error',
                    anchorOrigin: {
                        horizontal: 'center',
                        vertical: 'bottom',
                    },
                });
                return;
            }

            fetchNui('playSound', 'enter');
            onSelect();
        };

        useEffect(() => {
            if (selected && divRef) {
                divRef.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                    inline: 'start',
                });
            }
        }, [selected]);

        useEffect(() => {
            if (selected) {
                setTooltipText(label);
            }
        }, [selected]);

        useKeyboardNavigation({
            onEnterDown: handleEnter,
            disableOnFocused: true,
        });

        return (
            <Root ref={divRef}>
                <ListItemButton
                    onClick={() => onSelect()}
                    className={isUserAllowed ? classes.root : classes.rootDisabled}
                    dense
                    selected={selected}
                >
                    <ListItemIcon className={classes.icon}>{icon}</ListItemIcon>
                    <ListItemText
                        primary={title}
                        sx={{ minWidth: 0 }}
                        classes={{
                            primary: classes.overrideText,
                        }}
                    />
                </ListItemButton>
            </Root>
        );
    },
);

interface MenuListItemMultiAction {
    name?: string | React.ReactElement;
    label: string;
    value: string | number | boolean;
    icon?: React.ReactElement;
    requiredPermission?: ResolvablePermission;
    onSelect: () => void;
}

export interface MenuListItemMultiProps {
    title: string;
    requiredPermission?: ResolvablePermission;
    initialValue?: MenuListItemMultiAction;
    selected: boolean;
    icon: React.ReactElement;
    actions: MenuListItemMultiAction[];
}

export const MenuListItemMulti: React.FC<MenuListItemMultiProps> = memo(
    ({ selected, title, actions, icon, initialValue, requiredPermission }) => {
        const t = useTranslate();
        const [curState, setCurState] = useState(0);
        const userPerms = usePermissionsValue();
        const { enqueueSnackbar } = useSnackbar();
        const { setTooltipText } = useTooltip();

        // Row-level permission: if set and user lacks it AND no per-action perms exist, grey out entire row
        // If actions have individual permissions, the row is accessible if user has ANY action's permission
        const hasAnyActionPerm = actions.some((action) => {
            if (action.requiredPermission) {
                return userHasPerm(action.requiredPermission, userPerms);
            }
            return true;
        });
        const isRowAllowed = requiredPermission
            ? userHasPerm(requiredPermission, userPerms) || hasAnyActionPerm
            : hasAnyActionPerm;

        // Per-action permission check for the currently selected action
        const currentAction = actions[curState];
        const isCurrentActionAllowed = currentAction?.requiredPermission
            ? userHasPerm(currentAction.requiredPermission, userPerms)
            : isRowAllowed;

        const compMounted = useRef(false);

        const divRef = useRef<HTMLDivElement | null>(null);

        const showNotAllowedAlert = () => {
            enqueueSnackbar(t('nui_menu.misc.no_perms'), {
                variant: 'error',
                anchorOrigin: {
                    horizontal: 'center',
                    vertical: 'bottom',
                },
            });
        };

        useEffect(() => {
            if (selected && divRef) {
                divRef.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                    inline: 'start',
                });
            }
        }, [selected]);

        // Mount/unmount detection
        // We will only run this hook after initial mount
        // and not on unmount.
        // NOTE: This hook does not work if actions prop are dynamic
        useEffect(() => {
            if (!compMounted.current) {
                compMounted.current = true;
                // We will set the initial value of the item based on the passed initial value
                const index = actions.findIndex((a) => a.value === initialValue?.value);
                setCurState(index > -1 ? index : 0);
            }
        }, [curState]);

        useEffect(() => {
            if (actions[curState]?.label && selected) {
                setTooltipText(actions[curState]?.label);
            }
        }, [curState, selected]);

        const handleLeftArrow = () => {
            if (!selected) return;

            fetchNui('playSound', 'move').catch();
            const nextEstimatedItem = curState - 1;
            const nextItem = nextEstimatedItem < 0 ? actions.length - 1 : nextEstimatedItem;
            setCurState(nextItem);
        };

        const handleRightArrow = () => {
            if (!selected) return;

            fetchNui('playSound', 'move');
            const nextEstimatedItem = curState + 1;
            const nextItem = nextEstimatedItem >= actions.length ? 0 : nextEstimatedItem;
            setCurState(nextItem);
        };

        const handleEnter = () => {
            if (!selected) return;
            if (!isCurrentActionAllowed) return showNotAllowedAlert();

            fetchNui('playSound', 'enter').catch();
            actions[curState].onSelect();
        };

        useKeyboardNavigation({
            onRightDown: handleRightArrow,
            onLeftDown: handleLeftArrow,
            onEnterDown: handleEnter,
            disableOnFocused: true,
        });

        return (
            <Root ref={divRef}>
                <ListItemButton
                    className={isRowAllowed ? classes.root : classes.rootDisabled}
                    dense
                    selected={selected}
                >
                    <ListItemIcon className={classes.icon}>{actions[curState]?.icon ?? icon}</ListItemIcon>
                    <ListItemText
                        primary={
                            <>
                                {title}:&nbsp;
                                <Typography
                                    component="span"
                                    color={selected ? 'text.primary' : 'text.secondary'}
                                    sx={{
                                        fontSize: 13,
                                        fontWeight: selected ? 600 : 400,
                                        opacity: isCurrentActionAllowed ? 1 : 0.4,
                                        minWidth: 0,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {actions[curState]?.name ?? '???'}
                                </Typography>
                            </>
                        }
                        classes={{
                            primary: classes.overrideText,
                        }}
                        sx={{ minWidth: 0 }}
                    />
                    <ListItemSecondaryAction>
                        <Code className={classes.icon} />
                    </ListItemSecondaryAction>
                </ListItemButton>
            </Root>
        );
    },
);
