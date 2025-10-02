const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ChannelType } = require('discord.js');
const BotConfig = require('../database/models/BotConfig');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup-verification')
        .setDescription('Set up a permanent NFT verification message in a channel')
        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('The channel where the verification message should be posted')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
        ),

    async execute(interaction) {
        try {
            // Check if user has admin permissions
            if (!interaction.member.permissions.has('Administrator')) {
                return await interaction.reply({
                    content: '❌ You need administrator permissions to set up verification.',
                    ephemeral: true
                });
            }

            const channel = interaction.options.getChannel('channel');
            
            // Defer the reply since this might take some time
            await interaction.deferReply({ ephemeral: true });

            // Create verification embed with image
            const embed = new EmbedBuilder()
                .setColor('#8B008B')
                .setTitle('🪄 Lil Gargs NFT Verification')
                .setDescription('Click the button below to verify your Lil Gargs NFT ownership and get your special role!')
                .setImage('https://bafybeif32gaqsngxdaply6x5m5htxpuuxw2dljvdv6iokek3xod7lmus24.ipfs.w3s.link/')
                .addFields(
                    {
                        name: '📋 How it works',
                        value: '1. Click "Verify Now" button\n2. Enter your Solana wallet address\n3. Get verified instantly\n4. Receive your exclusive role!',
                        inline: false
                    }
                )
                .setFooter({ text: 'Lil Gargs NFT Verification System' })
                .setTimestamp();

            // Create verify button
            const verifyButton = new ButtonBuilder()
                .setCustomId('nft_verify_button')
                .setLabel('Verify Now')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('✅');

            const buttonRow = new ActionRowBuilder().addComponents(verifyButton);

            // Send the verification message to the channel
            const verificationMessage = await channel.send({
                embeds: [embed],
                components: [buttonRow]
            });

            // Update bot configuration
            const botConfig = await BotConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                {
                    guildId: interaction.guild.id,
                    guildName: interaction.guild.name,
                    verificationChannelId: channel.id,
                    verificationMessageId: verificationMessage.id,
                    lastUpdated: new Date(),
                    updatedBy: {
                        discordId: interaction.user.id,
                        username: interaction.user.username
                    }
                },
                { upsert: true, new: true }
            );

            await interaction.editReply({
                content: `✅ Verification system has been set up in ${channel}! Users can now verify their NFTs by clicking the button.`
            });

            console.log(`Verification system set up in guild ${interaction.guild.name} (${interaction.guild.id}) in channel ${channel.name}`);

        } catch (error) {
            console.error('Error setting up verification:', error);
            try {
                await interaction.editReply({
                    content: '❌ An error occurred while setting up the verification system. Please try again later.'
                });
            } catch (editError) {
                console.error('Failed to edit reply:', editError);
                try {
                    await interaction.followUp({
                        content: '❌ An error occurred while setting up the verification system. Please try again later.',
                        ephemeral: true
                    });
                } catch (followUpError) {
                    console.error('Failed to send follow-up message:', followUpError);
                }
            }
        }
    }
};
