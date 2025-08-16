const { Events } = require('discord.js');
const { logger } = require('../utils/logger');
const { checkMessageRestrictions } = require('../utils/securityManager');
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
      
      // Get guild configuration
      const config = await getGuildConfig(message.guild.id);
      
      // Check for security restrictions
      const securityCheck = checkMessageRestrictions(message, config);
      
      if (securityCheck.restricted) {
        try {
          // Delete the message
          await message.delete();
          
          // Notify the user
          const warningMessage = await message.channel.send({
            content: `<@${message.author.id}>, your message was removed: ${securityCheck.description}`,
            ephemeral: true
          });
          
          // Delete the warning after 5 seconds
          setTimeout(() => {
            warningMessage.delete().catch(err => {
              logger.error('Error deleting warning message:', err);
            });
          }, 5000);
          
          // Log the incident
          logger.info(`Removed restricted message from ${message.author.tag} in ${message.guild.name}: ${securityCheck.reason}`);
          
          return;
        } catch (error) {
          logger.error('Error handling restricted message:', error);
        }
      }
      
      // Check for spam
      const isSpam = await cleanupSpam(message);
      if (isSpam) {
        return;
      }
      
      // Check for username impersonation on new messages
      if (message.member && message.member.joinedTimestamp > Date.now() - 86400000) { // Joined within the last 24 hours
        const { isSimilarUsername } = require('../utils/securityManager');
        
        if (isSimilarUsername(message.author.username)) {
          try {
            // Kick the user
            await message.member.kick('Username impersonation detected');
            
            // Log the incident
            logger.warn(`Kicked user ${message.author.tag} for username impersonation`);
            
            // Notify admins
            const logChannel = message.guild.channels.cache.get(config.logChannelId);
            if (logChannel) {
              await logChannel.send({
                content: `⚠️ Kicked user ${message.author.tag} (${message.author.id}) for username impersonation.`
              });
            }
          } catch (error) {
            logger.error('Error kicking user for username impersonation:', error);
          }
          
          return;
        }
      }
      
      // Process AI chat mentions if enabled
      if (config.featuresEnabled.aiChat && message.mentions.has(client.user)) {
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