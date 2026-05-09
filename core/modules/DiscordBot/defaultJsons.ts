import { txEnv } from '@core/globalData';

export const defaultEmbedJson = JSON.stringify({
    title: '{{serverName}}',
    url: '{{serverBrowserUrl}}',
    description: '{{configurableEmbedDescription}}',
    fields: [
        {
            name: '{{statusFieldLabel}}',
            value: '```\n{{statusString}}\n```',
            inline: true,
        },
        {
            name: '{{playersFieldLabel}}',
            value: '```\n{{serverClients}}/{{serverMaxClients}}\n```',
            inline: true,
        },
        {
            name: '{{connectCommandFieldLabel}}',
            value: '```\n{{serverConnectCommand}}\n```',
        },
        {
            name: '{{nextRestartFieldLabel}}',
            value: '```\n{{nextScheduledRestart}}\n```',
            inline: true,
        },
        {
            name: '{{uptimeFieldLabel}}',
            value: '```\n{{uptime}}\n```',
            inline: true,
        },
    ],
    image: {
        url: 'https://media.discordapp.net/attachments/1489272229157142538/1489655809754271814/Placeholderbanner.png',
    },
    thumbnail: {
        url: 'https://media.discordapp.net/attachments/1489272229157142538/1489655810555515061/Logo.png',
    },
    footer: {
        icon_url: 'https://media.discordapp.net/attachments/1489272229157142538/1489655810555515061/Logo.png',
        text: `fxPanel ${txEnv.txaVersion}`,
    },
});

export const defaultEmbedConfigJson = JSON.stringify({
    onlineColor: '#0BA70B',
    partialColor: '#FFF100',
    offlineColor: '#A70B28',
    playerLineTemplate: '`#{{netid}}` {{displayName}}',
    playerInlineTemplate: '{{displayName}}',
    playerListSeparator: '\n',
    playerListInlineSeparator: ', ',
    maxPlayersShown: 128,
    buttons: [
        {
            emoji: '1062338355909640233',
            label: '{{connectButtonLabel}}',
            url: '{{serverJoinUrl}}',
        },
        {
            emoji: '1062339910654246964',
            label: '{{communityButtonLabel}}',
            url: 'https://discord.gg/6FcqBYwxH5',
        },
    ].filter(Boolean),
});

export const defaultPlayerListEmbedJson = JSON.stringify({
    title: '{{serverName}}',
    url: '{{serverBrowserUrl}}',
    color: '{{statusColor}}',
    description: '**{{playerListSummary}}**\n{{playerListPageSummary}}',
    fields: [
        {
            name: '{{playerListFieldLabel}}',
            value: '{{playerListColumns}}',
        },
    ],
    thumbnail: {
        url: 'https://media.discordapp.net/attachments/1489272229157142538/1489655810555515061/Logo.png',
    },
    footer: {
        icon_url: 'https://media.discordapp.net/attachments/1489272229157142538/1489655810555515061/Logo.png',
        text: `fxPanel ${txEnv.txaVersion}`,
    },
});

export const defaultPlayerListEmbedConfigJson = JSON.stringify({
    onlineColor: '#0BA70B',
    partialColor: '#FFF100',
    offlineColor: '#A70B28',
    playerLineTemplate: '👤 **{{displayName}}**\n⏳ {{playTime}}',
    playerInlineTemplate: '{{displayName}} ({{playTime}})',
    playerColumnTemplate: '• {{displayName}}',
    playerColumnCount: 3,
    playersPerColumn: 10,
    playerListSeparator: '\n',
    playerListInlineSeparator: ' | ',
    showPagerButtons: true,
    buttons: [
        {
            emoji: '1062338355909640233',
            label: '{{connectButtonLabel}}',
            url: '{{serverJoinUrl}}',
        },
        {
            emoji: '🧭',
            label: '{{serverPageButtonLabel}}',
            url: '{{serverBrowserUrl}}',
        },
    ],
});
