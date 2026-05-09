const modulename = 'WebServer:Reports';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import consoleFactory from '@lib/console';
import { txEnv } from '@core/globalData';
import { AuthedCtx, InitializedCtx } from '@modules/WebServer/ctxTypes';
import { now } from '@lib/misc';
import type {
    ApiGetTicketListResp,
    ApiGetTicketDetailResp,
    ApiTicketDeleteResp,
    ApiTicketMessageResp,
    ApiTicketStatusResp,
    ApiTicketNoteResp,
    ApiTicketClaimResp,
    ApiTicketRetentionExclusionResp,
    ApiGetAnalyticsResp,
    ApiGetTicketConfigResp,
    ApiCreateTicketResp,
    ApiGetPlayerTicketsResp,
    TicketListItem,
    TicketLogEntry,
    TicketStatus,
    TicketMessage,
    IntercomTicketCreateReq,
    IntercomFeedbackReq,
    PlayerTicketSummary,
} from '@shared/ticketApiTypes';
import type { TicketActivityEntry } from '@shared/ticketApiTypes';
const console = consoleFactory(modulename);

//Consts
const LOG_CONTEXT_WINDOW = 5 * 60; //5 minutes in seconds
const SCREENSHOT_DIR = () => txEnv.profileSubPath('data', 'ticket-screenshots');
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024; // 5 MiB

/** Escape Discord markdown special characters to prevent abuse via user-controlled strings. */
const escapeDiscordMd = (s: string) => s.replace(/[\\*_~`|>[\]]/g, '\\$&');
const ALLOWED_IMAGE_MIMES: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
};
const EXT_TO_MIME: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
};

/**
 * Sanitises a list of message image URLs: keeps only well-formed http(s) URLs
 * and caps the result at 3 entries. Returns `undefined` when the input is not
 * an array or no valid URLs survive (so the field is omitted in storage).
 */
const sanitizeMessageImageUrls = (input: unknown): string[] | undefined => {
    if (!Array.isArray(input)) return undefined;
    const sanitized: string[] = [];
    for (const u of input) {
        if (typeof u !== 'string') continue;
        const trimmed = u.trim();
        if (!/^https?:\/\//i.test(trimmed)) continue;
        try {
            const parsed = new URL(trimmed);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
            sanitized.push(parsed.toString());
            if (sanitized.length >= 3) break;
        } catch {
            // not a parseable URL — skip
        }
    }
    return sanitized.length ? sanitized : undefined;
};

// - -  Helper - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 

/**
 * Pulls server log entries from the recent buffer within the time window
 */
const pullLogContext = (reporterNetid: number, targetNetids: number[], tsReport: number) => {
    const windowStart = tsReport - LOG_CONTEXT_WINDOW;
    const allLogs: any[] = txCore.logger.server.getRecentBuffer(500);

    const reporterLogs: TicketLogEntry[] = [];
    const targetLogs: TicketLogEntry[] = [];
    const worldLogs: TicketLogEntry[] = [];

    for (const entry of allLogs) {
        if (entry.ts < windowStart || entry.ts > tsReport) continue;

        const srcId = entry.src?.id;
        if (srcId !== false && String(srcId) === String(reporterNetid)) {
            reporterLogs.push(entry);
        } else if (srcId !== false && targetNetids.includes(Number(srcId))) {
            targetLogs.push(entry);
        } else if (entry.type === 'DeathNotice' || entry.type === 'explosionEvent' || entry.type === 'ChatMessage') {
            worldLogs.push(entry);
        }
    }

    return { reporter: reporterLogs, targets: targetLogs, world: worldLogs };
};

/**
 * Sends a Discord thread notification for a new/updated ticket
 */
const sendDiscordThreadCreate = async (ticketId: string) => {
    const cfg = txConfig.discordBot;
    if (!cfg.ticketThreadNotifyEnabled || !cfg.ticketChannelId || !cfg.enabled) return;

    const ticket = txCore.database.tickets.findOne(ticketId);
    if (!ticket) return;

    const priorityText = ticket.priority ? ` [${ticket.priority.toUpperCase()}]` : '';
    const threadName = `${priorityText}${ticket.category} - ${ticketId}`.slice(0, 100);

    // Load the screenshot file so it can be uploaded directly to Discord
    let screenshotBuffer: Buffer | undefined;
    if (ticket.screenshotUrl) {
        const screenshotId = ticket.screenshotUrl.split('/').pop();
        if (screenshotId) {
            const filePath = path.join(SCREENSHOT_DIR(), `${screenshotId}.png`);
            try {
                screenshotBuffer = await fsp.readFile(filePath);
            } catch {
                // Try without hardcoded extension (new format includes extension in screenshotId)
                try {
                    screenshotBuffer = await fsp.readFile(path.join(SCREENSHOT_DIR(), screenshotId));
                } catch {
                    // Screenshot missing from disk — skip silently
                }
            }
        }
    }

    try {
        await txCore.discordBot.createTicketThread(cfg.ticketChannelId, threadName, ticket, screenshotBuffer);
    } catch (error) {
        console.verbose.warn(`Failed to create Discord thread for ${ticketId}: ${emsg(error)}`);
    }
};

/**
 * Pushes a new message to the reporter's in-game NUI via FXRunner event (fire-and-forget)
 */
const notifyPlayerNewMessage = (ticketId: string, message: Omit<TicketMessage, 'id'>) => {
    const ticket = txCore.database.tickets.findOne(ticketId);
    if (!ticket) return;
    txCore.fxRunner.sendEvent('ticketNewMessage', {
        ticketId,
        reporterLicense: ticket.reporter.license,
        message,
    });
};

// - -  Web Panel endpoints - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 

/**
 * GET /reports/list - Returns all tickets (for web panel)
 */
export const ticketsList = async (ctx: AuthedCtx) => {
    if (!txConfig.gameFeatures.reportsEnabled) {
        return ctx.send<ApiGetTicketListResp>({ error: 'Reports are disabled.' });
    }
    if (!ctx.admin.testPermission('players.reports', modulename)) {
        return ctx.send<ApiGetTicketListResp>({ error: 'Unauthorized' });
    }

    try {
        const allTickets = txCore.database.tickets.findAll();
        const tickets: TicketListItem[] = allTickets.map((t) => ({
            id: t.id,
            status: t.status,
            category: t.category,
            priority: t.priority,
            reporterName: t.reporter.name,
            targetNames: t.targets.map((tr) => tr.name),
            descriptionPreview: t.description.slice(0, 80),
            claimedBy: t.claimedBy,
            messageCount: t.messages.length,
            hasUnreadStaffNotes: false,
            tsCreated: t.tsCreated,
            tsLastActivity: t.tsLastActivity,
        }));
        tickets.sort((a, b) => b.tsLastActivity - a.tsLastActivity);
        return ctx.send<ApiGetTicketListResp>({ tickets });
    } catch (error) {
        console.error(`Failed to list tickets: ${emsg(error)}`);
        return ctx.send<ApiGetTicketListResp>({ error: 'Failed to list tickets.' });
    }
};

/**
 * GET /reports/detail?id=xxx - Returns full ticket detail (staffNotes included for admins)
 */
export const ticketsDetail = async (ctx: AuthedCtx) => {
    if (!txConfig.gameFeatures.reportsEnabled) {
        return ctx.send<ApiGetTicketDetailResp>({ error: 'Reports are disabled.' });
    }
    if (!ctx.admin.testPermission('players.reports', modulename)) {
        return ctx.send<ApiGetTicketDetailResp>({ error: 'Unauthorized' });
    }

    const ticketId = ctx.query?.id;
    if (typeof ticketId !== 'string' || !ticketId.length) {
        return ctx.send<ApiGetTicketDetailResp>({ error: 'Invalid ticket ID.' });
    }

    try {
        const ticket = txCore.database.tickets.findOne(ticketId);
        if (!ticket) {
            return ctx.send<ApiGetTicketDetailResp>({ error: 'Ticket not found.' });
        }
        return ctx.send<ApiGetTicketDetailResp>({ ticket });
    } catch (error) {
        console.error(`Failed to get ticket detail: ${emsg(error)}`);
        return ctx.send<ApiGetTicketDetailResp>({ error: 'Failed to get ticket.' });
    }
};

/**
 * POST /reports/message - Admin adds a message to a ticket
 */
export const ticketsMessage = async (ctx: AuthedCtx) => {
    if (!txConfig.gameFeatures.reportsEnabled) {
        return ctx.send<ApiTicketMessageResp>({ error: 'Reports are disabled.' });
    }
    if (!ctx.admin.testPermission('players.reports', modulename)) {
        return ctx.send<ApiTicketMessageResp>({ error: 'Unauthorized' });
    }

    const { id, content, imageUrls } = ctx.request.body ?? {};
    const hasContent = typeof content === 'string' && content.trim().length > 0;
    const hasImages = Array.isArray(imageUrls) && imageUrls.length > 0;
    if (typeof id !== 'string' || typeof content !== 'string' || (!hasContent && !hasImages)) {
        return ctx.send<ApiTicketMessageResp>({ error: 'Invalid request.' });
    }

    try {
        return ctx.send<ApiTicketMessageResp>(addTicketMessage(id, ctx.admin.name, content, imageUrls));
    } catch (error) {
        console.error(`Failed to add ticket message: ${emsg(error)}`);
        return ctx.send<ApiTicketMessageResp>({ error: 'Failed to add message.' });
    }
};

/**
 * POST /reports/status - Admin changes ticket status
 */
export const ticketsStatus = async (ctx: AuthedCtx) => {
    if (!txConfig.gameFeatures.reportsEnabled) {
        return ctx.send<ApiTicketStatusResp>({ error: 'Reports are disabled.' });
    }
    if (!ctx.admin.testPermission('players.reports', modulename)) {
        return ctx.send<ApiTicketStatusResp>({ error: 'Unauthorized' });
    }

    const { id, status } = ctx.request.body ?? {};
    const validStatuses: TicketStatus[] = ['open', 'inReview', 'resolved', 'closed'];
    if (typeof id !== 'string' || !validStatuses.includes(status as TicketStatus)) {
        return ctx.send<ApiTicketStatusResp>({ error: 'Invalid request.' });
    }

    try {
        return ctx.send<ApiTicketStatusResp>(setTicketStatus(id, status as TicketStatus, ctx.admin.name));
    } catch (error) {
        console.error(`Failed to update ticket status: ${emsg(error)}`);
        return ctx.send<ApiTicketStatusResp>({ error: 'Failed to update status.' });
    }
};

/**
 * POST /reports/claim - Claim or unclaim a ticket
 */
export const ticketsClaim = async (ctx: AuthedCtx) => {
    if (!txConfig.gameFeatures.reportsEnabled) {
        return ctx.send<ApiTicketClaimResp>({ error: 'Reports are disabled.' });
    }
    if (!ctx.admin.testPermission('players.reports', modulename)) {
        return ctx.send<ApiTicketClaimResp>({ error: 'Unauthorized' });
    }

    const { id } = ctx.request.body ?? {};
    if (typeof id !== 'string') {
        return ctx.send<ApiTicketClaimResp>({ error: 'Invalid request.' });
    }

    try {
        return ctx.send<ApiTicketClaimResp>(toggleClaim(id, ctx.admin.name));
    } catch (error) {
        console.error(`Failed to claim ticket: ${emsg(error)}`);
        return ctx.send<ApiTicketClaimResp>({ error: 'Failed to claim ticket.' });
    }
};

/**
 * POST /reports/note - Add a staff note to a ticket
 */
export const ticketsNote = async (ctx: AuthedCtx) => {
    if (!txConfig.gameFeatures.reportsEnabled) {
        return ctx.send<ApiTicketNoteResp>({ error: 'Reports are disabled.' });
    }
    if (!ctx.admin.testPermission('players.reports', modulename)) {
        return ctx.send<ApiTicketNoteResp>({ error: 'Unauthorized' });
    }

    const { id, content } = ctx.request.body ?? {};
    if (typeof id !== 'string' || typeof content !== 'string' || !content.trim().length) {
        return ctx.send<ApiTicketNoteResp>({ error: 'Invalid request.' });
    }

    try {
        return ctx.send<ApiTicketNoteResp>(addStaffNote(id, ctx.admin.name, content));
    } catch (error) {
        console.error(`Failed to add staff note: ${emsg(error)}`);
        return ctx.send<ApiTicketNoteResp>({ error: 'Failed to add note.' });
    }
};

/**
 * DELETE /reports/note - Delete a staff note from a ticket
 */
export const ticketsNoteDelete = async (ctx: AuthedCtx) => {
    if (!txConfig.gameFeatures.reportsEnabled) {
        return ctx.send<ApiTicketNoteResp>({ error: 'Reports are disabled.' });
    }
    if (!ctx.admin.testPermission('players.reports', modulename)) {
        return ctx.send<ApiTicketNoteResp>({ error: 'Unauthorized' });
    }

    const { id, noteId } = ctx.request.body ?? {};
    if (typeof id !== 'string' || typeof noteId !== 'string') {
        return ctx.send<ApiTicketNoteResp>({ error: 'Invalid request.' });
    }

    try {
        const success = txCore.database.tickets.removeStaffNote(id, noteId);
        if (!success) {
            return ctx.send<ApiTicketNoteResp>({ error: 'Note not found.' });
        }
        txCore.database.tickets.addActivityEntry(id, {
            ts: now(),
            adminName: ctx.admin.name,
            action: 'note_deleted',
        } satisfies TicketActivityEntry);
        txCore.logger.system.write(ctx.admin.name, `Deleted note ${noteId} from ticket ${id}.`, 'action', {
            actionId: 'ticket.note.delete',
        });
        return ctx.send<ApiTicketNoteResp>({ success: true });
    } catch (error) {
        console.error(`Failed to delete staff note: ${emsg(error)}`);
        return ctx.send<ApiTicketNoteResp>({ error: 'Failed to delete note.' });
    }
};

/**
 * DELETE /reports/delete - Delete a ticket permanently
 */
export const ticketsDelete = async (ctx: AuthedCtx) => {
    if (!txConfig.gameFeatures.reportsEnabled) {
        return ctx.send<ApiTicketDeleteResp>({ error: 'Reports are disabled.' });
    }
    if (!ctx.admin.testPermission('manage_tickets', modulename)) {
        return ctx.send<ApiTicketDeleteResp>({ error: 'Unauthorized' });
    }

    const { id } = ctx.request.body ?? {};
    if (typeof id !== 'string' || !id.length) {
        return ctx.send<ApiTicketDeleteResp>({ error: 'Invalid request.' });
    }

    try {
        const success = txCore.database.tickets.delete(id);
        if (!success) {
            return ctx.send<ApiTicketDeleteResp>({ error: 'Ticket not found.' });
        }

        ctx.admin.logAction(`Deleted ticket ${id}.`, 'ticket.delete');
        return ctx.send<ApiTicketDeleteResp>({ success: true });
    } catch (error) {
        console.error(`Failed to delete ticket: ${emsg(error)}`);
        return ctx.send<ApiTicketDeleteResp>({ error: 'Failed to delete ticket.' });
    }
};

/**
 * POST /reports/retention-exclusion - Exclude or include a ticket in retention pruning
 */
export const ticketsRetentionExclusion = async (ctx: AuthedCtx) => {
    if (!txConfig.gameFeatures.reportsEnabled) {
        return ctx.send<ApiTicketRetentionExclusionResp>({ error: 'Reports are disabled.' });
    }
    if (!ctx.admin.testPermission('manage_tickets', modulename)) {
        return ctx.send<ApiTicketRetentionExclusionResp>({ error: 'Unauthorized' });
    }

    const { id, excludeFromAutoDeletion } = ctx.request.body ?? {};
    if (typeof id !== 'string' || typeof excludeFromAutoDeletion !== 'boolean') {
        return ctx.send<ApiTicketRetentionExclusionResp>({ error: 'Invalid request.' });
    }

    try {
        const success = txCore.database.tickets.setExcludeFromAutoDeletion(id, excludeFromAutoDeletion);
        if (!success) {
            return ctx.send<ApiTicketRetentionExclusionResp>({ error: 'Ticket not found.' });
        }

        txCore.database.tickets.addActivityEntry(id, {
            ts: now(),
            adminName: ctx.admin.name,
            action: excludeFromAutoDeletion ? 'auto_delete_excluded' : 'auto_delete_reenabled',
        } satisfies TicketActivityEntry);
        ctx.admin.logAction(
            `${excludeFromAutoDeletion ? 'Excluded' : 'Re-enabled'} ticket ${id} ${excludeFromAutoDeletion ? 'from' : 'for'} auto deletion.`,
            excludeFromAutoDeletion ? 'ticket.retention.exclude' : 'ticket.retention.reenable',
        );

        return ctx.send<ApiTicketRetentionExclusionResp>({ success: true, excludeFromAutoDeletion });
    } catch (error) {
        console.error(`Failed to update ticket retention exclusion: ${emsg(error)}`);
        return ctx.send<ApiTicketRetentionExclusionResp>({ error: 'Failed to update ticket retention setting.' });
    }
};

/**
 * GET /reports/analytics - Returns analytics data
 */
export const ticketsAnalytics = async (ctx: AuthedCtx) => {
    if (!txConfig.gameFeatures.reportsEnabled) {
        return ctx.send<ApiGetAnalyticsResp>({ error: 'Reports are disabled.' });
    }
    if (!ctx.admin.testPermission('players.reports', modulename)) {
        return ctx.send<ApiGetAnalyticsResp>({ error: 'Unauthorized' });
    }

    try {
        return ctx.send<ApiGetAnalyticsResp>(txCore.database.tickets.getAnalytics(30));
    } catch (error) {
        console.error(`Failed to get analytics: ${emsg(error)}`);
        return ctx.send<ApiGetAnalyticsResp>({ error: 'Failed to get analytics.' });
    }
};

/**
 * GET /reports/config - Returns ticket categories and config for UI
 */
export const ticketsConfig = async (ctx: AuthedCtx) => {
    if (!ctx.admin.testPermission('players.reports', modulename)) {
        return ctx.send<ApiGetTicketConfigResp>({ error: 'Unauthorized' });
    }

    const categoryDescriptions = Object.fromEntries(
        Object.entries(txConfig.gameFeatures.ticketCategoryDescriptions).map(([key, value]) => [key, String(value)]),
    ) as Record<string, string>;

    return ctx.send<ApiGetTicketConfigResp>({
        categories: [...txConfig.gameFeatures.ticketCategories],
        categoryDescriptions,
        priorityEnabled: txConfig.gameFeatures.ticketPriorityEnabled,
        feedbackEnabled: txConfig.gameFeatures.ticketFeedbackEnabled,
    });
};

/**
 * GET /reports/screenshot/:id - Serves a stored ticket screenshot
 */
export const ticketsScreenshot = async (ctx: InitializedCtx) => {
    const id = (ctx.params as Record<string, string>).id;
    if (!id || !/^[A-Za-z0-9_.-]+$/.test(id)) {
        return ctx.utils.error(400, 'Invalid screenshot ID.');
    }

    // New format: id includes extension (e.g., uuid.jpg)
    // Old format: id is just a UUID, file is saved as uuid.png
    const ext = path.extname(id).toLowerCase();
    const filePath =
        ext && EXT_TO_MIME[ext] ? path.join(SCREENSHOT_DIR(), id) : path.join(SCREENSHOT_DIR(), `${id}.png`);
    const contentType = (ext && EXT_TO_MIME[ext]) || 'image/png';
    try {
        const data = await fsp.readFile(filePath);
        ctx.set('Content-Type', contentType);
        ctx.set('Cache-Control', 'private, max-age=86400');
        ctx.body = data;
    } catch {
        return ctx.utils.error(404, 'Screenshot not found.');
    }
};

// - -  Intercom handlers - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 

/**
 * ticketCreate intercom - Player files a new ticket
 */
export const ticketCreate = async (data: IntercomTicketCreateReq): Promise<ApiCreateTicketResp> => {
    if (!txConfig.gameFeatures.reportsEnabled) {
        return { error: 'Reports are disabled.' };
    }
    if (typeof data.reporter?.license !== 'string' || typeof data.reporter?.name !== 'string') {
        return { error: 'Invalid reporter data.' };
    }
    if (typeof data.description !== 'string' || !data.description.trim().length) {
        return { error: 'Description is required.' };
    }
    const validCategories = txConfig.gameFeatures.ticketCategories;
    if (typeof data.category !== 'string' || !validCategories.includes(data.category)) {
        return { error: 'Invalid category.' };
    }

    try {
        const tsNow = now();
        const targetNetids = (data.targets ?? []).map((t) => t.netid ?? 0).filter((n) => n > 0);
        const logContext = pullLogContext(data.reporter.netid, targetNetids, tsNow);

        const ticketId = txCore.database.tickets.create({ ...data, description: data.description.trim() }, logContext);

        // Handle screenshot data
        if (data.screenshotData) {
            try {
                const screenshotDir = SCREENSHOT_DIR();
                await fsp.mkdir(screenshotDir, { recursive: true });
                const mimeMatch = data.screenshotData.match(/^data:(image\/[a-z]+);base64,/i);
                if (!mimeMatch || !ALLOWED_IMAGE_MIMES[mimeMatch[1].toLowerCase()]) {
                    console.verbose.warn(`Rejected screenshot for ${ticketId}: unsupported MIME type`);
                } else {
                    const ext = ALLOWED_IMAGE_MIMES[mimeMatch[1].toLowerCase()];
                    const base64Data = data.screenshotData.slice(mimeMatch[0].length);
                    // Approximate decoded size from base64 length to reject oversized payloads early
                    const approxBytes = Math.floor((base64Data.length * 3) / 4);
                    if (approxBytes > MAX_SCREENSHOT_BYTES) {
                        console.verbose.warn(
                            `Rejected oversized screenshot for ${ticketId}: ~${approxBytes} bytes (max ${MAX_SCREENSHOT_BYTES})`,
                        );
                    } else {
                        const buffer = Buffer.from(base64Data, 'base64');
                        if (buffer.length > MAX_SCREENSHOT_BYTES) {
                            console.verbose.warn(
                                `Rejected oversized screenshot for ${ticketId}: ${buffer.length} bytes (max ${MAX_SCREENSHOT_BYTES})`,
                            );
                        } else {
                            const screenshotId = `${randomUUID()}${ext}`;
                            await fsp.writeFile(path.join(screenshotDir, screenshotId), buffer);
                            const screenshotUrl = `/reports/screenshot/${screenshotId}`;
                            txCore.database.tickets.setScreenshot(ticketId, screenshotUrl);
                        }
                    }
                }
            } catch (screenshotError) {
                console.verbose.warn(`Failed to save screenshot for ${ticketId}: ${emsg(screenshotError)}`);
            }
        }

        const categoryLabel = data.category;
        // Escape Discord markdown special characters to prevent abuse via player names/descriptions
        const safeReporterName = escapeDiscordMd(data.reporter.name);
        const safeTargetText = data.targets?.length
            ? `\n**Target(s):** ${data.targets.map((t) => escapeDiscordMd(t.name)).join(', ')}`
            : '';
        const safeDescription = escapeDiscordMd(data.description.trim().slice(0, 200));
        txCore.discordBot.sendAnnouncement({
            type: 'warning',
            title: `New Ticket: ${ticketId}`,
            description: `**Category:** ${categoryLabel}\n**Reporter:** ${safeReporterName}${safeTargetText}\n**Description:** ${safeDescription}`,
        });

        txCore.fxRunner.sendEvent('ticketCreated', {
            ticketId,
            category: categoryLabel,
            reporterName: data.reporter.name,
            description: data.description.trim(),
        });

        txCore.logger.system.write(data.reporter.name, `Created ticket ${ticketId}.`, 'action', {
            actionId: 'ticket.create',
        });

        // Discord thread
        sendDiscordThreadCreate(ticketId).catch(() => {});

        return { ticketId };
    } catch (error) {
        console.error(`Failed to create ticket: ${emsg(error)}`);
        return { error: 'Failed to create ticket.' };
    }
};

/**
 * ticketPlayerList intercom - Returns player's own tickets
 */
export const ticketPlayerList = (playerLicense: string): ApiGetPlayerTicketsResp => {
    if (!txConfig.gameFeatures.reportsEnabled) {
        return { error: 'Reports are disabled.' };
    }
    if (typeof playerLicense !== 'string' || !playerLicense.length) {
        return { error: 'Invalid license.' };
    }

    try {
        const allTickets = txCore.database.tickets.findByReporter(playerLicense);
        const tickets: PlayerTicketSummary[] = allTickets.map((t) => ({
            id: t.id,
            status: t.status,
            category: t.category,
            descriptionPreview: t.description.slice(0, 80),
            messageCount: t.messages.length,
            unreadCount: 0,
            tsCreated: t.tsCreated,
            awaitingFeedback:
                txConfig.gameFeatures.ticketFeedbackEnabled &&
                (t.status === 'resolved' || t.status === 'closed') &&
                !t.feedback,
        }));
        tickets.sort((a, b) => b.tsCreated - a.tsCreated);
        return { tickets };
    } catch (error) {
        console.error(`Failed to get player tickets: ${emsg(error)}`);
        return { error: 'Failed to get tickets.' };
    }
};

/**
 * ticketPlayerMessages intercom — Returns full messages for a player's own ticket
 */
export const ticketPlayerMessages = (
    ticketId: string,
    playerLicense: string,
): { messages: TicketMessage[] } | { error: string } => {
    if (!txConfig.gameFeatures.reportsEnabled) return { error: 'Reports are disabled.' };
    if (typeof ticketId !== 'string' || !ticketId.length) return { error: 'Invalid ticket ID.' };
    if (typeof playerLicense !== 'string' || !playerLicense.length) return { error: 'Invalid license.' };
    try {
        const ticket = txCore.database.tickets.findOne(ticketId);
        if (!ticket) return { error: 'Ticket not found.' };
        if (ticket.reporter.license !== playerLicense) return { error: 'Not your ticket.' };
        return { messages: ticket.messages };
    } catch (error) {
        console.error(`Failed to get ticket messages: ${emsg(error)}`);
        return { error: 'Failed to get messages.' };
    }
};

/**
 * ticketPlayerMessage intercom — Player sends a message on their ticket
 */
export const ticketPlayerMessage = (
    ticketId: string,
    playerLicense: string,
    content: string,
    imageUrls?: string[],
): ApiTicketMessageResp => {
    if (!txConfig.gameFeatures.reportsEnabled) {
        return { error: 'Reports are disabled.' };
    }
    const hasContent = typeof content === 'string' && content.trim().length > 0;
    const hasImages = Array.isArray(imageUrls) && imageUrls.length > 0;
    if (typeof ticketId !== 'string' || typeof content !== 'string' || (!hasContent && !hasImages)) {
        return { error: 'Invalid request.' };
    }

    try {
        const ticket = txCore.database.tickets.findOne(ticketId);
        if (!ticket) {
            return { error: 'Ticket not found.' };
        }
        if (ticket.reporter.license !== playerLicense) {
            return { error: 'Not your ticket.' };
        }

        const sanitizedImageUrls = sanitizeMessageImageUrls(imageUrls);
        const success = txCore.database.tickets.addMessage(ticketId, {
            author: ticket.reporter.name,
            authorType: 'player',
            content: content.trim(),
            imageUrls: sanitizedImageUrls,
            ts: now(),
        });

        if (!success) {
            return { error: 'Failed to add message.' };
        }

        txCore.discordBot
            .postTicketThreadMessage(ticketId, ticket.reporter.name, content.trim(), sanitizedImageUrls)
            .catch(() => {});

        return { success: true };
    } catch (error) {
        console.error(`Failed to add player message: ${emsg(error)}`);
        return { error: 'Failed to add message.' };
    }
};

/**
 * ticketFeedbackSubmit intercom - Player submits feedback for a resolved ticket
 */
export const ticketFeedbackSubmit = (data: IntercomFeedbackReq): { success: true } | { error: string } => {
    if (!txConfig.gameFeatures.ticketFeedbackEnabled) {
        return { error: 'Feedback is disabled.' };
    }
    const { ticketId, reporterLicense, rating, comment } = data;
    if (typeof ticketId !== 'string' || typeof reporterLicense !== 'string') {
        return { error: 'Invalid request.' };
    }
    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
        return { error: 'Invalid rating.' };
    }

    try {
        const ticket = txCore.database.tickets.findOne(ticketId);
        if (!ticket) return { error: 'Ticket not found.' };
        if (ticket.reporter.license !== reporterLicense) return { error: 'Not your ticket.' };
        if (ticket.status !== 'resolved' && ticket.status !== 'closed') return { error: 'Ticket is not resolved.' };
        if (ticket.feedback) return { error: 'Feedback already submitted.' };

        txCore.database.tickets.setFeedback(ticketId, {
            rating: rating as 1 | 2 | 3 | 4 | 5,
            comment: typeof comment === 'string' ? comment.trim().slice(0, 500) : undefined,
            ts: now(),
        });
        return { success: true };
    } catch (error) {
        console.error(`Failed to submit feedback: ${emsg(error)}`);
        return { error: 'Failed to submit feedback.' };
    }
};

// ── Admin intercom ──────────────────────────────────────────────────────────────────────────────

// ── Internal helpers (shared by ticketAdmin* handlers) ──────────────────────
/** Returns an error response when the reports feature is disabled, else null. */
function ensureReportsEnabled(): { error: string } | null {
    if (!txConfig.gameFeatures.reportsEnabled) return { error: 'Reports are disabled.' };
    return null;
}

/** Validates that a ticketId is a non-empty string. */
function validateTicketId(ticketId: unknown): { error: string } | null {
    if (typeof ticketId !== 'string' || !ticketId.length) return { error: 'Invalid ticket ID.' };
    return null;
}

/** Looks up a ticket by id, returning either the ticket or an error response. */
type Ticket = NonNullable<ReturnType<typeof txCore.database.tickets.findOne>>;
function fetchTicketOrError(ticketId: string): { kind: 'ok'; ticket: Ticket } | { kind: 'error'; message: string } {
    const ticket = txCore.database.tickets.findOne(ticketId);
    if (!ticket) return { kind: 'error', message: 'Ticket not found.' };
    return { kind: 'ok', ticket };
}

/**
 * Adds an admin message to a ticket and dispatches the side effects:
 * promotes 'open' tickets to 'inReview', forwards to the discord thread,
 * and notifies the in-game player.
 */
function addTicketMessage(
    ticketId: string,
    adminName: string,
    content: string,
    imageUrls?: string[],
): { success: true } | { error: string } {
    const lookup = fetchTicketOrError(ticketId);
    if (lookup.kind === 'error') return { error: lookup.message };
    const ticket = lookup.ticket;

    const trimmed = content.trim();
    const sanitizedImageUrls = sanitizeMessageImageUrls(imageUrls);
    const msgTs = now();

    const success = txCore.database.tickets.addMessage(ticketId, {
        author: adminName,
        authorType: 'admin',
        content: trimmed,
        imageUrls: sanitizedImageUrls,
        ts: msgTs,
    });
    if (!success) return { error: 'Failed to add message.' };

    if (ticket.status === 'open') {
        txCore.database.tickets.setStatus(ticketId, 'inReview', undefined);
        txCore.logger.system.write(adminName, `Marked ticket ${ticketId} in review.`, 'action', {
            actionId: 'ticket.in_review',
        });
    }

    txCore.logger.system.write(adminName, `Replied to ticket ${ticketId}.`, 'action', {
        actionId: 'ticket.reply',
    });

    const adminMsgPayload = {
        author: adminName,
        authorType: 'admin' as const,
        content: trimmed,
        imageUrls: sanitizedImageUrls,
        ts: msgTs,
    };
    txCore.discordBot.postTicketThreadMessage(ticketId, adminName, trimmed, sanitizedImageUrls).catch(() => {});
    notifyPlayerNewMessage(ticketId, adminMsgPayload);

    return { success: true };
}

/**
 * Updates a ticket's status and posts a Discord announcement on
 * resolved/closed transitions.
 */
function setTicketStatus(
    ticketId: string,
    status: TicketStatus,
    adminName: string,
): { success: true } | { error: string } {
    const ticketBeforeUpdate = txCore.database.tickets.findOne(ticketId);
    if (!ticketBeforeUpdate) return { error: 'Ticket not found.' };

    const success = txCore.database.tickets.setStatus(
        ticketId,
        status,
        status === 'resolved' || status === 'closed' ? adminName : undefined,
    );
    if (!success) return { error: 'Ticket not found.' };

    if (status === 'resolved' || status === 'closed') {
        txCore.database.tickets.addActivityEntry(ticketId, {
            ts: now(),
            adminName,
            action: status,
        });
        txCore.logger.system.write(
            adminName,
            `${status === 'resolved' ? 'Resolved' : 'Closed'} ticket ${ticketId}.`,
            'action',
            { actionId: status === 'resolved' ? 'ticket.resolve' : 'ticket.close' },
        );
    } else if (status === 'open' && (ticketBeforeUpdate.status === 'resolved' || ticketBeforeUpdate.status === 'closed')) {
        txCore.database.tickets.addActivityEntry(ticketId, {
            ts: now(),
            adminName,
            action: 'reopened',
        });
        txCore.logger.system.write(adminName, `Reopened ticket ${ticketId}.`, 'action', {
            actionId: 'ticket.reopen',
        });
    } else if (status === 'inReview') {
        txCore.logger.system.write(adminName, `Marked ticket ${ticketId} in review.`, 'action', {
            actionId: 'ticket.in_review',
        });
    }

    if (status === 'resolved' || status === 'closed') {
        const ticket = txCore.database.tickets.findOne(ticketId);
        if (ticket) {
            txCore.discordBot.sendAnnouncement({
                type: 'success',
                title: `Ticket ${ticketId} ${status === 'resolved' ? 'Resolved' : 'Closed'}`,
                description: `**${escapeDiscordMd(ticket.reporter.name)}**'s ticket (${escapeDiscordMd(ticket.category)}) was ${status} by **${escapeDiscordMd(adminName)}**.`,
            });
        }
    }
    return { success: true };
}

/** Appends a staff note to a ticket. */
function addStaffNote(ticketId: string, adminName: string, content: string): { success: true } | { error: string } {
    const success = txCore.database.tickets.addStaffNote(ticketId, {
        authorAdminId: adminName,
        authorName: adminName,
        content: content.trim(),
        ts: now(),
    });
    if (!success) return { error: 'Ticket not found.' };
    txCore.database.tickets.addActivityEntry(ticketId, {
        ts: now(),
        adminName,
        action: 'note_added',
    });
    txCore.logger.system.write(adminName, `Added note to ticket ${ticketId}.`, 'action', {
        actionId: 'ticket.note.add',
    });
    return { success: true };
}

/**
 * Toggles a ticket's claim by `adminName`: clears it if already claimed by
 * this admin, otherwise assigns it.
 */
function toggleClaim(ticketId: string, adminName: string): { success: true; claimedBy: string | null } | { error: string } {
    const lookup = fetchTicketOrError(ticketId);
    if (lookup.kind === 'error') return { error: lookup.message };
    const ticket = lookup.ticket;

    const newClaimer = ticket.claimedBy === adminName ? null : adminName;
    const success = txCore.database.tickets.setClaimed(ticketId, newClaimer);
    if (!success) return { error: 'Failed to update claim.' };

    txCore.database.tickets.addActivityEntry(ticketId, {
        ts: now(),
        adminName,
        action: newClaimer ? 'claimed' : 'unclaimed',
        details: newClaimer ?? undefined,
    });

    txCore.logger.system.write(
        adminName,
        newClaimer ? `Claimed ticket ${ticketId}.` : `Unclaimed ticket ${ticketId}.`,
        'action',
        { actionId: newClaimer ? 'ticket.claim' : 'ticket.unclaim' },
    );

    return { success: true, claimedBy: newClaimer };
}

export const ticketAdminList = (): ApiGetTicketListResp => {
    if (!txConfig.gameFeatures.reportsEnabled) return { error: 'Reports are disabled.' };
    try {
        const allTickets = txCore.database.tickets.findAll();
        const tickets = allTickets.map((t) => ({
            id: t.id,
            status: t.status,
            category: t.category,
            priority: t.priority,
            reporterName: t.reporter.name,
            targetNames: t.targets.map((tr) => tr.name),
            descriptionPreview: t.description.slice(0, 80),
            claimedBy: t.claimedBy,
            messageCount: t.messages.length,
            hasUnreadStaffNotes: false,
            tsCreated: t.tsCreated,
            tsLastActivity: t.tsLastActivity,
        }));
        tickets.sort((a, b) => b.tsLastActivity - a.tsLastActivity);
        return { tickets };
    } catch (error) {
        console.error(`Failed to list tickets (admin intercom): ${emsg(error)}`);
        return { error: 'Failed to list tickets.' };
    }
};

export const ticketAdminDetail = (ticketId: string): ApiGetTicketDetailResp => {
    if (!txConfig.gameFeatures.reportsEnabled) return { error: 'Reports are disabled.' };
    if (typeof ticketId !== 'string' || !ticketId.length) return { error: 'Invalid ticket ID.' };
    try {
        const ticket = txCore.database.tickets.findOne(ticketId);
        if (!ticket) return { error: 'Ticket not found.' };
        return { ticket };
    } catch (error) {
        console.error(`Failed to get ticket detail (admin intercom): ${emsg(error)}`);
        return { error: 'Failed to get ticket.' };
    }
};

export const ticketAdminMessage = (
    ticketId: string,
    adminName: string,
    content: string,
    imageUrls?: string[],
): ApiTicketMessageResp => {
    const disabled = ensureReportsEnabled();
    if (disabled) return disabled;
    const hasContent = typeof content === 'string' && content.trim().length > 0;
    const hasImages = Array.isArray(imageUrls) && imageUrls.length > 0;
    if (typeof ticketId !== 'string' || typeof content !== 'string' || (!hasContent && !hasImages)) {
        return { error: 'Invalid request.' };
    }
    try {
        return addTicketMessage(ticketId, adminName, content, imageUrls);
    } catch (error) {
        console.error(`Failed to add admin message (intercom): ${emsg(error)}`);
        return { error: 'Failed to add message.' };
    }
};

export const ticketAdminStatus = (ticketId: string, status: string, adminName: string): ApiTicketStatusResp => {
    const disabled = ensureReportsEnabled();
    if (disabled) return disabled;
    const validStatuses: TicketStatus[] = ['open', 'inReview', 'resolved', 'closed'];
    if (typeof ticketId !== 'string' || !ticketId.length || !validStatuses.includes(status as TicketStatus)) {
        return { error: 'Invalid request.' };
    }
    try {
        return setTicketStatus(ticketId, status as TicketStatus, adminName);
    } catch (error) {
        console.error(`Failed to update ticket status (intercom): ${emsg(error)}`);
        return { error: 'Failed to update status.' };
    }
};

export const ticketAdminNote = (ticketId: string, adminName: string, content: string): ApiTicketNoteResp => {
    const disabled = ensureReportsEnabled();
    if (disabled) return disabled;
    if (typeof ticketId !== 'string' || typeof content !== 'string' || !content.trim().length) {
        return { error: 'Invalid request.' };
    }
    try {
        return addStaffNote(ticketId, adminName, content);
    } catch (error) {
        console.error(`Failed to add staff note (intercom): ${emsg(error)}`);
        return { error: 'Failed to add note.' };
    }
};

export const ticketAdminClaim = (ticketId: string, adminName: string): ApiTicketClaimResp => {
    const disabled = ensureReportsEnabled();
    if (disabled) return disabled;
    if (typeof ticketId !== 'string') return { error: 'Invalid request.' };
    try {
        return toggleClaim(ticketId, adminName);
    } catch (error) {
        console.error(`Failed to claim ticket (intercom): ${emsg(error)}`);
        return { error: 'Failed to claim ticket.' };
    }
};

/**
 * ticketScreenshotUpload intercom - Receives base64 PNG from Lua resource
 */
export const ticketScreenshotUpload = async (
    ticketId: string,
    screenshotData: string,
): Promise<{ url: string } | { error: string }> => {
    if (typeof ticketId !== 'string' || typeof screenshotData !== 'string') {
        return { error: 'Invalid request.' };
    }
    const ticket = txCore.database.tickets.findOne(ticketId);
    if (!ticket) return { error: 'Ticket not found.' };

    try {
        const screenshotDir = SCREENSHOT_DIR();
        await fsp.mkdir(screenshotDir, { recursive: true });
        const mimeMatch = screenshotData.match(/^data:(image\/[a-z]+);base64,/i);
        if (!mimeMatch || !ALLOWED_IMAGE_MIMES[mimeMatch[1].toLowerCase()]) {
            return { error: 'Unsupported image format.' };
        }
        const ext = ALLOWED_IMAGE_MIMES[mimeMatch[1].toLowerCase()];
        const base64Data = screenshotData.slice(mimeMatch[0].length);
        const approxBytes = Math.floor((base64Data.length * 3) / 4);
        if (approxBytes > MAX_SCREENSHOT_BYTES) {
            return { error: 'Screenshot too large.' };
        }
        const buffer = Buffer.from(base64Data, 'base64');
        if (buffer.length > MAX_SCREENSHOT_BYTES) {
            return { error: 'Screenshot too large.' };
        }
        const screenshotId = `${randomUUID()}${ext}`;
        await fsp.writeFile(path.join(screenshotDir, screenshotId), buffer);
        const url = `/reports/screenshot/${screenshotId}`;
        txCore.database.tickets.setScreenshot(ticketId, url);
        return { url };
    } catch (error) {
        console.error(`Failed to save screenshot upload: ${emsg(error)}`);
        return { error: 'Failed to save screenshot.' };
    }
};

// - -  Backward-compat exports (for any existing code still using old names) - - 
export const reportsList = ticketsList;
export const reportsDetail = ticketsDetail;
export const reportsMessage = ticketsMessage;
export const reportsStatus = ticketsStatus;
export const reportsCreate = async (data: any): Promise<any> => {
    const validCategories = txConfig.gameFeatures.ticketCategories;
    const mappedCategory =
        data.type === 'playerReport' ? 'Player Report' : data.type === 'bugReport' ? 'Bug Report' : 'Question';
    const category = validCategories.includes(mappedCategory) ? mappedCategory : (validCategories[0] ?? mappedCategory);
    if (category !== mappedCategory) {
        console.warn(
            `[reportsCreate] Legacy type '${data.type}' mapped to '${mappedCategory}' which is not in ticketCategories, falling back to '${category}'`,
        );
    }
    return ticketCreate({
        ...data,
        category,
        description: data.reason ?? '',
    });
};
export const reportsPlayerList = (license: string) => ticketPlayerList(license);
export const reportsPlayerMessage = (id: string, license: string, content: string) =>
    ticketPlayerMessage(id, license, content);
export const reportsAdminList = () => ticketAdminList();
export const reportsAdminDetail = (id: string) => ticketAdminDetail(id);
export const reportsAdminMessage = (id: string, adminName: string, content: string) =>
    ticketAdminMessage(id, adminName, content);
export const reportsAdminStatus = (id: string, status: string, adminName: string) =>
    ticketAdminStatus(id, status, adminName);
