import React from 'react';
import { Box } from '@mui/material';
import { PlayersPage } from './PlayersPage/PlayersPage';
import { ReportsTab } from './ReportsTab/ReportsTab';
import { txAdminMenuPage, usePageValue } from '../state/page.state';
import { useHudListenersService } from '../hooks/useHudListenersService';
import { useServerCtxValue } from '../state/server.state';
import { MenuRootContent } from '@nui/src/components/MenuRootContent';

const MenuRoot: React.FC = () => {
    // We need to mount this here so we can get access to
    // the translation context
    useHudListenersService();
    const curPage = usePageValue();
    const serverCtx = useServerCtxValue();

    if (curPage === txAdminMenuPage.PlayerModalOnly) return null;
    return (
        <>
            <Box
                style={{
                    width: 'fit-content',
                    flexShrink: 0,
                    alignSelf: serverCtx.alignRight ? 'flex-end' : 'auto',
                }}
            >
                <MenuRootContent />
            </Box>
            <PlayersPage visible={curPage === txAdminMenuPage.Players} />
            {serverCtx.reportsEnabled && <ReportsTab visible={curPage === txAdminMenuPage.Reports} />}
        </>
    );
};

export default MenuRoot;
