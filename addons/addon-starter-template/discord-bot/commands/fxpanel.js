/**
 * Minimal addon Discord command — no bridge, no server routes.
 *
 * Loaded because addon.json sets discordBot.commands to this folder.
 * Each .js file here should default-export { data, execute } (and optional handlers).
 */

import { MessageFlags, SlashCommandBuilder } from 'discord.js';

const FXPANEL_WEBSITE_URL = 'https://fxpanel.org/';

export default {
    data: new SlashCommandBuilder().setName('fxpanel').setDescription('Link to the fxPanel site.'),

    async execute(interaction) {
        await interaction.reply({
            content: `fxPanel: ${FXPANEL_WEBSITE_URL}`,
            flags: MessageFlags.Ephemeral,
        });
    },
};
