const { request } = require('../../bridge/requests');

const sendStatus = (bridge, payload) => {
    bridge.send({
        type: 'botStatus',
        ...payload,
    });
};

const sendFatalStatus = (bridge, payload) => {
    sendStatus(bridge, {
        status: 'error',
        ...payload,
    });
    setTimeout(() => process.exit(1), 100);
};

module.exports = {
    name: 'clientReady',
    once: true,
    async execute(_readyClient, client, bridge) {
        let guildId;
        try {
            const snapshot = await request('configSnapshot');
            client.sxpanel.latestConfigSnapshot = snapshot;

            guildId = snapshot?.discordBot?.guild ?? process.env.BOT_GUILD_ID ?? undefined;
            const guild = guildId
                ? (client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId).catch(() => null)))
                : null;
            if (!guildId || !guild) {
                sendFatalStatus(bridge, {
                    code: 'CustomNoGuild',
                    clientId: client.user?.id,
                    message: guildId
                        ? `Discord bot could not resolve guild/server ID ${guildId}.`
                        : 'Discord bot enabled while guild id is not set.',
                });
                return;
            }

            const botMember = await guild.members.fetchMe().catch(() => guild.members.me ?? null);
            const botPerms = botMember?.permissions.serialize();
            if (!botPerms) {
                sendFatalStatus(bridge, {
                    message: 'Discord bot could not detect its own permissions.',
                });
                return;
            }

            //Report ready before registering slash commands: registration can take a long
            //time (Discord rate limits repeated registrations) or fail outright (bot invited
            //without the applications.commands scope), and neither should kill the bot or
            //make the panel-side startup wait time out.
            sendStatus(bridge, {
                status: 'ready',
                tag: client.user?.tag,
                guildName: guild?.name,
            });
        } catch (error) {
            console.error('[Bot] Failed to hydrate config snapshot:', error);
            sendFatalStatus(bridge, {
                message: error instanceof Error ? error.message : String(error),
            });
            return;
        }

        try {
            await client.sxpanel.reloadAddonModules({ clearAddonCache: true });
            await client.sxpanel.registerCommands(guildId);
        } catch (error) {
            console.error(
                '[Bot] Failed to register slash commands (the bot stays online, but commands may be missing or stale). ' +
                    'If this persists, re-invite the bot with the applications.commands scope:',
                error,
            );
        }
    },
};
