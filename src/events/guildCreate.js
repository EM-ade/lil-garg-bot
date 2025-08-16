const { Events } = require('discord.js');
const { logger } = require('../utils/logger');
const { getGuildConfig } = require('../utils/dbUtils');
const { createEmbed } = require('../utils/embedBuilder');

module.exports = {
  name: Events.GuildCreate,
  async execute(guild, client) {
    try {
      logger.info(`Bot added to new guild: ${guild.name} (${guild.id}) with ${guild.memberCount} members`);
      
      // Create guild configuration in database
      const config = await getGuildConfig(guild.id);
      
      // Find a suitable channel to send welcome message
      const systemChannel = guild.systemChannel;
      const generalChannel = guild.channels.cache.find(
        channel => channel.name.toLowerCase().includes('general') && 
                  channel.type === 0 && // TextChannel
                  channel.permissionsFor(guild.members.me).has('SendMessages')
      );
      
      const targetChannel = systemChannel || generalChannel || 
                           guild.channels.cache.find(
                             channel => channel.type === 0 && // TextChannel
                                       channel.permissionsFor(guild.members.me).has('SendMessages')
                           );
      
      if (targetChannel) {
        // Send welcome message
        const welcomeEmbed = createEmbed({
          title: 'Thanks for adding Lil\' Gargs Bot!',
          description: 'I\'m a custom Discord bot with many features including:\n\n' +
                      '• AI Chat System (`/askgarg`, `/gargoracle`)\n' +
                      '• Pet System (`/pet adopt`, `/pet feed`, etc.)\n' +
                      '• Battle System (`/battle start`, `/battle arena`)\n' +
                      '• NFT Verification\n' +
                      '• Ticket System\n' +
                      '• Security & Anti-Raid Features\n\n' +
                      'Use `/config` to set up the bot for your server.',
          color: 'primary',
          thumbnail: client.user.displayAvatarURL(),
          footer: { text: 'Type /help for a list of commands' }
        });
        
        await targetChannel.send({ embeds: [welcomeEmbed] });
        logger.info(`Sent welcome message to ${targetChannel.name} in ${guild.name}`);
      }
      
      // Check if the bot has the necessary permissions
      const me = guild.members.me;
      const missingPermissions = [];
      
      const requiredPermissions = [
        'ManageRoles',
        'KickMembers',
        'BanMembers',
        'ManageChannels',
        'ManageMessages',
        'EmbedLinks',
        'AttachFiles',
        'ReadMessageHistory',
        'AddReactions',
        'UseExternalEmojis',
        'MentionEveryone'
      ];
      
      for (const permission of requiredPermissions) {
        if (!me.permissions.has(permission)) {
          missingPermissions.push(permission);
        }
      }
      
      // Notify about missing permissions
      if (missingPermissions.length > 0 && targetChannel) {
        const permissionsEmbed = createEmbed({
          title: '⚠️ Missing Permissions',
          description: 'I\'m missing some permissions that are required for full functionality:\n\n' +
                      missingPermissions.map(p => `• ${p}`).join('\n') + '\n\n' +
                      'Please update my permissions to ensure all features work correctly.',
          color: 'warning'
        });
        
        await targetChannel.send({ embeds: [permissionsEmbed] });
        logger.warn(`Missing permissions in ${guild.name}: ${missingPermissions.join(', ')}`);
      }
      
    } catch (error) {
      logger.error(`Error handling guild create event for ${guild.name}:`, error);
    }
  }
};