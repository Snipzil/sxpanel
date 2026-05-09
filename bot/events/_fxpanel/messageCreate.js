module.exports = {
    name: 'messageCreate',
    async execute(message, client, bridge) {
        if (message.author.bot) return;
        if (!message.channel.isThread()) return;

        const content = message.content.trim();
        const imageUrls = [...message.attachments.values()]
            .map((attachment) => attachment.url)
            .filter(Boolean)
            .slice(0, 3);

        if (!content.length && imageUrls.length === 0) return;

        const authorName = message.member?.displayName ?? message.author.globalName ?? message.author.username;
        bridge.send({
            type: 'ticketThreadMessage',
            threadId: message.channel.id,
            authorName,
            content,
            imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
            ts: Math.floor(message.createdTimestamp / 1000),
        });
    },
};