const { SlashCommandBuilder } = require('discord.js');
const BotConfig = require('../database/models/BotConfig');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remove-verification')
        .setDescription('Remove the permanent NFT verification message from this server'),

    async execute(interaction) {
        try {
            // Check if user has admin permissions
            if (!interaction.member.permissions.has('Administrator')) {
                return await interaction.reply({
                    content: '❌ You need administrator permissions to remove verification.',
                    ephemeral: true
                });
            }

            // Defer the reply
            await interaction.deferReply({ ephemeral: true });

            // Get the current configuration
            const botConfig = await BotConfig.findOne({ guildId: interaction.guild.id });
            
            if (!botConfig || !botConfig.verificationChannelId || !botConfig.verificationMessageId) {
                return await interaction.editReply({
                    content: '❌ No verification system is currently set up in this server.'
                });
            }

            try {
                // Try to delete the verification message
                const channel = interaction.guild.channels.cache.get(botConfig.verificationChannelId);
                if (channel) {
                    try {
                        const message = await channel.messages.fetch(botConfig.verificationMessageId);
                        await message.delete();
                    } catch (messageError) {
                        // Message might not exist, that's okay
                        console.log('Verification message not found, proceeding with cleanup:', messageError.message);
                    }
                }
            } catch (channelError) {
                // Channel might not exist, that's okay
                console.log('Verification channel not found, proceeding with cleanup:', channelError.message);
            }

            // Update the configuration to remove verification settings
            await BotConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                {
                    verificationChannelId: null,
                    verificationMessageId: null,
                    lastUpdated: new Date(),
                    updatedBy: {
                        discordId: interaction.user.id,
                        username: interaction.user.username
                    }
                }
            );

            await interaction.editReply({
                content: '✅ Verification system has been removed from this server.'
            });

            console.log(`Verification system removed from guild ${interaction.guild.name} (${interaction.guild.id})`);

        } catch (error) {
            console.error('Error removing verification:', error);
            try {
                await interaction.editReply({
                    content: '❌ An error occurred while removing the verification system. Please try again later.'
                });
            } catch (editError) {
                console.error('Failed to edit reply:', editError);
                try {
                    await interaction.followUp({
                        content: '❌ An error occurred while removing the verification system. Please try again later.',
                        ephemeral: true
                    });
                } catch (followUpError) {
                    console.error('Failed to send follow-up message:', followUpError);
                }
            }
        }
    }
};
