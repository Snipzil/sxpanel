const SERVER_ERROR_KEYS: Record<string, string> = {
    'Support tickets are disabled on this server.': 'nui_reports.server.tickets_disabled',
    'Invalid ticket data.': 'nui_reports.errors.invalid_ticket_data',
    'Could not identify your license.': 'nui_reports.server.could_not_identify',
    'Invalid message data.': 'nui_reports.errors.invalid_message_data',
    'Message must have content or an image.': 'nui_reports.errors.message_required',
    'Permission denied.': 'nui_reports.server.permission_denied',
    'Failed to fetch tickets.': 'nui_reports.server.failed_fetch',
    'Invalid ticket ID.': 'nui_reports.errors.invalid_ticket_id',
    'Failed to fetch ticket.': 'nui_reports.server.failed_fetch_ticket',
    'Failed to create ticket.': 'nui_reports.server.failed_create',
    'Not authenticated.': 'nui_reports.server.not_authenticated',
};

export const translateTicketError = (t: (key: string) => string, error?: string): string | undefined => {
    if (!error) return error;
    if (error.startsWith('nui_reports.')) {
        return t(error);
    }
    const key = SERVER_ERROR_KEYS[error];
    return key ? t(key) : error;
};
