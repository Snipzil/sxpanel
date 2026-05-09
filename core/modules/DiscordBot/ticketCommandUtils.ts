import { msToShortishDuration } from '@lib/misc';
import type { DatabaseTicketType, TicketPriority, TicketStatus } from '@shared/ticketApiTypes';
import { buildDiscordCardMessageFromEmbed } from './componentsV2';
import { translateDiscord } from './discordLocale';

const t = (key: string, data?: Record<string, unknown>) => {
    return translateDiscord(`tickets.${key}`, data);
};

const statusLabels: Record<TicketStatus, string> = {
    open: t('status_labels.open'),
    inReview: t('status_labels.in_review'),
    resolved: t('status_labels.resolved'),
    closed: t('status_labels.closed'),
};

const priorityLabels: Record<TicketPriority, string> = {
    low: t('priority_labels.low'),
    medium: t('priority_labels.medium'),
    high: t('priority_labels.high'),
    critical: t('priority_labels.critical'),
};

const defaultColor = 0x4262e2;
const ticketButtonPrefix = 'fxpanel:ticket:';
const discordComponentType = {
    actionRow: 1,
    button: 2,
} as const;
const discordButtonStyle = {
    primary: 1,
    secondary: 2,
    success: 3,
    danger: 4,
} as const;

type TicketSummaryEmbedOptions = {
    title?: string;
    note?: string;
    color?: number;
    footer?: Record<string, unknown>;
};

const truncateText = (value: string, maxLength: number) => {
    return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
};

export const escapeDiscordText = (value: string) => {
    return value.replace(/[\\*_~`|>[\]]/g, '\\$&');
};

const formatRelativeTimestamp = (ts?: number) => {
    return typeof ts === 'number' && Number.isFinite(ts) ? `<t:${Math.floor(ts)}:R>` : 'n/a';
};

const formatFullTimestamp = (ts?: number) => {
    return typeof ts === 'number' && Number.isFinite(ts) ? `<t:${Math.floor(ts)}:f>` : 'n/a';
};

const formatStatusLabel = (status: TicketStatus) => {
    return statusLabels[status] ?? status;
};

const formatPriorityLabel = (priority?: TicketPriority) => {
    return priority ? (priorityLabels[priority] ?? priority) : t('priority_labels.none');
};

const formatPlayerRef = (player: DatabaseTicketType['reporter']) => {
    const netIdPart = typeof player.netid === 'number' ? ` (#${player.netid})` : '';
    return `${escapeDiscordText(player.name)}${netIdPart}`;
};

const buildField = (name: string, value: string, inline = false) => {
    return {
        name,
        value: truncateText(value, 1024),
        inline,
    };
};

export const normalizeTicketCommandTicketId = (value: unknown) => {
    if (typeof value !== 'string') return null;

    const normalized = value.trim().toUpperCase();
    return normalized.length ? normalized : null;
};

export const buildTicketSummaryEmbed = (
    ticket: DatabaseTicketType,
    options?: TicketSummaryEmbedOptions,
) => {
    const descriptionParts = [] as string[];
    if (options?.note) {
        descriptionParts.push(options.note);
    }

    const ticketDescription = ticket.description.trim().length
        ? truncateText(escapeDiscordText(ticket.description.trim()), 1200)
        : t('summary.no_description');
    descriptionParts.push(ticketDescription);

    if (ticket.screenshotUrl) {
        descriptionParts.push(`[Screenshot](${ticket.screenshotUrl})`);
    }

    const targetsValue = ticket.targets.length
        ? ticket.targets.map((target) => formatPlayerRef(target)).join('\n')
        : t('summary.none');
    const resolvedValue = ticket.tsResolved
        ? `${formatRelativeTimestamp(ticket.tsResolved)} (${formatFullTimestamp(ticket.tsResolved)})`
        : t('summary.not_resolved');

    return {
        title: options?.title ?? `${ticket.id} · ${escapeDiscordText(ticket.category)}`,
        color: options?.color ?? defaultColor,
        description: descriptionParts.join('\n\n'),
        fields: [
            buildField(t('summary.fields.status'), formatStatusLabel(ticket.status), true),
            buildField(t('summary.fields.priority'), formatPriorityLabel(ticket.priority), true),
            buildField(
                t('summary.fields.claimed_by'),
                ticket.claimedBy ? escapeDiscordText(ticket.claimedBy) : t('summary.claimed_by_unassigned'),
                true,
            ),
            buildField(t('summary.fields.reporter'), formatPlayerRef(ticket.reporter), true),
            buildField(t('summary.fields.messages'), String(ticket.messages.length), true),
            buildField(t('summary.fields.staff_notes'), String(ticket.staffNotes.length), true),
            buildField(
                t('summary.fields.created'),
                `${formatRelativeTimestamp(ticket.tsCreated)} (${formatFullTimestamp(ticket.tsCreated)})`,
                true,
            ),
            buildField(
                t('summary.fields.last_activity'),
                `${formatRelativeTimestamp(ticket.tsLastActivity)} (${formatFullTimestamp(ticket.tsLastActivity)})`,
                true,
            ),
            buildField(t('summary.fields.resolved'), resolvedValue, true),
            buildField(t('summary.fields.targets'), targetsValue),
        ],
        ...(options?.footer ? { footer: options.footer } : {}),
    };
};

const buildTicketActionButton = (
    customId: string,
    label: string,
    style: number,
    disabled = false,
) => {
    return {
        type: discordComponentType.button,
        custom_id: customId,
        label,
        style,
        ...(disabled ? { disabled: true } : {}),
    };
};

export const buildTicketActionRows = (ticketId: string, status: TicketStatus) => {
    const isTerminal = status === 'resolved' || status === 'closed';

    return [
        {
            type: discordComponentType.actionRow,
            components: [
                buildTicketActionButton(
                    `${ticketButtonPrefix}summary:${ticketId}`,
                    t('buttons.refresh'),
                    discordButtonStyle.secondary,
                ),
                buildTicketActionButton(
                    `${ticketButtonPrefix}claim:${ticketId}`,
                    t('buttons.claim_unclaim'),
                    discordButtonStyle.secondary,
                ),
                buildTicketActionButton(
                    `${ticketButtonPrefix}assign:${ticketId}`,
                    t('buttons.assign'),
                    discordButtonStyle.primary,
                ),
                buildTicketActionButton(
                    `${ticketButtonPrefix}resolve:${ticketId}`,
                    t('buttons.resolve'),
                    discordButtonStyle.success,
                    isTerminal,
                ),
                buildTicketActionButton(
                    `${ticketButtonPrefix}reopen:${ticketId}`,
                    t('buttons.reopen'),
                    discordButtonStyle.secondary,
                    !isTerminal,
                ),
            ],
        },
    ];
};

export const buildTicketSummaryMessagePayload = (
    ticket: DatabaseTicketType,
    options?: TicketSummaryEmbedOptions,
) => {
    return buildDiscordCardMessageFromEmbed(buildTicketSummaryEmbed(ticket, options), {
        actionRows: buildTicketActionRows(ticket.id, ticket.status),
    });
};

export const buildTicketQueueSummaryEmbed = (
    analytics: {
        overview: {
            total: number;
            open: number;
            inReview: number;
            resolved: number;
            closed: number;
            avgResolutionMs: number;
        };
        byPriority: { priority: TicketPriority; count: number }[];
    },
    activeTickets: DatabaseTicketType[],
    options?: {
        title?: string;
        color?: number;
        footer?: Record<string, unknown>;
    },
) => {
    const priorityMap = new Map(analytics.byPriority.map((entry) => [entry.priority, entry.count]));
    const avgResolution = analytics.overview.avgResolutionMs > 0
        ? msToShortishDuration(analytics.overview.avgResolutionMs)
        : t('queue.not_available');

    const activeTicketLines = activeTickets.slice(0, 6).map((ticket) => {
        const priorityPrefix = ticket.priority ? `${formatPriorityLabel(ticket.priority)} • ` : '';
        const claimText = ticket.claimedBy
            ? t('queue.claimed_by', { name: escapeDiscordText(ticket.claimedBy) })
            : t('queue.unassigned');
        return truncateText(
            `• \`${ticket.id}\` • ${priorityPrefix}${formatStatusLabel(ticket.status)} • ${claimText} • ${escapeDiscordText(ticket.reporter.name)}`,
            160,
        );
    });

    const priorityLines = (['critical', 'high', 'medium', 'low'] as const)
        .map((priority) => `• ${t('queue.priority_line', {
            priority: formatPriorityLabel(priority),
            count: priorityMap.get(priority) ?? 0,
        })}`)
        .join('\n');

    return {
        title: options?.title ?? t('queue.title'),
        color: options?.color ?? defaultColor,
        description: t('queue.description'),
        fields: [
            buildField(
                t('queue.fields.queue'),
                [
                    `• ${t('queue.lines.total', { count: analytics.overview.total })}`,
                    `• ${t('queue.lines.open', { count: analytics.overview.open })}`,
                    `• ${t('queue.lines.in_review', { count: analytics.overview.inReview })}`,
                    `• ${t('queue.lines.resolved', { count: analytics.overview.resolved })}`,
                    `• ${t('queue.lines.closed', { count: analytics.overview.closed })}`,
                    `• ${t('queue.lines.avg_resolution', { value: avgResolution })}`,
                ].join('\n'),
            ),
            buildField(t('queue.fields.priority_mix'), priorityLines),
            buildField(
                t('queue.fields.active_tickets'),
                activeTicketLines.length ? activeTicketLines.join('\n') : t('queue.no_active_tickets'),
            ),
        ],
        ...(options?.footer ? { footer: options.footer } : {}),
    };
};