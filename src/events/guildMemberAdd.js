const { Events } = require('discord.js');
const { logger } = require('../utils/logger');
const { getGuildConfig } = require('../utils/dbUtils');
const { isSimilarUsername } = require('../utils/securityManager');
const { createEmbed } = require('../utils/embedBuilder');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member, client) {
    try {
      // Get guild configuration
      const config = await getGuildConfig(member.guild.id);
      
      // Check for username impersonation
      if (isSimilarUsername(member.user.username)) {
        try {
          // Kick the user
          await member.kick('Username impersonation detected');
          
          // Log the incident
          logger.warn(`Kicked user ${member.user.tag} for username impersonation upon joining ${member.guild.name}`);
          
          // Notify admins
          const logChannel = member.guild.channels.cache.get(config.logChannelId);
          if (logChannel) {
            await logChannel.send({
              content: `⚠️ Kicked user ${member.user.tag} (${member.user.id}) for username impersonation upon joining.`
            });
          }
          
          return;
        } catch (error) {
          logger.error('Error kicking user for username impersonation:', error);
        }
      }
      
      // Send welcome message if enabled
      if (config.welcomeChannelId && config.welcomeMessage) {
        try {
          const welcomeChannel = member.guild.channels.cache.get(config.welcomeChannelId);
          
          if (welcomeChannel) {
            // Replace placeholders in welcome message
            let welcomeMessage = config.welcomeMessage
              .replace('{user}', `<@${member.id}>`)
              .replace('{server}', member.guild.name);
            
            // Create welcome embed
            const welcomeEmbed = createEmbed({
              title: `Welcome to ${member.guild.name}!`,
              description: welcomeMessage,
              color: 'primary',
              thumbnail: member.user.displayAvatarURL({ dynamic: true }),
              footer: { text: `Member #${member.guild.memberCount}` }
            });
            
            // Send welcome message
            await welcomeChannel.send({
              content: `<@${member.id}>`,
              embeds: [welcomeEmbed]
            });
            
            logger.info(`Sent welcome message to ${member.user.tag} in ${member.guild.name}`);
          }
        } catch (error) {
          logger.error('Error sending welcome message:', error);
        }
      }
      
      // Send AI-powered welcome DM
      try {
        if (config.featuresEnabled.aiChat) {
          const aiChatbot = require('../services/aiChatbot');
          
          // Generate personalized welcome message
          const welcomeDM = await aiChatbot.generateWelcomeMessage(member);
          
          // Send DM to new member
          await member.send({
            embeds: [
              createEmbed({
                title: `Welcome to ${member.guild.name}!`,
                description: welcomeDM,
                color: 'primary',
                thumbnail: member.guild.iconURL({ dynamic: true }),
                footer: { text: 'Lil\' Gargs Discord Bot' }
              })
            ]
          });
          
          logger.info(`Sent welcome DM to ${member.user.tag}`);
        }
      } catch (error) {
        // Don't worry if we can't send DMs, some users have them disabled
        logger.warn(`Couldn't send welcome DM to ${member.user.tag}:`, error);
      }
      
    } catch (error) {
      logger.error('Error handling guild member add event:', error);
    }
  }
};