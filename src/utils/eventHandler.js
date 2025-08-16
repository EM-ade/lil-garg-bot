const fs = require('fs');
const path = require('path');
const { Events } = require('discord.js');
const { logger } = require('./logger');
const { handleButtons } = require('./buttonHandler');

/**
 * Sets up all event handlers for the Discord client
 * @param {Client} client - The Discord.js client instance
 */
function setupEventHandlers(client) {
  // Create events directory if it doesn't exist
  const eventsPath = path.join(__dirname, '../events');
  if (!fs.existsSync(eventsPath)) {
    fs.mkdirSync(eventsPath, { recursive: true });
    logger.info('Created events directory');
  }
  
  // Set up built-in event handlers
  setupBuiltInEvents(client);
  
  // Load custom event handlers from files
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
  
  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    
    try {
      const event = require(filePath);
      
      if (event.once) {
       client.once(event.name, (...args) => event.execute(...args, client));
       logger.info(`Registered one-time event handler: ${event.name}`);
     } else {
       client.on(event.name, (...args) => event.execute(...args, client));
       logger.info(`Registered event handler: ${event.name}`);
     }
    } catch (error) {
      logger.error(`Error loading event handler from ${filePath}:`, error);
    }
  }
}

/**
 * Sets up built-in event handlers
 * @param {Client} client - The Discord.js client instance
 */
function setupBuiltInEvents(client) {
  // InteractionCreate is handled by the dedicated event handler in src/events/interactionCreate.js

  // Handle guild member add (new member joins)
  client.on(Events.GuildMemberAdd, async member => {
    try {
      // Get bot configuration from database
      const { BotConfig } = require('../database/models');
      const config = await BotConfig.findOne({ guildId: member.guild.id });
      
      if (!config || !config.welcomeChannelId || !config.welcomeMessage) {
        return;
      }
      
      const welcomeChannel = member.guild.channels.cache.get(config.welcomeChannelId);
      if (!welcomeChannel) return;
      
      // Replace placeholders in welcome message
      let welcomeMessage = config.welcomeMessage
        .replace('{user}', `<@${member.id}>`)
        .replace('{server}', member.guild.name);
      
      await welcomeChannel.send(welcomeMessage);
      logger.info(`Sent welcome message to ${member.user.tag} in ${member.guild.name}`);
    } catch (error) {
      logger.error('Error handling guild member add event:', error);
    }
  });

  // Log when the bot is ready
  client.once(Events.ClientReady, () => {
    logger.info(`Ready! Logged in as ${client.user.tag}`);
  });
}

module.exports = { setupEventHandlers };