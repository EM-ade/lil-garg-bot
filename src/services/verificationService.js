const { EmbedBuilder } = require('discord.js');
const logger = require('../utils/logger');

const VERIFICATION_LOG_CHANNEL_ID = process.env.VERIFICATION_LOG_CHANNEL_ID; // Get from environment variables

async function logVerification(client, user, walletAddress) {
  const embed = new EmbedBuilder()
    .setColor(0x34A853) // Green color for success
    .setTitle('User Verified')
    .addFields(
      { name: 'User', value: `${user.tag} (${user.id})` },
      { name: 'Wallet Address', value: walletAddress },
      { name: 'Timestamp', value: new Date().toISOString() }
    )
    .setTimestamp();

  try {
    if (!VERIFICATION_LOG_CHANNEL_ID) {
      logger.warn('VERIFICATION_LOG_CHANNEL_ID is not set in environment variables. Verification logs will not be sent to Discord.');
      console.log(`Verification Log (Discord channel not set): User: ${user.tag}, ID: ${user.id}, Wallet: ${walletAddress}, Timestamp: ${new Date().toISOString()}`);
      return;
    }

    const logChannel = await client.channels.fetch(VERIFICATION_LOG_CHANNEL_ID);
    if (logChannel) {
      await logChannel.send({ embeds: [embed] });
      logger.info(`Verification logged for ${user.tag} (${user.id}) in #${logChannel.name}`);
    } else {
      logger.warn(`Verification log channel with ID ${VERIFICATION_LOG_CHANNEL_ID} not found or inaccessible.`);
    }
  } catch (error) {
    logger.error(`Error logging verification for ${user.tag}: ${error.message}`);
  }
}

module.exports = {
  logVerification,
};
