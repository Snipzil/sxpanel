import { DatabaseTicketType } from '@shared/ticketApiTypes';
import type { BotCommandEvent } from '@shared/discordBotAnalyticsTypes';
import type { License, ActionId } from '@shared/brandedTypes';
import type { WhitelistApplicationStatus, WhitelistEntrySource, WhitelistEventType } from '@shared/whitelistTypes';

export type DatabasePlayerType = {
    license: License;
    ids: string[];
    hwids: string[];
    displayName: string;
    pureName: string;
    playTime: number;
    tsLastConnection: number;
    tsJoined: number;
    /** @deprecated Cleared after v9 migration — use whitelistEntries */
    tsWhitelisted?: number;
    notes?: {
        text: string;
        lastAdmin: string | null;
        tsLastEdit: number | null;
    };
    nameHistory?: string[];
    sessionHistory?: [day: string, mins: number][];
    customTags?: string[];
};

export type DatabaseActionBaseType = {
    id: ActionId;
    ids: string[];
    playerName: string | false;
    reason: string;
    author: string;
    timestamp: number;
    revocation?: {
        timestamp: number;
        author: string;
        reason?: string;
    };
};
export type DatabaseActionBanType = {
    type: 'ban';
    hwids?: string[];
    expiration: number | false;
} & DatabaseActionBaseType;
export type DatabaseActionWarnType = {
    type: 'warn';
    acked: boolean; //if the player has acknowledged the warning
} & DatabaseActionBaseType;
export type DatabaseActionKickType = {
    type: 'kick';
} & DatabaseActionBaseType;
export type DatabaseActionType = DatabaseActionBanType | DatabaseActionWarnType | DatabaseActionKickType;

export type DatabaseWhitelistEntryType = {
    identifier: string;
    tsGranted: number;
    grantedBy: string;
    source: WhitelistEntrySource;
    playerName: string;
    playerAvatar: string | null;
    license?: string;
    tsFirstConnect?: number;
};

export type DatabaseWhitelistApplicationType = {
    id: string;
    license: string;
    status: WhitelistApplicationStatus;
    workflowId: string;
    answers?: Record<string, string>;
    playerDisplayName: string;
    playerPureName: string;
    discordTag?: string;
    discordAvatar?: string;
    tsCreated: number;
    tsLastAttempt: number;
    tsDecided?: number;
    decidedBy?: string;
    discordThreadId?: string;
};

export type DatabaseWhitelistEventType = {
    id: string;
    type: WhitelistEventType;
    ts: number;
    license?: string;
    applicationId?: string;
    identifier?: string;
    adminName?: string;
    meta?: Record<string, unknown>;
};

/** @deprecated Panel API compat — mapped from whitelistEntries without tsFirstConnect */
export type DatabaseWhitelistApprovalsType = {
    identifier: string;
    playerName: string;
    playerAvatar: string | null;
    tsApproved: number;
    approvedBy: string;
};

/** @deprecated Panel API compat — mapped from pending whitelistApplications */
export type DatabaseWhitelistRequestsType = {
    id: string;
    license: string;
    playerDisplayName: string;
    playerPureName: string;
    discordTag?: string;
    discordAvatar?: string;
    tsLastAttempt: number;
    workflowId?: string;
    status?: WhitelistApplicationStatus;
};

export type DatabaseBotCommandEventType = BotCommandEvent;

export type DatabaseDataType = {
    version: number;
    players: DatabasePlayerType[];
    actions: DatabaseActionType[];
    whitelistEntries: DatabaseWhitelistEntryType[];
    whitelistApplications: DatabaseWhitelistApplicationType[];
    whitelistEvents: DatabaseWhitelistEventType[];
    tickets: DatabaseTicketType[];
    botCommandEvents: DatabaseBotCommandEventType[];
    /** @deprecated Retained for migration path only — use tickets */
    reports?: any[];
    /** @deprecated Retained for v8→v9 migration only */
    whitelistApprovals?: DatabaseWhitelistApprovalsType[];
    /** @deprecated Retained for v8→v9 migration only */
    whitelistRequests?: DatabaseWhitelistRequestsType[];
};
