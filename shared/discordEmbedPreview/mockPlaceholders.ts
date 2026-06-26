export type PreviewHealth = 'online' | 'partial' | 'offline';

export type PreviewVariant = 'status' | 'playerList';

const SAMPLE_CFX_ID = 'previewcfx123';

export const buildMockEmbedPlaceholders = (
    embedConfigJson: Record<string, unknown>,
    playerListPlaceholders: Record<string, unknown>,
    health: PreviewHealth = 'online',
) => {
    const onlineColor = typeof embedConfigJson.onlineColor === 'string' ? embedConfigJson.onlineColor : '#0BA70B';
    const partialColor = typeof embedConfigJson.partialColor === 'string' ? embedConfigJson.partialColor : '#FFF100';
    const offlineColor = typeof embedConfigJson.offlineColor === 'string' ? embedConfigJson.offlineColor : '#A70B28';
    const onlineString = typeof embedConfigJson.onlineString === 'string' ? embedConfigJson.onlineString : 'Online';
    const partialString = typeof embedConfigJson.partialString === 'string' ? embedConfigJson.partialString : 'Partial';
    const offlineString = typeof embedConfigJson.offlineString === 'string' ? embedConfigJson.offlineString : 'Offline';

    let statusString = onlineString;
    let statusColor = onlineColor;
    if (health === 'partial') {
        statusString = partialString;
        statusColor = partialColor;
    } else if (health === 'offline') {
        statusString = offlineString;
        statusColor = offlineColor;
    }

    return {
        serverName: 'Los Santos Preview RP',
        statusString,
        statusColor,
        serverCfxId: SAMPLE_CFX_ID,
        serverBrowserUrl: `https://servers.fivem.net/servers/detail/${SAMPLE_CFX_ID}`,
        serverJoinUrl: `https://cfx.re/join/${SAMPLE_CFX_ID}`,
        serverEndpoint: '127.0.0.1:30120',
        serverIp: '127.0.0.1',
        serverPort: '30120',
        serverConnectCommand: 'connect 127.0.0.1:30120',
        serverMaxClients: 128,
        serverClients: 42,
        serverAvailableSlots: 86,
        serverOccupancyPercent: '33%',
        nextScheduledRestart: 'in 2 hrs, 15 mins',
        uptime: '4 hr, 20 mins',
        recentJoinCount: 3,
        recentLeaveCount: 1,
        configurableEmbedDescription:
            'Welcome to the preview server. This card uses sample player counts, uptime, and join links so you can see how placeholders resolve before going live.',
        statusFieldLabel: 'Status',
        playersFieldLabel: 'Players',
        connectCommandFieldLabel: 'Connect',
        nextRestartFieldLabel: 'Next restart',
        uptimeFieldLabel: 'Uptime',
        playerListFieldLabel: 'Player list',
        connectButtonLabel: 'Connect',
        communityButtonLabel: 'Community',
        serverPageButtonLabel: 'Server page',
        ...playerListPlaceholders,
    } as Record<string, unknown>;
};

export const PREVIEW_DEFAULT_FOOTER = {
    icon_url: 'https://cdn.discordapp.com/emojis/1062339910654246964.webp?size=96&quality=lossless',
    text: 'fxPanel preview • Updated every minute',
};
