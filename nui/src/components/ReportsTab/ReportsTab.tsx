import React, { useCallback, useEffect, useState } from 'react';
import { styled } from '@mui/material/styles';
import {
    Box,
    Button,
    Chip,
    FormControl,
    IconButton,
    InputAdornment,
    InputLabel,
    MenuItem,
    Select,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import {
    ArrowBack,
    Archive,
    CheckCircle,
    Close,
    Inbox,
    LockOutlined,
    PlayArrow,
    RadioButtonUnchecked,
    Refresh,
    Search,
    Send,
} from '@mui/icons-material';
import { useNuiEvent } from '../../hooks/useNuiEvent';
import { fetchNui } from '../../utils/fetchNui';
import { txAdminMenuPage, usePageValue } from '../../state/page.state';
import { theme } from '../../styles/theme';

// =============================================
// Types
// =============================================

/** Allow HTTPS image URLs from any host that serve a known image file extension. */
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
function validateImageUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:') return false;
        const pathname = parsed.pathname.toLowerCase();
        return IMAGE_EXTENSIONS.some((ext) => pathname.endsWith(ext));
    } catch {
        return false;
    }
}

type TicketStatus = 'open' | 'inReview' | 'resolved' | 'closed';

interface TicketPlayerRef {
    license: string;
    name: string;
    netid: number;
}

interface TicketMessage {
    id?: string;
    author: string;
    authorType: 'player' | 'admin' | 'discord';
    content: string;
    ts: number;
    imageUrls?: string[];
}

interface TicketListItem {
    id: string;
    category: string;
    priority?: string;
    status: TicketStatus;
    reporterName: string;
    targetNames: string[];
    descriptionPreview: string;
    messageCount: number;
    unreadCount?: number;
    tsCreated: number;
    tsLastActivity: number;
    claimedBy?: string | null;
}

interface TicketDetail {
    id: string;
    category: string;
    priority?: string;
    status: TicketStatus;
    reporter: TicketPlayerRef;
    targets: TicketPlayerRef[];
    description: string;
    messages: TicketMessage[];
    tsCreated: number;
    tsResolved?: number | null;
    resolvedBy?: string | null;
    claimedBy?: string | null;
}

// =============================================
// Styles
// =============================================

const RootStyled = styled(Box)({
    backgroundColor: theme.bg,
    color: theme.fg,
    height: '50vh',
    borderRadius: 15,
    flex: 1,
    flexDirection: 'column',
});

const ListContainer = styled(Box)({
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
});

// =============================================
// Helpers
// =============================================

const STATUS_CHIP_COLORS: Record<TicketStatus, { bg: string; border: string; text: string }> = {
    open: { bg: 'rgba(255, 174, 0, 0.12)', border: theme.warning, text: theme.warning },
    inReview: { bg: 'rgba(43, 155, 197, 0.12)', border: theme.info, text: theme.info },
    resolved: { bg: 'rgba(1, 163, 112, 0.12)', border: theme.success, text: theme.success },
    closed: { bg: 'rgba(130, 130, 130, 0.12)', border: theme.muted, text: theme.muted },
};

const STATUS_LABELS: Record<TicketStatus, string> = {
    open: 'Open',
    inReview: 'In Review',
    resolved: 'Resolved',
    closed: 'Closed',
};

function formatDate(ts: number): string {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// =============================================
// Status Chip
// =============================================

const StatusChip: React.FC<{ status: TicketStatus }> = ({ status }) => {
    const colors = STATUS_CHIP_COLORS[status];
    return (
        <Chip
            label={STATUS_LABELS[status]}
            size="small"
            variant="outlined"
            sx={{
                height: 20,
                fontSize: '0.7rem',
                color: colors.text,
                borderColor: colors.border,
                bgcolor: colors.bg,
            }}
        />
    );
};

// =============================================
// Detail View
// =============================================

const TicketDetailView: React.FC<{
    ticket: TicketDetail;
    onBack: () => void;
    onSendMessage: (content: string) => void;
    onStatusChange: (status: TicketStatus) => void;
    sendingMessage: boolean;
    changingStatus: boolean;
}> = ({ ticket, onBack, onSendMessage, onStatusChange, sendingMessage, changingStatus }) => {
    const [msgText, setMsgText] = useState('');

    const handleSend = () => {
        if (!msgText.trim()) return;
        onSendMessage(msgText.trim());
        setMsgText('');
    };

    const isTerminal = ticket.status === 'resolved' || ticket.status === 'closed';

    return (
        <Box display="flex" flexDirection="column" flex={1} minHeight={0} color={theme.fg}>
            {/* Header */}
            <Box display="flex" alignItems="center" gap={1} mb={1}>
                <IconButton size="small" onClick={onBack} sx={{ color: theme.fg }}>
                    <ArrowBack fontSize="small" />
                </IconButton>
                <Typography variant="subtitle2" fontWeight={600} sx={{ color: theme.fg }}>
                    Ticket {ticket.id}
                </Typography>
                <StatusChip status={ticket.status} />
                {ticket.claimedBy && (
                    <Chip
                        label={`Claimed by ${ticket.claimedBy}`}
                        size="small"
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.7rem', color: theme.info, borderColor: theme.info }}
                    />
                )}
            </Box>

            {/* Info bar */}
            <Box mb={1} p={1} sx={{ border: `1px solid ${theme.border}`, borderRadius: 1, bgcolor: theme.card }}>
                <Box display="flex" flexWrap="wrap" gap={1} alignItems="center" mb={0.5}>
                    <Chip
                        label={ticket.category}
                        size="small"
                        variant="outlined"
                        sx={{ height: 18, fontSize: '0.7rem', color: theme.muted, borderColor: theme.border }}
                    />
                    {ticket.priority && (
                        <Chip
                            label={ticket.priority}
                            size="small"
                            variant="outlined"
                            sx={{
                                height: 18,
                                fontSize: '0.7rem',
                                color:
                                    ticket.priority === 'high'
                                        ? theme.destructive
                                        : ticket.priority === 'medium'
                                          ? theme.warning
                                          : theme.muted,
                                borderColor:
                                    ticket.priority === 'high'
                                        ? theme.destructive
                                        : ticket.priority === 'medium'
                                          ? theme.warning
                                          : theme.border,
                            }}
                        />
                    )}
                    <Typography variant="caption" sx={{ color: theme.muted }}>
                        ·
                    </Typography>
                    <Typography variant="caption" sx={{ color: theme.muted }}>
                        by <strong style={{ color: theme.fg }}>{ticket.reporter.name}</strong> (#{ticket.reporter.netid}
                        )
                    </Typography>
                    {ticket.targets.length > 0 && (
                        <>
                            <Typography variant="caption" sx={{ color: theme.muted }}>
                                →
                            </Typography>
                            <Typography variant="caption" sx={{ color: theme.muted }}>
                                {ticket.targets.map((t) => `${t.name} (#${t.netid})`).join(', ')}
                            </Typography>
                        </>
                    )}
                </Box>
                <Typography variant="body2" sx={{ wordBreak: 'break-word', color: theme.fg }}>
                    {ticket.description}
                </Typography>
                <Typography variant="caption" sx={{ color: theme.muted }} mt={0.5} display="block">
                    Created {formatDate(ticket.tsCreated)}
                    {ticket.tsResolved ? ` · Resolved ${formatDate(ticket.tsResolved)}` : ''}
                    {ticket.resolvedBy ? ` by ${ticket.resolvedBy}` : ''}
                </Typography>
            </Box>

            {/* Messages */}
            <Box flex={1} minHeight={0} overflow="auto" display="flex" flexDirection="column" gap={0.75} mb={1}>
                {ticket.messages.length === 0 && (
                    <Typography variant="body2" sx={{ color: theme.muted }} textAlign="center" py={2}>
                        No messages yet. Send a reply below.
                    </Typography>
                )}

                {ticket.messages.map((m, i) => (
                    <Box
                        key={m.id ?? i}
                        sx={{
                            p: 1,
                            borderRadius: 1,
                            bgcolor: m.authorType === 'admin' ? `${theme.info}14` : theme.card,
                            borderLeft: m.authorType === 'admin' ? `3px solid ${theme.info}` : '3px solid transparent',
                            ml: m.authorType === 'admin' ? 2 : 0,
                            mr: m.authorType === 'admin' ? 0 : 2,
                        }}
                    >
                        <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.25}>
                            <Typography variant="caption" fontWeight={600} sx={{ color: theme.fg }}>
                                {m.author}
                                {m.authorType === 'admin' && (
                                    <Chip
                                        label="Staff"
                                        size="small"
                                        sx={{
                                            ml: 0.5,
                                            height: 16,
                                            fontSize: '0.65rem',
                                            color: theme.info,
                                            borderColor: theme.info,
                                            bgcolor: `${theme.info}1A`,
                                        }}
                                        variant="outlined"
                                    />
                                )}
                            </Typography>
                            <Typography variant="caption" sx={{ color: theme.muted }}>
                                {formatDate(m.ts)}
                            </Typography>
                        </Box>
                        <Typography variant="body2" sx={{ wordBreak: 'break-word', color: theme.fg }}>
                            {m.content}
                        </Typography>
                        {m.imageUrls && m.imageUrls.length > 0 && (
                            <Box display="flex" flexWrap="wrap" gap={0.5} mt={0.5}>
                                {m.imageUrls.filter(validateImageUrl).map((url, idx) => (
                                    <Box
                                        key={idx}
                                        component="img"
                                        src={url}
                                        alt="attachment"
                                        sx={{
                                            maxHeight: 80,
                                            maxWidth: 120,
                                            borderRadius: 0.5,
                                            border: `1px solid ${theme.border}`,
                                        }}
                                    />
                                ))}
                            </Box>
                        )}
                    </Box>
                ))}
            </Box>

            {/* Reply box — hidden for terminal statuses */}
            {!isTerminal && (
                <Box display="flex" gap={1} mb={1}>
                    <TextField
                        size="small"
                        fullWidth
                        placeholder="Type a reply..."
                        value={msgText}
                        onChange={(e) => setMsgText(e.target.value.slice(0, 512))}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        disabled={sendingMessage}
                        sx={{
                            '& .MuiInputBase-input': { color: theme.fg },
                            '& .MuiOutlinedInput-root': {
                                '& fieldset': { borderColor: theme.border },
                                '&:hover fieldset': { borderColor: theme.muted },
                            },
                        }}
                    />
                    <IconButton
                        onClick={handleSend}
                        disabled={sendingMessage || !msgText.trim()}
                        size="small"
                        sx={{ color: theme.info }}
                    >
                        <Send />
                    </IconButton>
                </Box>
            )}

            {/* Status controls */}
            <Box display="flex" alignItems="center" justifyContent="flex-end" gap={1} pb={1}>
                {ticket.status === 'open' && (
                    <Button
                        size="small"
                        variant="outlined"
                        startIcon={<PlayArrow />}
                        onClick={() => onStatusChange('inReview')}
                        disabled={changingStatus}
                        sx={{ textTransform: 'none', color: theme.info, borderColor: theme.info }}
                    >
                        Start Review
                    </Button>
                )}
                {(ticket.status === 'open' || ticket.status === 'inReview') && (
                    <Button
                        size="small"
                        variant="contained"
                        startIcon={<CheckCircle />}
                        onClick={() => onStatusChange('resolved')}
                        disabled={changingStatus}
                        sx={{
                            textTransform: 'none',
                            bgcolor: theme.success,
                            color: '#fff',
                            '&:hover': { bgcolor: '#00875c' },
                        }}
                    >
                        Resolve
                    </Button>
                )}
                {(ticket.status === 'open' || ticket.status === 'inReview') && (
                    <Tooltip title="Close without resolving">
                        <Button
                            size="small"
                            variant="outlined"
                            startIcon={<LockOutlined />}
                            onClick={() => onStatusChange('closed')}
                            disabled={changingStatus}
                            sx={{ textTransform: 'none', color: theme.muted, borderColor: theme.border }}
                        >
                            Close
                        </Button>
                    </Tooltip>
                )}
                {(ticket.status === 'resolved' || ticket.status === 'closed') && (
                    <Button
                        size="small"
                        variant="outlined"
                        startIcon={<RadioButtonUnchecked />}
                        onClick={() => onStatusChange('open')}
                        disabled={changingStatus}
                        sx={{ textTransform: 'none', color: theme.muted, borderColor: theme.border }}
                    >
                        Reopen
                    </Button>
                )}
            </Box>
        </Box>
    );
};
// =============================================
// Main Tickets Tab (Admin View)
// =============================================

export const ReportsTab: React.FC<{ visible: boolean }> = ({ visible }) => {
    const curPage = usePageValue();

    // List state
    const [tickets, setTickets] = useState<TicketListItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [showArchive, setShowArchive] = useState(false);

    // Detail state
    const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
    const [ticketDetail, setTicketDetail] = useState<TicketDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [sendingMessage, setSendingMessage] = useState(false);
    const [changingStatus, setChangingStatus] = useState(false);
    const [ticketError, setTicketError] = useState<string | null>(null);

    // Notification state
    const [notification, setNotification] = useState<{ ticketId: string; reporterName: string } | null>(null);

    const handleRefresh = useCallback(() => {
        setLoading(true);
        fetchNui('ticketAdminList').catch((err) => {
            setLoading(false);
            setTicketError(`Failed to fetch tickets: ${err instanceof Error ? err.message : String(err)}`);
        });
    }, []);

    // Fetch when tab becomes visible
    useEffect(() => {
        if (curPage !== txAdminMenuPage.Reports) return;
        handleRefresh();
    }, [curPage, handleRefresh]);

    // Listen for admin ticket list
    useNuiEvent<{ tickets?: TicketListItem[]; error?: string }>('ticketAdminListData', (data) => {
        setLoading(false);
        if (data.error) {
            setTicketError(data.error);
            return;
        }
        setTicketError(null);
        if (data.tickets) setTickets(data.tickets);
    });

    // Listen for admin ticket detail
    useNuiEvent<{ ticket?: TicketDetail; error?: string }>('ticketAdminDetailData', (data) => {
        setDetailLoading(false);
        if (data.error) {
            setTicketError(data.error);
            return;
        }
        setTicketError(null);
        if (data.ticket) setTicketDetail(data.ticket);
    });

    // Listen for admin message result
    useNuiEvent<{ success?: boolean; error?: string }>('ticketAdminMessageResult', (data) => {
        setSendingMessage(false);
        if (data.error) {
            setTicketError(data.error);
            return;
        }
        setTicketError(null);
        if (data.success && selectedTicketId) {
            setDetailLoading(true);
            fetchNui('ticketAdminDetail', { ticketId: selectedTicketId }).catch(() => setDetailLoading(false));
        }
    });

    // Listen for admin status result
    useNuiEvent<{ success?: boolean; error?: string }>('ticketAdminStatusResult', (data) => {
        setChangingStatus(false);
        if (data.error) {
            setTicketError(data.error);
            return;
        }
        setTicketError(null);
        if (data.success && selectedTicketId) {
            setDetailLoading(true);
            fetchNui('ticketAdminDetail', { ticketId: selectedTicketId }).catch(() => setDetailLoading(false));
            fetchNui('ticketAdminList').catch(() => {});
        }
    });

    // Listen for new ticket notifications
    useNuiEvent<{ ticketId: string; reporterName: string }>('ticketNotification', (data) => {
        setNotification(data);
    });

    const handleOpenDetail = (ticketId: string) => {
        setSelectedTicketId(ticketId);
        setTicketDetail(null);
        setDetailLoading(true);
        fetchNui('ticketAdminDetail', { ticketId }).catch(() => setDetailLoading(false));
    };

    const handleBack = () => {
        setSelectedTicketId(null);
        setTicketDetail(null);
        handleRefresh();
    };

    const handleSendMessage = (content: string) => {
        if (!selectedTicketId) return;
        setSendingMessage(true);
        fetchNui('ticketAdminMessage', { ticketId: selectedTicketId, content }).catch(() => setSendingMessage(false));
    };

    const handleStatusChange = (status: TicketStatus) => {
        if (!selectedTicketId) return;
        setChangingStatus(true);
        fetchNui('ticketAdminStatus', { ticketId: selectedTicketId, status }).catch(() => setChangingStatus(false));
    };

    // Filter logic — archive = resolved + closed, active = open + inReview
    const activeTickets = tickets.filter((t) => t.status === 'open' || t.status === 'inReview');
    const archivedTickets = tickets.filter((t) => t.status === 'resolved' || t.status === 'closed');
    const baseList = showArchive ? archivedTickets : activeTickets;

    const filtered = baseList.filter((t) => {
        if (!showArchive && statusFilter !== 'all' && t.status !== statusFilter) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (
                t.id.toLowerCase().includes(q) ||
                t.category.toLowerCase().includes(q) ||
                t.reporterName.toLowerCase().includes(q) ||
                t.descriptionPreview.toLowerCase().includes(q) ||
                t.targetNames.some((name) => name.toLowerCase().includes(q))
            );
        }
        return true;
    });

    return (
        <RootStyled mt={2} mb={10} pt={2} px={2} display={visible ? 'flex' : 'none'}>
            {/* Error banner */}
            {ticketError && (
                <Box
                    sx={{
                        backgroundColor: theme.destructive + '22',
                        border: `1px solid ${theme.destructive}`,
                        borderRadius: 1,
                        px: 2,
                        py: 1,
                        mb: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                >
                    <Typography variant="body2" sx={{ color: theme.destructive }}>
                        {ticketError}
                    </Typography>
                    <IconButton size="small" onClick={() => setTicketError(null)} sx={{ color: theme.destructive }}>
                        &times;
                    </IconButton>
                </Box>
            )}

            {/* New ticket notification banner */}
            {notification && (
                <Box
                    sx={{
                        backgroundColor: theme.info + '22',
                        border: `1px solid ${theme.info}`,
                        borderRadius: 1,
                        px: 2,
                        py: 0.75,
                        mb: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                    }}
                    onClick={() => {
                        handleOpenDetail(notification.ticketId);
                        setNotification(null);
                    }}
                >
                    <Typography variant="body2" sx={{ color: theme.info }}>
                        New ticket from <strong>{notification.reporterName}</strong> — click to view
                    </Typography>
                    <IconButton
                        size="small"
                        onClick={(e) => {
                            e.stopPropagation();
                            setNotification(null);
                        }}
                        sx={{ color: theme.info }}
                    >
                        <Close fontSize="small" />
                    </IconButton>
                </Box>
            )}

            {/* Detail view */}
            {selectedTicketId !== null ? (
                detailLoading || !ticketDetail ? (
                    <Box display="flex" justifyContent="center" alignItems="center" flex={1}>
                        <Typography variant="body2" sx={{ color: theme.muted }}>
                            Loading ticket...
                        </Typography>
                    </Box>
                ) : (
                    <TicketDetailView
                        ticket={ticketDetail}
                        onBack={handleBack}
                        onSendMessage={handleSendMessage}
                        onStatusChange={handleStatusChange}
                        sendingMessage={sendingMessage}
                        changingStatus={changingStatus}
                    />
                )
            ) : (
                /* List view */
                <>
                    {/* Header */}
                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                        <Box display="flex" alignItems="center" gap={1}>
                            <Typography variant="subtitle2" fontWeight={600} sx={{ color: theme.fg }}>
                                {showArchive ? 'Archived Tickets' : 'Tickets'}
                            </Typography>
                            <Chip
                                label={`${showArchive ? archivedTickets.length : activeTickets.length} ${showArchive ? 'archived' : 'active'}`}
                                size="small"
                                variant="outlined"
                                sx={{ color: theme.muted, borderColor: theme.border }}
                            />
                        </Box>
                        <Box display="flex" gap={0.5}>
                            <IconButton
                                size="small"
                                onClick={() => {
                                    setShowArchive(!showArchive);
                                    setStatusFilter('all');
                                }}
                                title={showArchive ? 'Show active' : 'Show archive'}
                                sx={{ color: theme.muted }}
                            >
                                {showArchive ? <Inbox fontSize="small" /> : <Archive fontSize="small" />}
                            </IconButton>
                            <IconButton
                                size="small"
                                onClick={handleRefresh}
                                disabled={loading}
                                title="Refresh"
                                sx={{ color: theme.muted }}
                            >
                                <Refresh fontSize="small" />
                            </IconButton>
                        </Box>
                    </Box>

                    {/* Filters */}
                    <Box display="flex" gap={1} mb={1}>
                        <TextField
                            size="small"
                            placeholder="Search tickets..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            sx={{
                                flex: 1,
                                '& .MuiInputBase-input': { color: theme.fg },
                                '& .MuiInputBase-input::placeholder': { color: theme.muted, opacity: 1 },
                                '& .MuiOutlinedInput-root': {
                                    '& fieldset': { borderColor: theme.border },
                                    '&:hover fieldset': { borderColor: theme.muted },
                                },
                            }}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <Search fontSize="small" sx={{ color: theme.muted }} />
                                    </InputAdornment>
                                ),
                            }}
                        />
                        {!showArchive && (
                            <FormControl size="small" sx={{ minWidth: 110 }}>
                                <InputLabel sx={{ color: theme.muted }}>Status</InputLabel>
                                <Select
                                    value={statusFilter}
                                    label="Status"
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    sx={{
                                        color: theme.fg,
                                        '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.border },
                                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: theme.muted },
                                        '& .MuiSvgIcon-root': { color: theme.muted },
                                    }}
                                >
                                    <MenuItem value="all">All</MenuItem>
                                    <MenuItem value="open">Open</MenuItem>
                                    <MenuItem value="inReview">In Review</MenuItem>
                                </Select>
                            </FormControl>
                        )}
                    </Box>

                    {/* Ticket list */}
                    <ListContainer>
                        {loading ? (
                            <Box textAlign="center" py={4}>
                                <Typography variant="body2" sx={{ color: theme.muted }}>
                                    Loading tickets...
                                </Typography>
                            </Box>
                        ) : filtered.length === 0 ? (
                            <Box textAlign="center" py={4}>
                                <Typography variant="body2" sx={{ color: theme.muted }}>
                                    {baseList.length === 0
                                        ? showArchive
                                            ? 'No archived tickets.'
                                            : 'No open tickets.'
                                        : 'No tickets match your filters.'}
                                </Typography>
                            </Box>
                        ) : (
                            filtered.map((t) => (
                                <Box
                                    key={t.id}
                                    onClick={() => handleOpenDetail(t.id)}
                                    sx={{
                                        p: 1.5,
                                        borderRadius: 1,
                                        border: `1px solid ${t.unreadCount ? theme.info : theme.border}`,
                                        bgcolor: theme.card,
                                        cursor: 'pointer',
                                        '&:hover': { bgcolor: '#232738' },
                                    }}
                                >
                                    {/* Row 1: id, status, category, date */}
                                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.25}>
                                        <Box display="flex" alignItems="center" gap={1}>
                                            <Typography
                                                variant="caption"
                                                fontFamily="monospace"
                                                fontWeight={600}
                                                sx={{ color: theme.fg }}
                                            >
                                                {t.id}
                                            </Typography>
                                            <StatusChip status={t.status} />
                                            <Chip
                                                label={t.category}
                                                size="small"
                                                variant="outlined"
                                                sx={{
                                                    height: 18,
                                                    fontSize: '0.65rem',
                                                    color: theme.muted,
                                                    borderColor: theme.border,
                                                }}
                                            />
                                            {(t.unreadCount ?? 0) > 0 && (
                                                <Chip
                                                    label={`${t.unreadCount} new`}
                                                    size="small"
                                                    sx={{
                                                        height: 18,
                                                        fontSize: '0.65rem',
                                                        bgcolor: theme.info,
                                                        color: '#fff',
                                                    }}
                                                />
                                            )}
                                        </Box>
                                        <Typography variant="caption" sx={{ color: theme.muted }}>
                                            {formatDate(t.tsCreated)}
                                        </Typography>
                                    </Box>
                                    {/* Row 2: reporter → targets + claim info */}
                                    <Box display="flex" alignItems="center" justifyContent="space-between">
                                        <Box>
                                            <Typography component="span" variant="body2" sx={{ color: theme.muted }}>
                                                by{' '}
                                            </Typography>
                                            <Typography
                                                component="span"
                                                variant="body2"
                                                fontWeight={600}
                                                sx={{ color: theme.fg }}
                                            >
                                                {t.reporterName}
                                            </Typography>
                                            {t.targetNames.length > 0 && (
                                                <>
                                                    <Typography
                                                        component="span"
                                                        variant="body2"
                                                        sx={{ color: theme.muted }}
                                                    >
                                                        {' '}
                                                        →{' '}
                                                    </Typography>
                                                    <Typography
                                                        component="span"
                                                        variant="body2"
                                                        fontWeight={600}
                                                        sx={{ color: theme.fg }}
                                                    >
                                                        {t.targetNames.join(', ')}
                                                    </Typography>
                                                </>
                                            )}
                                        </Box>
                                        <Box display="flex" gap={1}>
                                            {t.messageCount > 0 && (
                                                <Typography variant="caption" sx={{ color: theme.muted }}>
                                                    {t.messageCount} msg{t.messageCount !== 1 ? 's' : ''}
                                                </Typography>
                                            )}
                                            {t.claimedBy && (
                                                <Typography variant="caption" sx={{ color: theme.info }}>
                                                    {t.claimedBy}
                                                </Typography>
                                            )}
                                        </Box>
                                    </Box>
                                    {/* Row 3: description preview */}
                                    <Typography variant="body2" noWrap mt={0.25} sx={{ color: theme.muted }}>
                                        {t.descriptionPreview ?? ''}
                                    </Typography>
                                </Box>
                            ))
                        )}
                    </ListContainer>
                </>
            )}
        </RootStyled>
    );
};
