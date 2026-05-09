const {
    ChannelType,
    SlashCommandBuilder,
} = require('discord.js');
const { normalizeMessageEditPayload } = require('../../componentsV2');
const { request } = require('../../bridge/requests');
const {
    buildReply,
    getRequesterPayload,
    resolveBridgeReply,
    sendBridgeError,
    translateBot,
} = require('./common');

const deleteStoredEmbedMessage = async (source, client, channelId, messageId, embedLabel) => {
    const oldChannel = await client.channels.fetch(channelId).catch(() => null);
    if (!oldChannel) {
        throw new Error(translateBot(source, 'persistent_embed.channel_not_found', { channelId }));
    }

    if (oldChannel.type !== ChannelType.GuildText && oldChannel.type !== ChannelType.GuildAnnouncement) {
        throw new Error(
            translateBot(source, 'persistent_embed.stored_channel_not_supported', { embedLabel }),
        );
    }

    await oldChannel.messages.delete(messageId);
};

const createPersistentEmbedCommand = ({
    commandName,
    description,
    addDescription,
    removeDescription,
    embedTarget,
    localeKey,
}) => {
    return {
        data: new SlashCommandBuilder()
            .setName(commandName)
            .setDescription(description)
            .addSubcommand((subcommand) => {
                return subcommand.setName('add').setDescription(addDescription);
            })
            .addSubcommand((subcommand) => {
                return subcommand.setName('remove').setDescription(removeDescription);
            }),
        async execute(interaction) {
            const subcommand = interaction.options.getSubcommand();
            const embedLabel = translateBot(interaction, `persistent_embed.${localeKey}.lower_name`);
            const savedReply = translateBot(interaction, `persistent_embed.${localeKey}.saved`);
            const removedReply = translateBot(interaction, `persistent_embed.${localeKey}.removed`);
            const requesterPayload = {
                target: embedTarget,
                ...getRequesterPayload(interaction),
            };

            try {
                const stateResponse = await request('persistentEmbedCommand', {
                    action: 'getState',
                    ...requesterPayload,
                });
                if (await resolveBridgeReply(interaction, stateResponse)) return;

                const hasStoredEmbed =
                    typeof stateResponse?.channelId === 'string' && typeof stateResponse?.messageId === 'string';

                if (subcommand === 'remove') {
                    if (!hasStoredEmbed) {
                        await interaction.reply(
                            buildReply(
                                'warning',
                                translateBot(interaction, 'persistent_embed.failed_remove_no_saved_message', {
                                    embedLabel,
                                }),
                                true,
                            ),
                        );
                        return;
                    }

                    try {
                        await deleteStoredEmbedMessage(
                            interaction,
                            interaction.client,
                            stateResponse.channelId,
                            stateResponse.messageId,
                            embedLabel,
                        );
                    } catch (error) {
                        await interaction.reply(
                            buildReply(
                                'warning',
                                translateBot(interaction, 'persistent_embed.failed_remove_error', {
                                    embedLabel,
                                    message: error instanceof Error ? error.message : String(error),
                                }),
                                true,
                            ),
                        );
                        return;
                    }

                    const clearResponse = await request('persistentEmbedCommand', {
                        action: 'clearLocation',
                        ...requesterPayload,
                    });
                    if (await resolveBridgeReply(interaction, clearResponse)) return;

                    await interaction.reply(buildReply('success', removedReply, true));
                    return;
                }

                if (
                    interaction.channel?.type !== ChannelType.GuildText &&
                    interaction.channel?.type !== ChannelType.GuildAnnouncement
                ) {
                    await interaction.reply(
                        buildReply(
                            'danger',
                            translateBot(interaction, 'common.channel_type_not_supported'),
                            true,
                        ),
                    );
                    return;
                }

                if (hasStoredEmbed) {
                    await deleteStoredEmbedMessage(
                        interaction,
                        interaction.client,
                        stateResponse.channelId,
                        stateResponse.messageId,
                        embedLabel,
                    ).catch(() => {});
                    const clearResponse = await request('persistentEmbedCommand', {
                        action: 'clearLocation',
                        logAction: false,
                        ...requesterPayload,
                    });
                    if (clearResponse?.reply) {
                        await resolveBridgeReply(interaction, clearResponse);
                        return;
                    }
                }

                const messageResponse = await request('persistentEmbedCommand', {
                    action: 'getMessage',
                    ...requesterPayload,
                });
                if (await resolveBridgeReply(interaction, messageResponse)) return;
                if (!messageResponse?.messagePayload) {
                    throw new Error(
                        translateBot(interaction, 'persistent_embed.no_bridge_payload', { embedLabel }),
                    );
                }

                const newMessage = await interaction.channel.send(
                    buildReply(
                        'warning',
                        translateBot(interaction, 'persistent_embed.placeholder_message'),
                    ),
                );
                await newMessage.edit(normalizeMessageEditPayload(messageResponse.messagePayload));

                const saveResponse = await request('persistentEmbedCommand', {
                    action: 'saveLocation',
                    ...requesterPayload,
                    channelId: interaction.channelId,
                    messageId: newMessage.id,
                });
                if (await resolveBridgeReply(interaction, saveResponse)) return;

                await interaction.reply(buildReply('success', savedReply, true));
            } catch (error) {
                await sendBridgeError(interaction, `/${commandName}`, error);
            }
        },
    };
};

module.exports = {
    createPersistentEmbedCommand,
};