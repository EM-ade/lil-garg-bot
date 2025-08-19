const { Events } = require('discord.js');
const { logger } = require('../utils/logger');
const { cleanupSpam } = require('../utils/cleanupManager');
const { getGuildConfig } = require('../utils/dbUtils');

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    try {
      // Ignore messages from bots or system messages
      if (message.author.bot || message.system) {
        return;
      }
      
      // Ignore DMs for now
      if (!message.guild) {
        return;
      }
      
      // Get guild configuration (if needed for other non-security specific features)
      const config = await getGuildConfig(message.guild.id);
      
      // Spam checking is already handled by securityMonitor.js, but if cleanupSpam
      // has additional non-moderation related cleanup, keep it.
      // Otherwise, this might be redundant.
      const isSpam = await cleanupSpam(message);
      if (isSpam) {
        return;
      }

      // Removed the direct call to securityManager.handleMessageContent
      // as securityMonitor.js is responsible for link filtering and other checks.

      // Process AI chat mentions if enabled
      if (config?.featuresEnabled?.aiChat && message.mentions.has(client.user)) {
        try {
          // Check if AI chat is enabled in this channel
          const channelFeatures = config.channelFeatures.get(message.channel.id);
          if (!channelFeatures || channelFeatures.aiChat !== false) {
            // Process AI chat
            const aiChatbot = require('../services/aiChatbot');
            await aiChatbot.processAiChatMention(message, client);
            return;
          }
        } catch (error) {
          logger.error('Error processing AI chat mention:', error);
        }
      }
      
    } catch (error) {
      logger.error('Error handling message:', error);
    }
  }
};