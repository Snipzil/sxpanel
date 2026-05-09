const { AuditLogEvent } = require('discord.js');

const resolveConfiguredGuildId = (client) => {
    return client.fxpanel.latestConfigSnapshot?.discordBot?.guild ?? process.env.BOT_GUILD_ID ?? null;
};

const resolveChangedRoleIds = (auditLogEntry, changeKey) => {
    if (!Array.isArray(auditLogEntry?.changes)) return [];

    const roleChanges = auditLogEntry.changes.find((change) => change?.key === changeKey);
    if (!Array.isArray(roleChanges?.new)) return [];

    return [...new Set(
        roleChanges.new
            .map((role) => (role && typeof role === 'object' ? role.id : null))
            .filter((roleId) => typeof roleId === 'string' && roleId.length > 0),
    )];
};

module.exports = {
    name: 'guildAuditLogEntryCreate',
    async execute(auditLogEntry, guild, client, bridge) {
        if (auditLogEntry?.action !== AuditLogEvent.MemberRoleUpdate) {
            return;
        }

        const configuredGuildId = resolveConfiguredGuildId(client);
        if (!configuredGuildId || guild?.id !== configuredGuildId) {
            return;
        }

        if (typeof auditLogEntry.targetId !== 'string' || !auditLogEntry.targetId.length) {
            return;
        }

        const addedRoleIds = resolveChangedRoleIds(auditLogEntry, '$add');
        const removedRoleIds = resolveChangedRoleIds(auditLogEntry, '$remove');
        if (!addedRoleIds.length && !removedRoleIds.length) {
            return;
        }

        bridge.send({
            type: 'syncAdminDiscordRoleChange',
            uid: auditLogEntry.targetId,
            addedRoleIds,
            removedRoleIds,
            auditLogEntryId: auditLogEntry.id,
        });
    },
};