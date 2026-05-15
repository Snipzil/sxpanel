/**
 * fxPanel Addon — Starter Template (Discord slash command with bridge)
 *
 * This command demonstrates the current addon Discord ergonomics surface.
 * It uses:
 * - autocomplete helpers for slash-command options
 * - namespaced button and modal helpers
 * - a bridge-backed addon route so privileged logic stays on the server side
 *
 * Why this pattern exists:
 * - Discord commands run inside the standalone `bot/` runtime.
 * - Your addon's privileged logic should usually stay in `server/index.js`.
 * - `createAddonDiscordSdk({ addonId, bridge }).addonRoute(...)` lets the
 *   command ask fxPanel core to proxy a request into your addon's existing
 *   server routes without rebuilding the requester payload by hand.
 *
 * That means permission checks, storage access, and other addon logic can live
 * in one place instead of being duplicated inside Discord command files.
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

// Update this when you copy/rename the starter template.
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
        .setDescription('Example command that uses addon autocomplete, buttons, modals, and bridge routes.')
        .addStringOption((option) => {
            return option
                .setName('name')
                .setDescription('Who should the greeting mention?')
                .setAutocomplete(true);
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
            const currentName = typeof context?.state?.name === 'string' && context.state.name.trim().length
                ? context.state.name.trim().slice(0, 32)
                : interaction.member?.displayName ?? 'there';
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