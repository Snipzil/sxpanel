import type { TicketMessage, TicketStatus } from '@shared/ticketApiTypes';

export type TicketAddonEventMap = {
    ticketCreated: {
        ticketId: string;
        category: string;
        reporterName: string;
        reporterLicense: string;
        description: string;
        targets: { name: string; netid: number }[];
    };
    ticketNewMessage: {
        ticketId: string;
        reporterLicense: string;
        message: Omit<TicketMessage, 'id'>;
    };
    ticketStatusChanged: {
        ticketId: string;
        status: TicketStatus;
        previousStatus: TicketStatus;
        adminName?: string;
    };
    ticketClaimChanged: {
        ticketId: string;
        claimedBy: string | null;
        adminName: string;
    };
    ticketDiscordLinked: {
        ticketId: string;
        discordThreadId: string;
        channelId: string;
    };
};

/**
 * Broadcast a ticket lifecycle event to running addon server processes.
 * Delivery is gated on the `tickets.read` addon permission and must never
 * break the calling ticket flow, hence the swallow-all guard.
 */
export const broadcastTicketAddonEvent = <T extends keyof TicketAddonEventMap>(
    event: T,
    data: TicketAddonEventMap[T],
): void => {
    try {
        txCore.addonManager?.broadcastEvent(event, data, 'tickets.read');
    } catch {
        //addon system unavailable — ticket flows must not fail because of it
    }
};
