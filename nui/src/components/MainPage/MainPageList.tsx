import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, List, styled } from '@mui/material';
import { MenuListItem, MenuListItemMulti } from './MenuListItem';
import { ExpandMore } from '@mui/icons-material';
import { useKeyboardNavigation } from '../../hooks/useKeyboardNavigation';
import { fetchNui } from '../../utils/fetchNui';
import { useIsMenuVisibleValue } from '../../state/visibility.state';
import { usePlayerModeActions } from './actions/usePlayerModeActions';
import { useTeleportActions } from './actions/useTeleportActions';
import { useVehicleActions } from './actions/useVehicleActions';
import { useHealActions } from './actions/useHealActions';
import { useMiscActions } from './actions/useMiscActions';

const fadeHeight = 16;
const listHeight = 300;

const ListWrapper = styled(Box)({
    position: 'relative',
    maxHeight: listHeight,
    overflow: 'hidden',
});

const FadeTop = styled(Box)(({ theme }) => ({
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: fadeHeight,
    pointerEvents: 'none',
    zIndex: 2,
    backgroundImage: `linear-gradient(to bottom, ${theme.palette.background.default}, transparent)`,
}));

const FadeBottom = styled(Box)(({ theme }) => ({
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: fadeHeight,
    pointerEvents: 'none',
    zIndex: 2,
    backgroundImage: `linear-gradient(to top, ${theme.palette.background.default}, transparent)`,
}));

const BoxIcon = styled(Box)(({ theme }) => ({
    color: theme.palette.text.secondary,
    marginTop: 0,
    display: 'flex',
    justifyContent: 'center',
    '& svg': {
        fontSize: 18,
    },
}));

const StyledList = styled(List)({
    maxHeight: listHeight,
    overflow: 'auto',
    '&::-webkit-scrollbar': {
        display: 'none',
    },
});

export const MainPageList: React.FC = () => {
    const [curSelected, setCurSelected] = useState(0);
    const menuVisible = useIsMenuVisibleValue();

    const { playerMode, menuItem: playerModeItem } = usePlayerModeActions();
    const { teleportMode, menuItem: teleportItem } = useTeleportActions();
    const { vehicleMode, serverCtx, isRedm, menuItem: vehicleItem } = useVehicleActions();
    const { healMode, menuItem: healItem } = useHealActions();
    const { menuItems: miscItems } = useMiscActions();

    useEffect(() => {
        if (!menuVisible) setCurSelected(0);
    }, [menuVisible]);

    const menuListItems = useMemo(
        () => [playerModeItem, teleportItem, vehicleItem, healItem, ...miscItems],
        [playerModeItem, teleportItem, vehicleItem, healItem, miscItems],
    );

    //=============================================
    const handleArrowDown = useCallback(() => {
        const next = curSelected + 1;
        fetchNui('playSound', 'move').catch();
        setCurSelected(next >= menuListItems.length ? 0 : next);
    }, [curSelected, menuListItems.length]);

    const handleArrowUp = useCallback(() => {
        const next = curSelected - 1;
        fetchNui('playSound', 'move').catch();
        setCurSelected(next < 0 ? menuListItems.length - 1 : next);
    }, [curSelected, menuListItems.length]);

    useKeyboardNavigation({
        onDownDown: handleArrowDown,
        onUpDown: handleArrowUp,
        disableOnFocused: true,
    });

    const showTopFade = curSelected > 1;
    const showBottomFade = curSelected < menuListItems.length - 2;

    return (
        <Box sx={{ pointerEvents: 'none' }}>
            <ListWrapper>
                <StyledList sx={{ pointerEvents: 'auto' }}>
                    {menuListItems.map((item, index) =>
                        'isMultiAction' in item && item.isMultiAction ? (
                            // @ts-ignore
                            <MenuListItemMulti key={index} selected={curSelected === index} {...item} />
                        ) : (
                            // @ts-ignore
                            <MenuListItem key={index} selected={curSelected === index} {...item} />
                        ),
                    )}
                </StyledList>
                <FadeTop style={{ opacity: showTopFade ? 1 : 0 }} />
                <FadeBottom style={{ opacity: showBottomFade ? 1 : 0 }} />
            </ListWrapper>
            <BoxIcon display="flex" justifyContent="center">
                <ExpandMore />
            </BoxIcon>
        </Box>
    );
};
