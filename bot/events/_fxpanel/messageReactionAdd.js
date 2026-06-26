const { request } = require('../../bridge/requests');

const APPROVE_EMOJIS = new Set(['✅', '☑️', '👍']);
const DENY_EMOJIS = new Set(['❌', '✖️', '👎']);

module.exports = {
    name: 'messageReactionAdd',
    async execute(reaction, user, client) {
        if (user.bot) return;

        try {
            if (reaction.partial) await reaction.fetch();
            if (reaction.message?.partial) await reaction.message.fetch();
        } catch {
            return;
        }

        const message = reaction.message;
        if (!message?.channel?.isThread?.()) return;

        const emoji = reaction.emoji.name;
        let action;
        if (APPROVE_EMOJIS.has(emoji)) action = 'approve';
        else if (DENY_EMOJIS.has(emoji)) action = 'deny';
        else return;

        const guildId = client.fxpanel?.latestConfigSnapshot?.discordBot?.guild ?? process.env.BOT_GUILD_ID;
        const guild = guildId ? client.guilds.cache.get(guildId) : null;
        const member =
            guild?.members.cache.get(user.id) ?? (guild ? await guild.members.fetch(user.id).catch(() => null) : null);
        const memberRoles = member?.roles?.cache ? [...member.roles.cache.keys()] : [];

        try {
            await request('whitelistReviewReaction', {
                threadId: message.channel.id,
                action,
                requesterId: user.id,
                memberRoles,
            });
        } catch (error) {
            console.error(`[Bot] whitelistReviewReaction failed: ${error.message}`);
        }
    },
};
