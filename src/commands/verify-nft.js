const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config/environment');
const {
  verificationSessionService,
  VerificationSessionError,
} = require('../services/verificationSessionService');
const { registerInteraction } = require('../services/sessionInteractionRegistry');

function buildVerificationLink(token) {
  const baseUrl = config.frontend?.url?.replace(/\/$/, '') || '';
  if (!baseUrl) {
    return null;
  }
  return `${baseUrl}/session/${encodeURIComponent(token)}`;
}

function buildSupabaseSuccessEmbed({ walletAddress, expiresAt, verificationUrl }) {
  const embed = new EmbedBuilder()
    .setColor('#8B008B')
    .setTitle('🔐 Continue NFT Verification')
    .setDescription(
      'We created a secure verification session for your wallet. Click the button below to finish verification on the Lil Gargs portal.'
    )
    .addFields(
      {
        name: 'Wallet Address',
        value: `\`${walletAddress}\``,
        inline: false,
      },
      {
        name: 'Session Expires',
        value: expiresAt
          ? new Date(expiresAt).toLocaleString()
          : '10 minutes',
        inline: true,
      },
      {
        name: 'Next Steps',
        value:
          '1. Open the verification portal\n2. Connect your wallet\n3. Sign the verification message\n4. Return to Discord – roles update automatically',
        inline: false,
      }
    )
    .setTimestamp();

  const button = new ButtonBuilder()
    .setLabel('Open Verification Portal')
    .setStyle(ButtonStyle.Link)
    .setURL(verificationUrl);

  const row = new ActionRowBuilder().addComponents(button);

  return { embed, components: [row] };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verify-nft')
        .setDescription('Start the NFT verification process for Lil Gargs'),

    async execute(interaction) {
        try {
            // Immediately defer the reply to prevent interaction timeout
            await interaction.deferReply({ ephemeral: true });

            // Create verification embed with image
            const embed = new EmbedBuilder()
                .setColor('#8B008B')
                .setTitle('🪄 Lil Gargs NFT Verification')
                .setDescription('Click the button below to verify your Lil Gargs NFT ownership and get your special role!')
                .setImage('https://bafybeif32gaqsngxdaply6x5m5htxpuuxw2dljvdv6iokek3xod7lmus24.ipfs.w3s.link/') // Your NFT image URL
                .addFields(
                    {
                        name: '📋 How it works',
                        value: '1. Click "Verify Now"\n2. Approve the portal session\n3. Connect your wallet & sign\n4. Receive your exclusive role!',
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

            // Edit the deferred reply with the embed and button
            await interaction.editReply({
                embeds: [embed],
                components: [buttonRow]
            });

        } catch (error) {
            console.error('Error in verify-nft command:', error);
            // If we can't edit the reply, the interaction might already be completed
            try {
                await interaction.followUp({
                    content: '❌ An error occurred while starting the verification process. Please try again later.',
                    ephemeral: true,
                });
            } catch (followUpError) {
                console.error('Failed to send follow-up message:', followUpError);
              }
        }
    },

    // Handle button interaction
    async handleButtonInteraction(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const session = await verificationSessionService.createSession({
                discordId: interaction.user.id,
                guildId: interaction.guildId,
                username: interaction.user.username,
            });

            registerInteraction(session.token, {
                interactionId: interaction.id,
                interactionToken: interaction.token,
                channelId: interaction.channelId,
                userId: interaction.user.id,
                guildId: interaction.guildId,
            });

            const verificationUrl = buildVerificationLink(session.token);
            if (!verificationUrl) {
                throw new VerificationSessionError(
                    'Verification portal URL is not configured. Please contact an administrator.',
                    500
                );
            }

            const { embed, components } = buildSupabaseSuccessEmbed({
                walletAddress: 'Connect in portal',
                expiresAt: session.expiresAt,
                verificationUrl,
            });

            await interaction.editReply({
                embeds: [embed],
                components,
                ephemeral: true,
            });
        } catch (error) {
            if (error instanceof VerificationSessionError) {
                await interaction.editReply({
                    content: `❌ ${error.message}`,
                    ephemeral: true,
                });
                return;
            }

            console.error('Error creating verification session from interactive button:', error);
            await interaction.editReply({
                content: '❌ Failed to start verification session. Please try again later.',
                ephemeral: true,
            });
        }
    },
};
