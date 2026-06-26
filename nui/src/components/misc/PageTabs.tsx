import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { Box, ButtonBase, styled } from '@mui/material';
import { FlagRounded, GroupsRounded, HomeRounded } from '@mui/icons-material';
import { getMaxMenuPage, getNextMenuPage, txAdminMenuPage, usePage } from '../../state/page.state';
import { useKey } from '../../hooks/useKey';
import { useTabDisabledValue } from '../../state/keys.state';
import { useIsMenuVisibleValue } from '../../state/visibility.state';
import { useServerCtxValue } from '../../state/server.state';

const BarRoot = styled(Box)(({ theme }) => ({
    display: 'flex',
    gap: 4,
    padding: 4,
    width: '100%',
    boxSizing: 'border-box',
    backgroundColor: theme.tokens.surface,
    border: `1px solid ${theme.tokens.border}`,
    borderRadius: theme.tokens.radiusPill,
    userSelect: 'none',
}));

interface SegmentProps {
    active: boolean;
}

const Segment = styled(ButtonBase, {
    shouldForwardProp: (prop) => prop !== 'active',
})<SegmentProps>(({ theme, active }) => ({
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    padding: '5px 0 4px',
    borderRadius: theme.tokens.radiusPill,
    color: active ? theme.tokens.accentContrast : theme.tokens.textMuted,
    backgroundColor: active ? theme.tokens.accent : 'transparent',
    transition: 'background-color 120ms ease, color 120ms ease',
    '&:hover': {
        backgroundColor: active ? theme.tokens.accent : theme.tokens.surfaceHover,
        color: active ? theme.tokens.accentContrast : theme.tokens.textPrimary,
    },
    '& svg': {
        fontSize: 15,
    },
}));

const SegmentLabel = styled('span')({
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    lineHeight: 1,
});

interface PageSegmentDef {
    page: txAdminMenuPage;
    label: string;
    icon: React.ReactNode;
}

/**
 * Detached segmented pill tab bar floating above the menu card. Replaces the
 * old MUI Tabs strip; keeps the same page value semantics and Tab-key cycle.
 */
export const PageTabs: React.FC = () => {
    const [page, setPage] = usePage();
    const tabDisabled = useTabDisabledValue();
    const visible = useIsMenuVisibleValue();
    const serverCtx = useServerCtxValue();

    const maxPage = getMaxMenuPage(serverCtx.reportsEnabled);
    const activePage = page <= maxPage ? page : txAdminMenuPage.Main;

    useEffect(() => {
        if (page > maxPage || (page === txAdminMenuPage.Reports && !serverCtx.reportsEnabled)) {
            setPage(txAdminMenuPage.Main);
        }
    }, [page, maxPage, serverCtx.reportsEnabled, setPage]);

    const handleTabPress = useCallback(() => {
        if (tabDisabled || !visible) return;
        setPage((prevState) => getNextMenuPage(prevState, serverCtx.reportsEnabled));
    }, [tabDisabled, visible, setPage, serverCtx.reportsEnabled]);

    useKey(serverCtx.switchPageKey, handleTabPress);

    const segments: PageSegmentDef[] = [
        { page: txAdminMenuPage.Main, label: 'Main', icon: <HomeRounded /> },
        { page: txAdminMenuPage.Players, label: 'Players', icon: <GroupsRounded /> },
    ];
    if (serverCtx.reportsEnabled) {
        segments.push({ page: txAdminMenuPage.Reports, label: 'Reports', icon: <FlagRounded /> });
    }
    const barRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const barEl = barRef.current;
        if (!barEl) return;

        const syncTabBarHeight = () => {
            const height = Math.ceil(barEl.getBoundingClientRect().height);
            document.documentElement.style.setProperty('--menu-tabbar-height', `${height}px`);
        };

        syncTabBarHeight();

        const resizeObserver = new ResizeObserver(syncTabBarHeight);
        resizeObserver.observe(barEl);
        return () => resizeObserver.disconnect();
    }, [segments.length]);

    return (
        <BarRoot ref={barRef}>
            {segments.map((segment) => (
                <Segment
                    key={segment.page}
                    active={activePage === segment.page}
                    onClick={() => setPage(segment.page)}
                    tabIndex={-1}
                    disableRipple
                    aria-label={segment.label}
                >
                    {segment.icon}
                    <SegmentLabel>{segment.label}</SegmentLabel>
                </Segment>
            ))}
        </BarRoot>
    );
};
