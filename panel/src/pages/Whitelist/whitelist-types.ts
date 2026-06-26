export type WhitelistApproval = {
    identifier: string;
    playerName: string;
    playerAvatar: string | null;
    tsApproved: number;
    approvedBy: string;
};

export type WhitelistRequest = {
    id: string;
    license: string;
    playerDisplayName: string;
    playerPureName: string;
    discordTag?: string;
    discordAvatar?: string;
    tsLastAttempt: number;
};

export type WhitelistRequestsResp = {
    cntTotal: number;
    cntFiltered: number;
    newest: number | null;
    totalPages: number;
    currPage: number;
    requests: WhitelistRequest[];
};

export type WhitelistTabId = 'players' | 'requests' | 'approvals';

export type WhitelistTabCounts = {
    players?: number;
    requests?: number;
    approvals?: number;
};
