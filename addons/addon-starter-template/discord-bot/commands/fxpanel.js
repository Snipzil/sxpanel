/**
 * fxPanel Addon — Starter Template (Discord slash command)
 *
 * This file shows the smallest useful Discord command an addon can ship.
 * Running addons can expose slash commands by declaring a `discordBot.commands`
 * directory in addon.json, and every `.js` file in that folder is loaded by the
 * standalone bot runtime.
 *
 * Use this as a starting point for your own commands:
 * - `data` describes the slash command that Discord will register.
 * - `execute()` runs when a user uses `/fxpanel` in Discord.
 * - `interaction.reply()` sends the response back to Discord.
 * - `bridge` is available when you need to call back into fxPanel core or your
 *   addon server routes, but this simple example only needs a static reply.
 */

import { MessageFlags, SlashCommandBuilder } from 'discord.js';

const FXPANEL_WEBSITE_URL = 'https://fxpanel.org/';

export default {
    // `SlashCommandBuilder` gives you the same command shape used by the built-in bot commands.
    data: new SlashCommandBuilder()
        .setName('fxpanel')
        .setDescription('Get the official fxPanel website link.'),

    async execute(interaction) {
        // `flags: MessageFlags.Ephemeral` keeps the reply visible only to the person who ran the command.
        await interaction.reply({
            content: `fxPanel website: ${FXPANEL_WEBSITE_URL}`,
            flags: MessageFlags.Ephemeral,
        });
    },
};