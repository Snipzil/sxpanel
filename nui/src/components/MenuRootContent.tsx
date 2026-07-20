import React from 'react';
import { Box, Collapse, styled, Typography, useTheme } from '@mui/material';
import { txAdminMenuPage, usePageValue } from '@nui/src/state/page.state';
import { MainPageList } from '@nui/src/components/MainPage/MainPageList';
import { useServerCtxValue } from '@nui/src/state/server.state';
import { useDebounce } from '@nui/src/hooks/useDebouce';

const StyledRoot = styled(Box)(({ theme }) => ({
    height: 'fit-content',
    backgroundColor: theme.tokens.surface,
    boxShadow: theme.tokens.shadowCard,
    width: '100%',
    boxSizing: 'border-box',
    //Flat top edge — this card sits flush under PageTabs (see MenuRoot), the
    //two share one continuous silhouette instead of stacking as separate
    //floating pieces.
    borderRadius: `0 0 ${theme.tokens.radiusCard}px ${theme.tokens.radiusCard}px`,
    border: `1px solid ${theme.tokens.border}`,
    borderTop: 'none',
    display: 'flex',
    flexDirection: 'column',
    userSelect: 'none',
}));

const HeaderRow = styled(Box)(({ theme }) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 24,
    borderBottom: `1px solid ${theme.tokens.border}`,
}));

/**
 * The menu card: slim wordmark header + Main page list. Fuses flush under
 * PageTabs (see MenuRoot) into one continuous panel. Only shown on the Main
 * page.
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
            <StyledRoot px={1.75} pt={1.5} pb={1.25}>
                <HeaderRow mb={1} pb={1}>
                    <img
                        src="images/sxPanel.png"
                        alt="sxPanel"
                        style={{ height: 16, width: 'auto', display: 'block' }}
                    />
                    <Typography
                        style={{
                            fontWeight: 600,
                            fontSize: 10,
                            lineHeight: 1,
                            color: theme.tokens.textMuted,
                            backgroundColor: theme.tokens.surfaceRaised,
                            border: `1px solid ${theme.tokens.border}`,
                            borderRadius: theme.tokens.radiusPill,
                            padding: '3px 8px',
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
