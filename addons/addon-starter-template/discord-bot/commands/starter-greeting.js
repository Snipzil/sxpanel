/**
 * Discord command that reuses server routes (starter-greeting → POST /greeting).
 *
 * Bot runs in the standalone `bot/` process; privileged work stays in server/index.js.
 * `createAddonDiscordSdk` handles namespaced button/modal IDs and requester payloads.
 *
 * Docs: addon-development.md → Discord Bot Addons
 */

import { createAddonDiscordSdk } from 'addon-sdk/discord';
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ModalBuilder,
    SlashCommandBuilder,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';

// Keep in sync with addon.json → id
const ADDON_ID = 'addon-starter-template';
const presetGreetingNames = ['fxPanel', 'Discord', 'Server Owner', 'there'];

const buildGreetingPayload = async (discord, interaction, name) => {
    return await discord.addonRoute({
        method: 'POST',
        path: '/greeting',
        body: { name },
        interaction,
    });
};

const buildCustomizeButton = (discord, name) => {
    return new ActionRowBuilder().addComponents(
        discord.interactions.button(new ButtonBuilder(), 'editGreeting', {
            label: 'Customize greeting',
            style: ButtonStyle.Primary,
            state: { name },
        }),
    );
};

export default {
    data: new SlashCommandBuilder()
        .setName('starter-greeting')
        .setDescription('Ping the shift board greeting route (autocomplete + modal demo).')
        .addStringOption((option) => {
            return option.setName('name').setDescription('Who should the greeting mention?').setAutocomplete(true);
        }),

    async autocomplete(interaction, bridge) {
        const discord = createAddonDiscordSdk({ addonId: ADDON_ID, bridge });
        const focusedValue = interaction.options.getFocused()?.trim().toLowerCase() ?? '';
        const choices = presetGreetingNames
            .filter((name) => !focusedValue.length || name.toLowerCase().includes(focusedValue))
            .slice(0, 5);

        await discord.respondWithChoices(interaction, choices);
    },

    async execute(interaction, bridge) {
        const discord = createAddonDiscordSdk({ addonId: ADDON_ID, bridge });
        const requestedName = interaction.options.getString('name') ?? interaction.member?.displayName ?? 'there';
        const response = await buildGreetingPayload(discord, interaction, requestedName);

        if (response?.status !== 200) {
            const errorMessage = response?.body?.error ?? 'Addon route request failed.';
            await interaction.reply({
                content: `Starter greeting failed: ${errorMessage}`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await interaction.reply({
            content: response.body.message,
            flags: MessageFlags.Ephemeral,
            components: [buildCustomizeButton(discord, requestedName).toJSON()],
        });
    },

    buttons: {
        async editGreeting(interaction, bridge, context) {
            const discord = createAddonDiscordSdk({ addonId: ADDON_ID, bridge });
            const currentName =
                typeof context?.state?.name === 'string' && context.state.name.trim().length
                    ? context.state.name.trim().slice(0, 32)
                    : (interaction.member?.displayName ?? 'there');

            const modal = discord.interactions.modal(new ModalBuilder(), 'submitGreeting', {
                title: 'Customize greeting',
                state: { previousName: currentName },
                components: [
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('name')
                            .setLabel('Name')
                            .setStyle(TextInputStyle.Short)
                            .setMaxLength(32)
                            .setRequired(true)
                            .setValue(currentName),
                    ),
                ],
            });

            await interaction.showModal(modal);
        },
    },

    modals: {
        async submitGreeting(interaction, bridge) {
            const discord = createAddonDiscordSdk({ addonId: ADDON_ID, bridge });
            const requestedName = interaction.fields.getTextInputValue('name')?.trim().slice(0, 32) || 'there';
            const response = await buildGreetingPayload(discord, interaction, requestedName);

            if (response?.status !== 200) {
                const errorMessage = response?.body?.error ?? 'Addon route request failed.';
                await interaction.reply({
                    content: `Starter greeting failed: ${errorMessage}`,
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            await interaction.reply({
                content: response.body.message,
                flags: MessageFlags.Ephemeral,
                components: [buildCustomizeButton(discord, requestedName).toJSON()],
            });
        },
    },
};
