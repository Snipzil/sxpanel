import React, { useCallback, useEffect, useState } from 'react';
import { styled } from '@mui/material/styles';
import {
    Box,
    Button,
    Chip,
    FormControl,
    IconButton,
    InputLabel,
    MenuItem,
    Modal,
    Rating,
    Select,
    TextField,
    Typography,
} from '@mui/material';
import { Chat, Close, Image, Send, Star } from '@mui/icons-material';
import { useNuiEvent } from '../../hooks/useNuiEvent';
import { fetchNui } from '../../utils/fetchNui';
import { useSetListenForExit } from '../../state/keys.state';
import { theme } from '../../styles/theme';

// =============================================
// Types
// =============================================

type TicketStatus = 'open' | 'inReview' | 'resolved' | 'closed';

interface TicketMessage {
    id?: string;
    author: string;
    authorType: 'player' | 'admin' | 'discord';
    content: string;
    imageUrls?: string[];
    ts: number;
}

interface PlayerTicketSummary {
    id: string;
    status: TicketStatus;
    category: string;
    descriptionPreview: string;
    messageCount: number;
    unreadCount: number;
    tsCreated: number;
    awaitingFeedback?: boolean;
}

interface PlayerTarget {
    id: number;
    name: string;
}

type View = 'menu' | 'create' | 'list' | 'detail' | 'feedback';

// =============================================
// Styles
// =============================================

const Overlay = styled(Box)({
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    zIndex: 1200,
    color: theme.fg,
});

const Panel = styled(Box)({
    width: '100%',
    maxWidth: 480,
    maxHeight: '80vh',
    background: theme.bg,
    borderRadius: 12,
    border: `1px solid ${theme.border}`,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
});

const Header = styled(Box)({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 18px',
    borderBottom: `1px solid ${theme.border}`,
});

const Content = styled(Box)({
    flex: 1,
    overflow: 'auto',
    padding: '16px 18px',
});

const Footer = styled(Box)({
    padding: '12px 18px',
    borderTop: `1px solid ${theme.border}`,
    display: 'flex',
    gap: 8,
});

// =============================================
// Helpers
// =============================================

const STATUS_MAP: Record<TicketStatus, { label: string; color: string }> = {
    open: { label: 'Open', color: theme.warning },
    inReview: { label: 'In Review', color: theme.info },
    resolved: { label: 'Resolved', color: theme.success },
    closed: { label: 'Closed', color: theme.muted },
};

function timeAgo(ts: number): string {
    const tsSeconds = ts > 1e12 ? Math.floor(ts / 1000) : Math.floor(ts);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const diff = Math.max(0, nowSeconds - tsSeconds);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

const inputSx = {
    '& .MuiOutlinedInput-root': {
        color: theme.fg,
        '& fieldset': { borderColor: theme.border },
        '&:hover fieldset': { borderColor: theme.muted },
        '&.Mui-focused fieldset': { borderColor: theme.info },
    },
    '& .MuiInputLabel-root': { color: theme.muted },
    '& .MuiInputLabel-root.Mui-focused': { color: theme.info },
    '& .MuiFormHelperText-root': { color: theme.muted },
    '& .MuiSelect-icon': { color: theme.muted },
};

const menuPaperSx = {
    bgcolor: theme.card,
    color: theme.fg,
    border: `1px solid ${theme.border}`,
};

// =============================================
// Sub-components
// =============================================

const StatusChip: React.FC<{ status: TicketStatus; size?: 'small' | 'medium' }> = ({ status, size = 'small' }) => {
    const { label, color } = STATUS_MAP[status] ?? { label: status, color: theme.muted };
    return (
        <Chip
            label={label}
            size={size}
            variant="outlined"
            sx={{
                color,
                borderColor: color,
                fontWeight: 600,
                '& .MuiChip-label': { color },
            }}
        />
    );
};

const MenuView: React.FC<{
    onSelect: (view: View) => void;
    ticketCount: number;
}> = ({ onSelect, ticketCount }) => (
    <Box display="flex" flexDirection="column" gap={1.5}>
        <Typography variant="body2" sx={{ color: theme.muted, mb: 1 }}>
            What would you like to do?
        </Typography>
        <Button
            variant="outlined"
            onClick={() => onSelect('create')}
            sx={{
                justifyContent: 'flex-start',
                textTransform: 'none',
                py: 1.2,
                color: theme.fg,
                borderColor: theme.border,
                '&:hover': { borderColor: theme.muted, bgcolor: 'rgba(255,255,255,0.04)' },
            }}
        >
            Submit a New Ticket
        </Button>
        <Button
            variant="outlined"
            startIcon={<Chat />}
            onClick={() => onSelect('list')}
            sx={{
                justifyContent: 'flex-start',
                textTransform: 'none',
                py: 1.2,
                color: theme.fg,
                borderColor: theme.border,
                '&:hover': { borderColor: theme.muted, bgcolor: 'rgba(255,255,255,0.04)' },
            }}
        >
            My Tickets {ticketCount > 0 && `(${ticketCount})`}
        </Button>
    </Box>
);

const CreateView: React.FC<{
    players: PlayerTarget[];
    categories: string[];
    priorityEnabled: boolean;
    onSubmit: (category: string, description: string, targetIds: number[], priority?: string) => void;
    submitting: boolean;
}> = ({ players, categories, priorityEnabled, onSubmit, submitting }) => {
    const defaultCategory = categories[0] ?? '';
    const [category, setCategory] = useState(defaultCategory);
    const [description, setDescription] = useState('');
    const [selectedTargets, setSelectedTargets] = useState<number[]>([]);
    const [priority, setPriority] = useState('');

    // Sync category when categories prop changes
    useEffect(() => {
        setCategory((prev) => (categories.includes(prev) ? prev : (categories[0] ?? '')));
    }, [categories]);

    // Detect if this category sounds like a player report
    const isPlayerCategory = /player/i.test(category);

    const handleSubmit = () => {
        if (!description.trim()) return;
        onSubmit(category, description.trim(), selectedTargets, priority || undefined);
    };

    return (
        <Box display="flex" flexDirection="column" gap={2}>
            {categories.length > 0 && (
                <FormControl size="small" fullWidth sx={inputSx}>
                    <InputLabel>Category</InputLabel>
                    <Select
                        value={category}
                        label="Category"
                        onChange={(e) => {
                            setCategory(e.target.value);
                            if (!/player/i.test(e.target.value)) setSelectedTargets([]);
                        }}
                        MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                    >
                        {categories.map((cat) => (
                            <MenuItem key={cat} value={cat} sx={{ color: theme.fg }}>
                                {cat}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            )}

            {isPlayerCategory && players.length > 0 && (
                <FormControl size="small" fullWidth sx={inputSx}>
                    <InputLabel>Target Player(s)</InputLabel>
                    <Select
                        multiple
                        value={selectedTargets}
                        label="Target Player(s)"
                        onChange={(e) => setSelectedTargets(e.target.value as number[])}
                        renderValue={(selected) =>
                            (selected as number[])
                                .map((id) => {
                                    const p = players.find((player) => player.id === id);
                                    return p ? p.name : `#${id}`;
                                })
                                .join(', ')
                        }
                        MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                    >
                        {players.map((p) => (
                            <MenuItem key={p.id} value={p.id} sx={{ color: theme.fg }}>
                                [{p.id}] {p.name}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            )}

            {priorityEnabled && (
                <FormControl size="small" fullWidth sx={inputSx}>
                    <InputLabel>Priority (Optional)</InputLabel>
                    <Select
                        value={priority}
                        label="Priority (Optional)"
                        onChange={(e) => setPriority(e.target.value)}
                        MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                    >
                        <MenuItem value="" sx={{ color: theme.muted }}>
                            None
                        </MenuItem>
                        <MenuItem value="low" sx={{ color: theme.fg }}>
                            Low
                        </MenuItem>
                        <MenuItem value="medium" sx={{ color: theme.fg }}>
                            Medium
                        </MenuItem>
                        <MenuItem value="high" sx={{ color: theme.fg }}>
                            High
                        </MenuItem>
                        <MenuItem value="critical" sx={{ color: theme.destructive }}>
                            Critical
                        </MenuItem>
                    </Select>
                </FormControl>
            )}

            <TextField
                label="Description"
                multiline
                minRows={3}
                maxRows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 2048))}
                placeholder="Describe your issue in detail..."
                size="small"
                fullWidth
                helperText={`${description.length}/2048`}
                sx={inputSx}
            />

            <Button
                variant="contained"
                onClick={handleSubmit}
                disabled={submitting || !description.trim()}
                sx={{
                    textTransform: 'none',
                    bgcolor: theme.accent,
                    color: '#fff',
                    '&:hover': { bgcolor: theme.accent, filter: 'brightness(1.15)' },
                    '&.Mui-disabled': { bgcolor: theme.border, color: theme.muted },
                }}
            >
                {submitting ? 'Submitting...' : 'Submit Ticket'}
            </Button>
        </Box>
    );
};
const ListView: React.FC<{
    tickets: PlayerTicketSummary[];
    onSelect: (ticket: PlayerTicketSummary) => void;
}> = ({ tickets, onSelect }) => {
    if (tickets.length === 0) {
        return (
            <Box textAlign="center" py={4}>
                <Typography variant="body2" sx={{ color: theme.muted }}>
                    You have no tickets.
                </Typography>
            </Box>
        );
    }

    return (
        <Box display="flex" flexDirection="column" gap={1}>
            {tickets.map((t) => (
                <Box
                    key={t.id}
                    onClick={() => onSelect(t)}
                    sx={{
                        p: 1.5,
                        borderRadius: 1,
                        border: `1px solid ${t.awaitingFeedback ? theme.warning : theme.border}`,
                        bgcolor: theme.card,
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 0.5,
                    }}
                >
                    <Box display="flex" alignItems="center" justifyContent="space-between">
                        <Typography variant="body2" fontWeight={600} sx={{ color: theme.fg }}>
                            {t.category}
                        </Typography>
                        <Box display="flex" alignItems="center" gap={1}>
                            {t.unreadCount > 0 && (
                                <Chip
                                    label={`${t.unreadCount} new`}
                                    size="small"
                                    sx={{ height: 16, fontSize: '0.65rem', bgcolor: theme.info, color: '#fff' }}
                                />
                            )}
                            <StatusChip status={t.status} />
                        </Box>
                    </Box>
                    <Typography variant="body2" noWrap sx={{ color: theme.muted }}>
                        {t.descriptionPreview}
                    </Typography>
                    <Typography variant="caption" sx={{ color: t.awaitingFeedback ? theme.warning : theme.muted }}>
                        {t.awaitingFeedback
                            ? '⭐ Please rate your experience'
                            : `${timeAgo(t.tsCreated)} · ${t.messageCount} message${t.messageCount !== 1 ? 's' : ''}`}
                    </Typography>
                </Box>
            ))}
        </Box>
    );
};

const ImageLightbox: React.FC<{ url: string | null; onClose: () => void }> = ({ url, onClose }) => {
    const [hasError, setHasError] = useState(false);

    // Reset error state when URL changes
    React.useEffect(() => setHasError(false), [url]);

    return (
        <Modal open={!!url} onClose={onClose}>
            <Box
                onClick={onClose}
                sx={{
                    position: 'fixed',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'rgba(0,0,0,0.85)',
                    cursor: 'zoom-out',
                }}
            >
                {url &&
                    (hasError ? (
                        <Box
                            onClick={(e) => e.stopPropagation()}
                            sx={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 2,
                                p: 4,
                                borderRadius: 2,
                                bgcolor: 'background.paper',
                                cursor: 'default',
                            }}
                        >
                            <Typography color="text.secondary">Image failed to load</Typography>
                            <Button variant="outlined" size="small" onClick={onClose}>
                                Close
                            </Button>
                        </Box>
                    ) : (
                        <img
                            src={url}
                            alt="enlarged attachment"
                            referrerPolicy="no-referrer"
                            onClick={(e) => e.stopPropagation()}
                            onError={() => setHasError(true)}
                            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, cursor: 'default' }}
                        />
                    ))}
            </Box>
        </Modal>
    );
};

const DetailView: React.FC<{
    ticket: PlayerTicketSummary;
    messages: TicketMessage[];
    onSendMessage: (ticketId: string, content: string, imageUrls?: string[]) => void;
    sending: boolean;
}> = ({ ticket, messages, onSendMessage, sending }) => {
    const [msg, setMsg] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

    const URL_MAX = 2048;
    const canSend = (msg.trim().length > 0 || imageUrl.trim().length > 0) && imageUrl.trim().length <= URL_MAX;

    const handleSend = () => {
        if (!canSend) return;
        const urls = imageUrl.trim() ? [imageUrl.trim()] : undefined;
        onSendMessage(ticket.id, msg.trim(), urls);
        setMsg('');
        setImageUrl('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const isClosed = ticket.status === 'resolved' || ticket.status === 'closed';

    return (
        <Box display="flex" flexDirection="column" height="100%">
            <Box mb={2}>
                <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                    <Typography variant="body2" fontWeight={600} sx={{ color: theme.fg }}>
                        {ticket.category}
                    </Typography>
                    <StatusChip status={ticket.status} />
                </Box>
                <Typography variant="body2" sx={{ color: theme.muted, wordBreak: 'break-word' }}>
                    {ticket.descriptionPreview}
                </Typography>
            </Box>

            <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />

            <Box flex={1} overflow="auto" display="flex" flexDirection="column" gap={1} mb={2} sx={{ maxHeight: 300 }}>
                {messages.length === 0 ? (
                    <Typography variant="body2" sx={{ color: theme.muted, textAlign: 'center', py: 2 }}>
                        No messages yet. An admin will respond to your ticket.
                    </Typography>
                ) : (
                    messages.map((m, i) => (
                        <Box
                            key={m.id ?? `${m.ts}-${i}`}
                            sx={{
                                p: 1,
                                borderRadius: 1,
                                bgcolor: m.authorType === 'admin' ? 'rgba(43,155,197,0.1)' : 'rgba(255,255,255,0.04)',
                                borderLeft:
                                    m.authorType === 'admin' ? `3px solid ${theme.info}` : '3px solid transparent',
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
                                                bgcolor: 'rgba(43,155,197,0.15)',
                                                '& .MuiChip-label': { color: theme.info },
                                            }}
                                        />
                                    )}
                                </Typography>
                                <Typography variant="caption" sx={{ color: theme.muted }}>
                                    {timeAgo(m.ts)}
                                </Typography>
                            </Box>
                            {m.content && (
                                <Typography variant="body2" sx={{ color: theme.fg, wordBreak: 'break-word' }}>
                                    {m.content}
                                </Typography>
                            )}
                            {m.imageUrls && m.imageUrls.length > 0 && (
                                <Box mt={0.5} display="flex" flexWrap="wrap" gap={0.5}>
                                    {m.imageUrls.map((url, j) => (
                                        <img
                                            key={j}
                                            src={url}
                                            alt="attachment"
                                            loading="lazy"
                                            referrerPolicy="no-referrer"
                                            onClick={() => setLightboxUrl(url)}
                                            style={{
                                                maxHeight: 80,
                                                borderRadius: 4,
                                                border: `1px solid ${theme.border}`,
                                                cursor: 'zoom-in',
                                            }}
                                        />
                                    ))}
                                </Box>
                            )}
                        </Box>
                    ))
                )}
            </Box>

            {!isClosed && (
                <Box display="flex" flexDirection="column" gap={0.75}>
                    <Box display="flex" gap={1}>
                        <TextField
                            size="small"
                            fullWidth
                            placeholder="Type a message..."
                            value={msg}
                            onChange={(e) => setMsg(e.target.value.slice(0, 2048))}
                            onKeyDown={handleKeyDown}
                            disabled={sending}
                            sx={inputSx}
                        />
                        <IconButton
                            onClick={handleSend}
                            disabled={sending || !canSend}
                            size="small"
                            sx={{ color: theme.info }}
                        >
                            <Send />
                        </IconButton>
                    </Box>
                    <Box display="flex" alignItems="center" gap={0.75}>
                        <Image sx={{ fontSize: 16, color: theme.muted, flexShrink: 0 }} />
                        <TextField
                            size="small"
                            fullWidth
                            placeholder="Image URL (optional)"
                            value={imageUrl}
                            onChange={(e) => setImageUrl(e.target.value.slice(0, URL_MAX))}
                            disabled={sending}
                            inputProps={{ style: { fontSize: '0.75rem' }, maxLength: URL_MAX }}
                            sx={{
                                ...inputSx,
                                '& .MuiOutlinedInput-root': { ...inputSx['& .MuiOutlinedInput-root'], py: 0.25 },
                            }}
                        />
                    </Box>
                </Box>
            )}
            {isClosed && (
                <Typography variant="body2" sx={{ color: theme.success, textAlign: 'center' }}>
                    This ticket has been {ticket.status}.
                </Typography>
            )}
        </Box>
    );
};

const FeedbackView: React.FC<{
    ticketId: string;
    onSubmit: (ticketId: string, rating: number, comment?: string) => void;
    submitting: boolean;
}> = ({ ticketId, onSubmit, submitting }) => {
    const [rating, setRating] = useState<number | null>(null);
    const [comment, setComment] = useState('');

    return (
        <Box display="flex" flexDirection="column" gap={2} alignItems="center" py={2}>
            <Star sx={{ fontSize: 40, color: theme.warning }} />
            <Typography variant="body1" fontWeight={600} sx={{ color: theme.fg, textAlign: 'center' }}>
                How was your support experience?
            </Typography>
            <Rating size="large" value={rating} onChange={(_, val) => setRating(val)} sx={{ color: theme.warning }} />
            <TextField
                label="Comments (optional)"
                multiline
                rows={2}
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, 512))}
                fullWidth
                size="small"
                sx={inputSx}
            />
            <Button
                variant="contained"
                onClick={() => rating && onSubmit(ticketId, rating, comment || undefined)}
                disabled={!rating || submitting}
                sx={{
                    textTransform: 'none',
                    bgcolor: theme.accent,
                    color: '#fff',
                    '&:hover': { bgcolor: theme.accent, filter: 'brightness(1.15)' },
                    '&.Mui-disabled': { bgcolor: theme.border, color: theme.muted },
                }}
            >
                {submitting ? 'Submitting...' : 'Submit Feedback'}
            </Button>
        </Box>
    );
};

// =============================================
// Main Ticket Page
// =============================================

export const ReportPage: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [view, setView] = useState<View>('menu');
    const [players, setPlayers] = useState<PlayerTarget[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [priorityEnabled, setPriorityEnabled] = useState(false);
    const [tickets, setTickets] = useState<PlayerTicketSummary[]>([]);
    const [selectedTicket, setSelectedTicket] = useState<PlayerTicketSummary | null>(null);
    const [ticketMessages, setTicketMessages] = useState<TicketMessage[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [sendingMessage, setSendingMessage] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const setListenForExit = useSetListenForExit();

    const handleClose = useCallback(() => {
        setIsOpen(false);
        setView('menu');
        setSelectedTicket(null);
        setTicketMessages([]);
        setErrorMessage(null);
        setListenForExit(true);
        fetchNui('ticketClose').catch(() => {});
    }, [setListenForExit]);

    // Listen for open event from Lua
    useNuiEvent<{
        players: PlayerTarget[];
        tickets: PlayerTicketSummary[];
        categories: string[];
        priorityEnabled: boolean;
    }>('openTicketUI', (data) => {
        setPlayers(data.players || []);
        setCategories(data.categories || []);
        setPriorityEnabled(data.priorityEnabled ?? false);
        setIsOpen(true);
        setView('menu');
        setListenForExit(false);
    });

    // Listen for ticket list updates
    useNuiEvent<{ tickets?: PlayerTicketSummary[]; error?: string }>('ticketMyList', (data) => {
        if (data.tickets) {
            setTickets(data.tickets);
            if (selectedTicket) {
                const updated = data.tickets.find((t) => t.id === selectedTicket.id);
                if (updated) setSelectedTicket(updated);
            }
        }
    });

    // Listen for ticket creation result
    useNuiEvent<{ success?: boolean; ticketId?: string; error?: string }>('ticketCreateResult', (data) => {
        setSubmitting(false);
        if (data.success) {
            setErrorMessage(null);
            fetchNui('ticketFetchMine').catch(() => {});
            setView('list');
        } else if (data.error) {
            setErrorMessage(data.error);
        }
    });

    // Listen for message send result
    useNuiEvent<{ success?: boolean; error?: string }>('ticketMessageResult', (data) => {
        setSendingMessage(false);
        if (data.success) {
            setErrorMessage(null);
            fetchNui('ticketFetchMine').catch(() => {});
            if (selectedTicket) {
                fetchNui('ticketFetchMessages', { ticketId: selectedTicket.id }).catch(() => {});
            }
        } else if (data.error) {
            setErrorMessage(data.error);
        }
    });

    // Listen for full message list (fetched on ticket open)
    useNuiEvent<{ messages?: TicketMessage[]; error?: string }>('ticketMessages', (data) => {
        if (data.messages) setTicketMessages(data.messages);
    });

    // Listen for a real-time message push (from admin panel, in-game admin, or Discord)
    useNuiEvent<{ ticketId: string; message: TicketMessage }>('ticketNewMessage', (data) => {
        if (selectedTicket?.id === data.ticketId) {
            setTicketMessages((prev) => [...prev, data.message]);
        }
    });

    // ESC to close
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (view === 'feedback') {
                    setView('list');
                    setSelectedTicket(null);
                } else if (view === 'detail') {
                    setView('list');
                    setSelectedTicket(null);
                    setTicketMessages([]);
                } else if (view === 'create' || view === 'list') {
                    setView('menu');
                } else {
                    handleClose();
                }
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, view, handleClose]);

    const handleSubmit = (category: string, description: string, targetIds: number[], priority?: string) => {
        setSubmitting(true);
        setErrorMessage(null);
        fetchNui('ticketSubmit', { category, description, targetIds, priority }).catch((err) => {
            setSubmitting(false);
            setErrorMessage(`Failed to submit ticket: ${(err as Error).message || 'Unknown error'}`);
        });
    };

    const handleSendMessage = (ticketId: string, content: string, imageUrls?: string[]) => {
        setSendingMessage(true);
        setErrorMessage(null);
        fetchNui('ticketSendMessage', { ticketId, content, imageUrls }).catch((err) => {
            setSendingMessage(false);
            setErrorMessage(`Failed to send message: ${(err as Error).message || 'Unknown error'}`);
        });
    };

    const handleViewList = () => {
        setView('list');
        fetchNui('ticketFetchMine').catch(() => {});
    };

    const handleSelectTicket = (ticket: PlayerTicketSummary) => {
        setSelectedTicket(ticket);
        setTicketMessages([]);
        if (ticket.awaitingFeedback) {
            setView('feedback');
        } else {
            setView('detail');
            fetchNui('ticketFetchMessages', { ticketId: ticket.id }).catch(() => {});
        }
    };

    const handleFeedbackSubmit = (ticketId: string, rating: number, comment?: string) => {
        setSubmitting(true);
        fetchNui('ticketFeedback', { ticketId, rating, comment })
            .then(() => {
                setView('list');
                setSelectedTicket(null);
                fetchNui('ticketFetchMine').catch(() => {});
            })
            .catch((err) => {
                console.error('Failed to submit ticket feedback:', err);
                setErrorMessage((err as Error)?.message || 'Failed to submit feedback');
            })
            .finally(() => {
                setSubmitting(false);
            });
    };

    const getTitle = (): string => {
        switch (view) {
            case 'menu':
                return 'Support Tickets';
            case 'create':
                return 'New Ticket';
            case 'list':
                return 'My Tickets';
            case 'detail':
                return 'Ticket Detail';
            case 'feedback':
                return 'Rate Your Experience';
        }
    };

    const handleBack = () => {
        setErrorMessage(null);
        if (view === 'feedback' || view === 'detail') {
            setView('list');
            setSelectedTicket(null);
            setTicketMessages([]);
        } else if (view === 'create' || view === 'list') {
            setView('menu');
        }
    };

    return isOpen ? (
        <Overlay>
            <Panel role="dialog" aria-modal="true" aria-labelledby="ticket-dialog-title">
                <Header>
                    <Box display="flex" alignItems="center" gap={1}>
                        {view !== 'menu' && (
                            <Button
                                size="small"
                                onClick={handleBack}
                                sx={{ minWidth: 0, textTransform: 'none', mr: 0.5, color: theme.muted }}
                            >
                                Back
                            </Button>
                        )}
                        <Typography
                            id="ticket-dialog-title"
                            variant="subtitle1"
                            fontWeight={600}
                            sx={{ color: theme.fg }}
                        >
                            {getTitle()}
                        </Typography>
                    </Box>
                    <IconButton size="small" onClick={handleClose} sx={{ color: theme.muted }}>
                        <Close fontSize="small" />
                    </IconButton>
                </Header>

                <Content>
                    {errorMessage && (
                        <Box
                            role="alert"
                            sx={{ px: 2, py: 1, mb: 1, bgcolor: `${theme.destructive}26`, borderRadius: 1 }}
                        >
                            <Typography variant="body2" sx={{ color: theme.destructive }}>
                                {errorMessage}
                            </Typography>
                        </Box>
                    )}
                    {view === 'menu' && (
                        <MenuView
                            onSelect={(v) => {
                                if (v === 'list') handleViewList();
                                else setView(v);
                            }}
                            ticketCount={tickets.length}
                        />
                    )}
                    {view === 'create' && (
                        <CreateView
                            players={players}
                            categories={categories}
                            priorityEnabled={priorityEnabled}
                            onSubmit={handleSubmit}
                            submitting={submitting}
                        />
                    )}
                    {view === 'list' && <ListView tickets={tickets} onSelect={handleSelectTicket} />}
                    {view === 'detail' && selectedTicket && (
                        <DetailView
                            ticket={selectedTicket}
                            messages={ticketMessages}
                            onSendMessage={handleSendMessage}
                            sending={sendingMessage}
                        />
                    )}
                    {view === 'feedback' && selectedTicket && (
                        <FeedbackView
                            ticketId={selectedTicket.id}
                            onSubmit={handleFeedbackSubmit}
                            submitting={submitting}
                        />
                    )}
                </Content>
            </Panel>
        </Overlay>
    ) : null;
};
