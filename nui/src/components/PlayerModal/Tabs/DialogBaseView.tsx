import React, { lazy, Suspense } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { PlayerModalTabs, usePlayerModalTabValue } from '@nui/src/state/playerModal.state';

const DialogActionView = lazy(() => import('./DialogActionView'));
const DialogInfoView = lazy(() => import('./DialogInfoView'));
const DialogIdView = lazy(() => import('./DialogIdView'));
const DialogHistoryView = lazy(() => import('./DialogHistoryView'));
const DialogBanView = lazy(() => import('./DialogBanView'));

const TabFallback = () => (
    <Box display="flex" flexGrow={1} width="100%" justifyContent="center" alignItems="center">
        <CircularProgress size={28} />
    </Box>
);

const tabToRender = (tab: PlayerModalTabs) => {
    switch (tab) {
        case PlayerModalTabs.ACTIONS:
            return <DialogActionView />;
        case PlayerModalTabs.INFO:
            return <DialogInfoView />;
        case PlayerModalTabs.IDENTIFIERS:
            return <DialogIdView />;
        case PlayerModalTabs.HISTORY:
            return <DialogHistoryView />;
        case PlayerModalTabs.BAN:
            return <DialogBanView />;
    }
};

export const DialogBaseView: React.FC = () => {
    const curTab = usePlayerModalTabValue();

    return (
        <Box flexGrow={1} mt={-2} overflow="hidden">
            <Suspense fallback={<TabFallback />}>{tabToRender(curTab)}</Suspense>
        </Box>
    );
};
