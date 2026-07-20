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

interface ListWrapperProps {
    fadeTop: boolean;
    fadeBottom: boolean;
}

//The card is translucent glass, so overflow is hinted by masking the list
//content itself (overlay gradients would stack on the surface and read as
//dark bands over the blur).
const ListWrapper = styled(Box, {
    shouldForwardProp: (prop) => prop !== 'fadeTop' && prop !== 'fadeBottom',
})<ListWrapperProps>(({ fadeTop, fadeBottom }) => {
    const top = fadeTop ? `transparent 0, black ${fadeHeight}px` : 'black 0';
    const bottom = fadeBottom ? `black calc(100% - ${fadeHeight}px), transparent 100%` : 'black 100%';
    const mask = `linear-gradient(to bottom, ${top}, ${bottom})`;
    return {
        position: 'relative',
        maxHeight: listHeight,
        overflow: 'hidden',
        maskImage: mask,
        WebkitMaskImage: mask,
    };
});

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
            <ListWrapper fadeTop={showTopFade} fadeBottom={showBottomFade}>
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
            </ListWrapper>
            <BoxIcon display="flex" justifyContent="center">
                <ExpandMore />
            </BoxIcon>
        </Box>
    );
};
