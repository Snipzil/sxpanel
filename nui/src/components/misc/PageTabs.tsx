import React, { useCallback, useEffect } from 'react';
import { Box, styled, Tab, Tabs } from '@mui/material';
import { txAdminMenuPage, usePage } from '../../state/page.state';
import { useKey } from '../../hooks/useKey';
import { useTabDisabledValue } from '../../state/keys.state';
import { useIsMenuVisibleValue } from '../../state/visibility.state';
import { useServerCtxValue } from '../../state/server.state';

const StyledTab = styled(Tab)({
    letterSpacing: '0.1em',
    minWidth: 100,
});

export const PageTabs: React.FC = () => {
    const [page, setPage] = usePage();
    const tabDisabled = useTabDisabledValue();
    const visible = useIsMenuVisibleValue();
    const serverCtx = useServerCtxValue();

    const maxPage = serverCtx.reportsEnabled ? txAdminMenuPage.Reports : txAdminMenuPage.Players;
    const tabValue = page <= maxPage ? page : txAdminMenuPage.Main;

    // Sync page state when reportsEnabled changes and current page exceeds maxPage
    useEffect(() => {
        if (page > maxPage) {
            setPage(txAdminMenuPage.Main);
        }
    }, [page, maxPage, setPage]);

    const handleTabPress = useCallback(() => {
        if (tabDisabled || !visible) return;
        setPage((prevState) => (prevState >= maxPage ? txAdminMenuPage.Main : prevState + 1));
    }, [tabDisabled, visible, setPage, maxPage]);

    useKey(serverCtx.switchPageKey, handleTabPress);

    return (
        <Box width="100%">
            <Tabs
                value={tabValue}
                centered
                indicatorColor="primary"
                textColor="primary"
                onChange={(_, newVal) => setPage(newVal)}
            >
                <StyledTab label="Main" wrapped disableFocusRipple />
                <StyledTab label="Players" wrapped disableFocusRipple />
                {serverCtx.reportsEnabled && <StyledTab label="Reports" wrapped disableFocusRipple />}
            </Tabs>
        </Box>
    );
};
