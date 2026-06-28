/**
 * Minimal addon Discord command — no bridge, no server routes.
 *
 * Loaded because addon.json sets discordBot.commands to this folder.
 * Each .js file here should default-export { data, execute } (and optional handlers).
 */

import { MessageFlags, SlashCommandBuilder } from 'discord.js';

const SXPANEL_WEBSITE_URL = 'https://sxpanel.org/';

export default {
    data: new SlashCommandBuilder().setName('sxpanel').setDescription('Link to the sxPanel site.'),

    async execute(interaction) {
        await interaction.reply({
            content: `sxPanel: ${SXPANEL_WEBSITE_URL}`,
            flags: MessageFlags.Ephemeral,
        });
    },
};
