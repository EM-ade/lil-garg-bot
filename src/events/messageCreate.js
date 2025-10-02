const { Events } = require('discord.js');
const { logger } = require('../utils/logger');
const { cleanupSpam } = require('../utils/cleanupManager');
const { getGuildConfig } = require('../utils/dbUtils');
const { processAskGarg } = require('../utils/askGargProcessor');

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
      logger.debug(`Guild config for ${message.guild.id}: ${JSON.stringify(config)}`);
      
      // Spam checking is already handled by securityMonitor.js, but if cleanupSpam
      // has additional non-moderation related cleanup, keep it.
      // Otherwise, this might be redundant.
      const isSpam = await cleanupSpam(message);
      if (isSpam) {
        return;
      }
      // as securityMonitor.js is responsible for link filtering and other checks.

      // Process AI chat mentions or replies if enabled
      if (config?.featuresEnabled?.aiChat) {
        try {
          const mentionPattern = new RegExp(`<@!?${client.user.id}>`);
          const hasDirectMention = mentionPattern.test(message.content);
          const hasBroadcastMention = message.mentions.everyone;
          const hasRoleOnlyMention = message.mentions.roles.size > 0 && !hasDirectMention;

          if (hasBroadcastMention || hasRoleOnlyMention) {
            logger.debug('Skipping AI response due to broadcast or role-only mention.');
            return;
          }

          const isReply = message.reference && message.reference.messageId;
          
          let repliedMessage;
          if (isReply) {
            try {
              repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            } catch (error) {
              logger.warn(`Could not fetch replied message ${message.reference.messageId}: ${error.message}`);
            }
          }
          const isBotReply = repliedMessage && repliedMessage.author.id === client.user.id;

          if (!hasDirectMention && !isBotReply) {
            return;
          }

          if (hasDirectMention || isBotReply) {

            let question = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
            if (isBotReply && repliedMessage.content) {
              question = message.content.trim();
            }

            logger.debug(`Extracted question for AI chat: "${question}"`);

            // Defer reply to show thinking state
            const replyMessage = await message.channel.send("Thinking...");

            const replyFunction = async (response) => {
              if (response.content) {
                await replyMessage.edit({ content: response.content });
              } else if (response.embeds) {
                await replyMessage.edit({ content: null, embeds: response.embeds });
              } else {
                await replyMessage.edit({ content: "An unknown error occurred." });
              }
            };

            await processAskGarg(
              question,
              message.author.id,
              message.author.username,
              message.guild.id,
              message.channel.id,
              replyFunction,
              message.author.displayAvatarURL()
            );
            return;
          }
        } catch (error) {
          logger.error('Error processing AI chat mention/reply:', error);
          await message.reply({
            content: "❌ I encountered an error while processing your question. Please try again later.",
            ephemeral: true
          });
        }
      }
    } catch (error) {
      logger.error('Error handling message:', error);
    }
  }
};