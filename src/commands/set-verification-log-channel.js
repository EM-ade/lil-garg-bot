const { SlashCommandBuilder } = require('discord.js');
const BotConfig = require('../database/models/BotConfig');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set-verification-log-channel')
        .setDescription('Set the channel for verification logs (Admin only)')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to send verification logs to')
                .setRequired(true)),

    async execute(interaction) {
        // Check if the user has admin permissions
        if (!interaction.member.permissions.has('ADMINISTRATOR')) {
            return await interaction.reply({
                content: '❌ You do not have permission to use this command.',
                ephemeral: true
            });
        }

        const channel = interaction.options.getChannel('channel');

        try {
            // Update the bot configuration with the new log channel
            let config = await BotConfig.findOne({ guildId: interaction.guild.id });

            if (!config) {
                // Create a new config if it doesn't exist
                config = new BotConfig({
                    guildId: interaction.guild.id,
                    guildName: interaction.guild.name,
                    logChannelId: channel.id
                });
            } else {
                config.logChannelId = channel.id;
            }

            await config.save();

            await interaction.reply({
                content: `✅ Verification log channel set to ${channel}`,
                ephemeral: true
            });
        } catch (error) {
            console.error('Error setting verification log channel:', error);
            await interaction.reply({
                content: '❌ Failed to set verification log channel. Please try again.',
                ephemeral: true
            });
        }
    }
};