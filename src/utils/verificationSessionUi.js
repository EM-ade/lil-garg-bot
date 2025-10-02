const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config/environment');

function buildVerificationLink(token) {
  const baseUrl = config.frontend?.url?.replace(/\/$/, '') || '';
  if (!baseUrl) {
    return null;
  }
  return `${baseUrl}/verify?token=${encodeURIComponent(token)}`;
}

function buildSessionEmbed({ walletAddress, expiresAt, verificationUrl }) {
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
        value: expiresAt ? new Date(expiresAt).toLocaleString() : '10 minutes',
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
  buildVerificationLink,
  buildSessionEmbed,
};
