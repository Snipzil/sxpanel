import { DatabaseTicketType } from '@shared/ticketApiTypes';
import type { BotCommandEvent } from '@shared/discordBotAnalyticsTypes';
import type { License, ActionId } from '@shared/brandedTypes';

export type DatabasePlayerType = {
    license: License;
    ids: string[];
    hwids: string[];
    displayName: string;
    pureName: string;
    playTime: number;
    tsLastConnection: number;
    tsJoined: number;
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

export type DatabaseWhitelistApprovalsType = {
    identifier: string;
    playerName: string; //always filled, even with `unknown` or license `xxxxxx...xxxxxx`
    playerAvatar: string | null;
    tsApproved: number;
    approvedBy: string;
};

export type DatabaseWhitelistRequestsType = {
    id: string; //R####
    license: string;
    playerDisplayName: string;
    playerPureName: string;
    discordTag?: string;
    discordAvatar?: string; //first try to get from GuildMember, then client.users.fetch()
    tsLastAttempt: number;
};

export type DatabaseBotCommandEventType = BotCommandEvent;

export type DatabaseDataType = {
    version: number;
    players: DatabasePlayerType[];
    actions: DatabaseActionType[];
    whitelistApprovals: DatabaseWhitelistApprovalsType[];
    whitelistRequests: DatabaseWhitelistRequestsType[];
    tickets: DatabaseTicketType[];
    botCommandEvents: DatabaseBotCommandEventType[];
    /** @deprecated Retained for migration path only — use tickets */
    reports?: any[];
};
