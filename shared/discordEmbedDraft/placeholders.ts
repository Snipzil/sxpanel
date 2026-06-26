export const EMBED_PLACEHOLDER_KEYS = [
    'serverCfxId',
    'serverJoinUrl',
    'serverBrowserUrl',
    'serverEndpoint',
    'serverIp',
    'serverPort',
    'serverConnectCommand',
    'serverAvailableSlots',
    'serverClients',
    'serverMaxClients',
    'serverOccupancyPercent',
    'serverName',
    'statusColor',
    'statusString',
    'uptime',
    'nextScheduledRestart',
    'recentJoinCount',
    'recentLeaveCount',
    'playerList',
    'playerListColumns',
    'playerListInline',
    'playerListSummary',
    'playerListPage',
    'playerListTotalPages',
    'playerListPageSummary',
    'configurableEmbedDescription',
    'statusFieldLabel',
    'playersFieldLabel',
    'connectCommandFieldLabel',
    'nextRestartFieldLabel',
    'uptimeFieldLabel',
    'playerListFieldLabel',
    'connectButtonLabel',
    'communityButtonLabel',
    'serverPageButtonLabel',
] as const;

export const PLAYER_TEMPLATE_PLACEHOLDER_KEYS = [
    'index',
    'netid',
    'displayName',
    'pureName',
    'license',
    'playTimeMinutes',
    'playTime',
    'sessionTimeSeconds',
    'sessionTimeMinutes',
    'sessionTime',
    'tags',
] as const;

export const insertPlaceholder = (value: string, key: string, cursor?: number) => {
    const token = `{{${key}}}`;
    if (cursor === undefined || cursor < 0) {
        return value.length ? `${value}${token}` : token;
    }
    return value.slice(0, cursor) + token + value.slice(cursor);
};
