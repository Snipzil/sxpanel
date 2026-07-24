import React, { useCallback, useEffect, useState } from 'react';
import { Box, IconButton, styled, Typography, useTheme } from '@mui/material';
import {
    AccessTimeOutlined,
    ExtensionOutlined,
    GroupsOutlined,
    HubOutlined,
    MemoryOutlined,
    Refresh,
    SpeedOutlined,
    WbTwilightOutlined,
} from '@mui/icons-material';
import { txAdminMenuPage, usePageValue } from '@nui/src/state/page.state';
import { useServerCtxValue } from '@nui/src/state/server.state';
import { useNuiEvent } from '@nui/src/hooks/useNuiEvent';
import { fetchNui } from '@nui/src/utils/fetchNui';
import { fetchWebPipe } from '@nui/src/utils/fetchWebPipe';
import { useTranslate } from 'react-polyglot';

const RootStyled = styled(Box)(({ theme }) => ({
    backgroundColor: theme.tokens.surface,
    boxShadow: theme.tokens.shadowCard,
    border: `1px solid ${theme.tokens.border}`,
    height: 'fit-content',
    maxHeight: '58vh',
    minWidth: 0,
    boxSizing: 'border-box',
    overflowY: 'auto',
    overflowX: 'hidden',
    borderRadius: theme.tokens.radiusCard,
    flexDirection: 'column',
}));

const TileGrid = styled(Box)({
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 10,
});

const Tile = styled(Box)(({ theme }) => ({
    padding: '14px 16px',
    borderRadius: theme.tokens.radiusRow,
    border: `1px solid ${theme.tokens.border}`,
    backgroundColor: theme.tokens.surfaceRaised,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    minWidth: 0,
}));

const TileIconBadge = styled(Box)(({ theme }) => ({
    width: 28,
    height: 28,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.tokens.surfaceHover,
    color: theme.tokens.accent,
    '& svg': { fontSize: 16 },
}));

const tileLabelSx = {
    fontWeight: 700,
    fontSize: '0.68rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
};

const StatsGroup = styled(Box)({
    marginBottom: 18,
    '&:last-of-type': { marginBottom: 0 },
});

const GroupTitle = styled(Typography)(({ theme }) => ({
    fontSize: '0.66rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: theme.tokens.textMuted,
    marginBottom: 8,
}));

const AdminRow = styled(Box)(({ theme }) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '7px 10px',
    borderRadius: theme.tokens.radiusRow,
    border: `1px solid ${theme.tokens.border}`,
    backgroundColor: theme.tokens.surfaceRaised,
    marginBottom: 6,
    '&:last-of-type': { marginBottom: 0 },
}));

const AdminAvatar = styled(Box)(({ theme }) => ({
    width: 24,
    height: 24,
    borderRadius: '50%',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.66rem',
    fontWeight: 700,
    color: theme.tokens.accentContrast,
    background: theme.tokens.accentGradient,
}));

const AccessChip = styled(Box)(({ theme }) => ({
    fontSize: '0.62rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.02em',
    padding: '3px 7px',
    borderRadius: theme.tokens.radiusPill,
    flexShrink: 0,
    color: theme.tokens.info,
    backgroundColor: theme.tokens.surfaceHover,
    border: `1px solid ${theme.tokens.border}`,
}));

interface AdminEntry {
    id: number;
    username: string;
    fullAccess: boolean;
}

interface StatsSnapshot {
    playerCount: number;
    resourceCount: number;
    uptimeSeconds: number;
    admins: AdminEntry[];
    youId: number;
}

interface WorldTime {
    hours: number;
    minutes: number;
}

interface DiagnosticsResp {
    host?:
        | {
              dynamic?: {
                  cpuUsage: number;
                  memory: { usage: number; used: number; total: number };
              };
          }
        | { error: string };
}

interface PerfSnapshot {
    cpuUsage: number;
    memUsedGb: number;
    memTotalGb: number;
}

function formatUptime(totalSeconds: number): string {
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function formatClock({ hours, minutes }: WorldTime): string {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function initials(username: string): string {
    return username.slice(0, 2).toUpperCase();
}

const REFRESH_INTERVAL_MS = 10000;

export const StatsPage: React.FC<{ visible: boolean }> = ({ visible }) => {
    const t = useTranslate();
    const theme = useTheme();
    const curPage = usePageValue();
    const serverCtx = useServerCtxValue();
    const [stats, setStats] = useState<StatsSnapshot | null>(null);
    const [worldTime, setWorldTime] = useState<WorldTime | null>(null);
    const [perf, setPerf] = useState<PerfSnapshot | null>(null);
    const [loading, setLoading] = useState(false);
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

    const handleRefresh = useCallback(() => {
        setLoading(true);
        fetchNui('getStats').catch(() => setLoading(false));

        fetchNui<WorldTime>('getWorldTime')
            .then(setWorldTime)
            .catch(() => {});

        //Best-effort: the core diagnostics endpoint can be slow/unavailable
        //(e.g. right after a restart) — perf tiles just stay blank if so.
        fetchWebPipe<DiagnosticsResp>('/diagnostics/data')
            .then((resp) => {
                const dynamic = resp?.host && 'dynamic' in resp.host ? resp.host.dynamic : undefined;
                if (dynamic) {
                    setPerf({
                        cpuUsage: dynamic.cpuUsage,
                        memUsedGb: dynamic.memory.used,
                        memTotalGb: dynamic.memory.total,
                    });
                }
            })
            .catch(() => {});
    }, []);

    useNuiEvent<StatsSnapshot>('setStats', (data) => {
        setStats(data);
        setLoading(false);
        setHasLoadedOnce(true);
    });

    useEffect(() => {
        if (curPage !== txAdminMenuPage.Stats) return;
        handleRefresh();
        const interval = setInterval(handleRefresh, REFRESH_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [curPage, handleRefresh]);

    const oneSyncLabel = serverCtx.oneSync.status ? (serverCtx.oneSync.type ?? 'on').toUpperCase() : 'OFF';

    return (
        <RootStyled mt={2} mb={10} pt={2} px={2} display={visible ? 'flex' : 'none'}>
            <Box display="flex" alignItems="center" justifyContent="space-between" gap={1} mb={1.5} minWidth={0}>
                <Typography
                    variant="subtitle1"
                    fontWeight={700}
                    sx={{ color: theme.tokens.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                    {serverCtx.projectName || t('nui_stats.title')}
                </Typography>
                <IconButton
                    size="small"
                    onClick={handleRefresh}
                    disabled={loading}
                    title={t('nui_stats.refresh')}
                    sx={{ color: theme.tokens.textMuted, flexShrink: 0 }}
                >
                    <Refresh fontSize="small" />
                </IconButton>
            </Box>

            {!hasLoadedOnce && loading ? (
                <Box textAlign="center" py={4}>
                    <Typography variant="body2" sx={{ color: theme.tokens.textMuted }}>
                        {t('nui_stats.loading')}
                    </Typography>
                </Box>
            ) : (
                <>
                    <StatsGroup>
                        <GroupTitle>{t('nui_stats.group_basics')}</GroupTitle>
                        <TileGrid>
                            <Tile>
                                <TileIconBadge>
                                    <GroupsOutlined />
                                </TileIconBadge>
                                <Typography variant="caption" sx={{ color: theme.tokens.textMuted, ...tileLabelSx }}>
                                    {t('nui_stats.players_online')}
                                </Typography>
                                <Typography variant="h6" fontWeight={700} sx={{ color: theme.tokens.textPrimary, lineHeight: 1.2 }}>
                                    {stats ? `${stats.playerCount} / ${serverCtx.maxClients}` : '—'}
                                </Typography>
                            </Tile>
                            <Tile>
                                <TileIconBadge>
                                    <HubOutlined />
                                </TileIconBadge>
                                <Typography variant="caption" sx={{ color: theme.tokens.textMuted, ...tileLabelSx }}>
                                    {t('nui_stats.onesync')}
                                </Typography>
                                <Typography variant="h6" fontWeight={700} sx={{ color: theme.tokens.textPrimary, lineHeight: 1.2 }}>
                                    {oneSyncLabel}
                                </Typography>
                            </Tile>
                            <Tile>
                                <TileIconBadge>
                                    <ExtensionOutlined />
                                </TileIconBadge>
                                <Typography variant="caption" sx={{ color: theme.tokens.textMuted, ...tileLabelSx }}>
                                    {t('nui_stats.resources')}
                                </Typography>
                                <Typography variant="h6" fontWeight={700} sx={{ color: theme.tokens.textPrimary, lineHeight: 1.2 }}>
                                    {stats ? stats.resourceCount : '—'}
                                </Typography>
                            </Tile>
                            <Tile>
                                <TileIconBadge>
                                    <AccessTimeOutlined />
                                </TileIconBadge>
                                <Typography variant="caption" sx={{ color: theme.tokens.textMuted, ...tileLabelSx }}>
                                    {t('nui_stats.uptime')}
                                </Typography>
                                <Typography variant="h6" fontWeight={700} sx={{ color: theme.tokens.textPrimary, lineHeight: 1.2 }}>
                                    {stats ? formatUptime(stats.uptimeSeconds) : '—'}
                                </Typography>
                            </Tile>
                        </TileGrid>
                    </StatsGroup>

                    <StatsGroup>
                        <GroupTitle>{t('nui_stats.group_performance')}</GroupTitle>
                        <TileGrid sx={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                            <Tile>
                                <TileIconBadge>
                                    <SpeedOutlined />
                                </TileIconBadge>
                                <Typography variant="caption" sx={{ color: theme.tokens.textMuted, ...tileLabelSx }}>
                                    {t('nui_stats.cpu')}
                                </Typography>
                                <Typography variant="h6" fontWeight={700} sx={{ color: theme.tokens.textPrimary, lineHeight: 1.2 }}>
                                    {perf ? `${Math.round(perf.cpuUsage)}%` : '—'}
                                </Typography>
                            </Tile>
                            <Tile>
                                <TileIconBadge>
                                    <MemoryOutlined />
                                </TileIconBadge>
                                <Typography variant="caption" sx={{ color: theme.tokens.textMuted, ...tileLabelSx }}>
                                    {t('nui_stats.memory')}
                                </Typography>
                                <Typography variant="h6" fontWeight={700} sx={{ color: theme.tokens.textPrimary, lineHeight: 1.2 }}>
                                    {perf ? `${perf.memUsedGb.toFixed(1)} / ${perf.memTotalGb.toFixed(1)} GB` : '—'}
                                </Typography>
                            </Tile>
                        </TileGrid>
                    </StatsGroup>

                    <StatsGroup>
                        <GroupTitle>{t('nui_stats.group_admins')}</GroupTitle>
                        {stats && stats.admins.length > 0 ? (
                            stats.admins.map((admin) => (
                                <AdminRow key={admin.id}>
                                    <AdminAvatar>{initials(admin.username)}</AdminAvatar>
                                    <Typography
                                        variant="body2"
                                        sx={{
                                            flex: 1,
                                            minWidth: 0,
                                            fontWeight: 600,
                                            fontSize: '0.78rem',
                                            color: theme.tokens.textPrimary,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {admin.username}
                                        {admin.id === stats.youId && (
                                            <Typography component="span" sx={{ color: theme.tokens.accent, fontWeight: 700, fontSize: '0.7rem' }}>
                                                {' '}
                                                · {t('nui_stats.you')}
                                            </Typography>
                                        )}
                                    </Typography>
                                    {admin.fullAccess && <AccessChip>{t('nui_stats.full_access')}</AccessChip>}
                                </AdminRow>
                            ))
                        ) : (
                            <Typography variant="caption" sx={{ color: theme.tokens.textMuted }}>
                                {'—'}
                            </Typography>
                        )}
                    </StatsGroup>

                    <StatsGroup>
                        <GroupTitle>{t('nui_stats.group_world')}</GroupTitle>
                        <TileGrid sx={{ gridTemplateColumns: '1fr' }}>
                            <Tile sx={{ flexDirection: 'row', alignItems: 'center' }}>
                                <TileIconBadge>
                                    <WbTwilightOutlined />
                                </TileIconBadge>
                                <Box>
                                    <Typography variant="caption" sx={{ color: theme.tokens.textMuted, ...tileLabelSx }}>
                                        {t('nui_stats.time')}
                                    </Typography>
                                    <Typography variant="h6" fontWeight={700} sx={{ color: theme.tokens.textPrimary, lineHeight: 1.2 }}>
                                        {worldTime ? formatClock(worldTime) : '—'}
                                    </Typography>
                                </Box>
                            </Tile>
                        </TileGrid>
                    </StatsGroup>
                </>
            )}
        </RootStyled>
    );
};
