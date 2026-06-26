import React from 'react';
import { Box, styled } from '@mui/material';
import { PlayerPageHeader } from './PlayerPageHeader';
import { useFilteredSortedPlayers } from '../../state/players.state';
import { PlayersListEmpty } from './PlayersListEmpty';
import { PlayersListGrid } from './PlayersListGrid';

const RootStyled = styled(Box)(({ theme }) => ({
    backgroundColor: theme.tokens.surface,
    border: `1px solid ${theme.tokens.border}`,
    height: '50vh',
    borderRadius: theme.tokens.radiusCard,
    flex: 1,
}));

const GridStyled = styled(Box)(({ theme }) => ({
    display: 'flex',
    flexDirection: 'column',
    height: '85%',
}));

export const PlayersPage: React.FC<{ visible: boolean }> = ({ visible }) => {
    const players = useFilteredSortedPlayers();

    return (
        <RootStyled mt={2} mb={10} pt={4} px={4} display={visible ? 'initial' : 'none'}>
            <PlayerPageHeader />
            <GridStyled>{players.length ? <PlayersListGrid /> : <PlayersListEmpty />}</GridStyled>
        </RootStyled>
    );
};
