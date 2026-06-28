import React from 'react';
import { Box, Collapse, styled, Typography, useTheme } from '@mui/material';
import { txAdminMenuPage, usePageValue } from '@nui/src/state/page.state';
import { MainPageList } from '@nui/src/components/MainPage/MainPageList';
import { useServerCtxValue } from '@nui/src/state/server.state';
import { useDebounce } from '@nui/src/hooks/useDebouce';

const StyledRoot = styled(Box)(({ theme }) => ({
    height: 'fit-content',
    backgroundColor: theme.tokens.surface,
    width: '100%',
    boxSizing: 'border-box',
    borderRadius: theme.tokens.radiusCard,
    border: `1px solid ${theme.tokens.border}`,
    display: 'flex',
    flexDirection: 'column',
    userSelect: 'none',
}));

const HeaderRow = styled(Box)({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 24,
});

/**
 * The menu card: slim wordmark header + Main page list. The page tab bar
 * lives outside this card as a detached pill bar (see MenuRoot). The whole
 * card is only shown on the Main page.
 */
export const MenuRootContent: React.FC = React.memo(() => {
    const serverCtx = useServerCtxValue();
    const curPage = usePageValue();
    const theme = useTheme();

    // Hack to prevent collapse transition from breaking
    // In some cases, i.e, when setting target player from playerModal
    // Collapse transition can break due to multiple page updates within a short
    // time frame
    const debouncedCurPage = useDebounce(curPage, 50);

    return (
        <Collapse in={debouncedCurPage === txAdminMenuPage.Main} mountOnEnter>
            <StyledRoot px={1.5} pt={1.25} pb={1}>
                <HeaderRow mb={0.25}>
                    <img
                        src="images/sxPanel.png"
                        alt="sxPanel"
                        style={{ height: 16, width: 'auto', display: 'block' }}
                    />
                    <Typography
                        style={{
                            fontWeight: 500,
                            fontSize: 11,
                            color: theme.tokens.textMuted,
                        }}
                    >
                        v{serverCtx.sxPanelVersion}
                    </Typography>
                </HeaderRow>
                <MainPageList />
            </StyledRoot>
        </Collapse>
    );
});
