const { Events, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { logger } = require('../utils/logger');
const { connectDatabase } = require('../database/connection');
const schedule = require('node-schedule');
const { cleanupBattleChannels, cleanupTicketChannels } = require('../utils/cleanupManager');
const BotConfig = require('../database/models/BotConfig');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    try {
      // Log that the bot is online
      logger.info(`Ready! Logged in as ${client.user.tag}`);
      
      // Set bot activity
      client.user.setActivity('/help | Lil\' Gargs', { type: 'PLAYING' });
      
      // Connect to database if not already connected
      if (!client.dbConnection) {
        client.dbConnection = await connectDatabase();
        logger.info('Connected to MongoDB database');
      }
      
      // Schedule cleanup jobs
      scheduleCleanupJobs(client);
      
      // Log guild information
      const guildCount = client.guilds.cache.size;
      const totalMembers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
      
      logger.info(`Bot is in ${guildCount} guilds with a total of ${totalMembers} members`);
      
      // Log command information
      logger.info(`Loaded ${client.commands.size} commands`);
      
      // Restore verification messages for all guilds
      await restoreVerificationMessages(client);
      
    } catch (error) {
      logger.error('Error in ready event:', error);
    }
  }
};

/**
 * Schedules regular cleanup jobs
 * @param {Client} client - The Discord client
 */
function scheduleCleanupJobs(client) {
  // Schedule battle channel cleanup every hour
  schedule.scheduleJob('0 * * * *', async function() {
    try {
      await cleanupBattleChannels(client);
    } catch (error) {
      logger.error('Error in battle channel cleanup job:', error);
    }
  });
  
  // Schedule ticket channel cleanup every 6 hours
  schedule.scheduleJob('0 */6 * * *', async function() {
    try {
      await cleanupTicketChannels(client);
    } catch (error) {
      logger.error('Error in ticket channel cleanup job:', error);
    }
  });
  
  // Schedule pet maintenance every 3 hours
  schedule.scheduleJob('0 */3 * * *', async function() {
    try {
      const petMaintenanceService = require('../services/petMaintenanceService');
      await petMaintenanceService.performMaintenance(client);
    } catch (error) {
      logger.error('Error in pet maintenance job:', error);
    }
  });
  
  // Schedule NFT verification check daily at midnight
  schedule.scheduleJob('0 0 * * *', async function() {
    try {
      const nftMonitoringService = require('../services/nftMonitoringService');
      await nftMonitoringService.verifyAllUsers(client);
    } catch (error) {
      logger.error('Error in NFT verification job:', error);
    }
  });
  
  logger.info('Scheduled cleanup and maintenance jobs');
}

/**
 * Restores verification messages for all guilds
 * @param {Client} client - The Discord client
 */
async function restoreVerificationMessages(client) {
  try {
    logger.info('Restoring verification messages...');
    
    // Get all bot configurations
    const botConfigs = await BotConfig.find({
      verificationChannelId: { $ne: null },
      verificationMessageId: { $ne: null }
    });
    
    let restoredCount = 0;
    let errorCount = 0;
    
    for (const config of botConfigs) {
      try {
        const guild = client.guilds.cache.get(config.guildId);
        if (!guild) {
          logger.warn(`Guild ${config.guildId} not found, skipping verification message restoration`);
          continue;
        }
        
        const channel = guild.channels.cache.get(config.verificationChannelId);
        if (!channel) {
          logger.warn(`Verification channel ${config.verificationChannelId} not found in guild ${guild.name}`);
          continue;
        }
        
        // Try to fetch the existing message
        try {
          const existingMessage = await channel.messages.fetch(config.verificationMessageId);
          
          // Check if the message still has the button
          if (existingMessage.components.length === 0 || 
              !existingMessage.components[0].components.some(comp => comp.customId === 'nft_verify_button')) {
            // Message exists but button is missing, recreate it
            await recreateVerificationMessage(channel, config);
            restoredCount++;
          } else {
            // Message and button are intact
            logger.info(`Verification message intact in guild ${guild.name}`);
          }
        } catch (messageError) {
          // Message doesn't exist or can't be accessed, recreate it
          await recreateVerificationMessage(channel, config);
          restoredCount++;
        }
      } catch (guildError) {
        logger.error(`Error restoring verification message for guild ${config.guildId}:`, guildError);
        errorCount++;
      }
    }
    
    logger.info(`Restored ${restoredCount} verification messages, ${errorCount} errors`);
  } catch (error) {
    logger.error('Error in restoreVerificationMessages:', error);
  }
}

/**
 * Recreates a verification message in the specified channel
 * @param {TextChannel} channel - The channel to create the message in
 * @param {Object} config - The bot configuration
 */
async function recreateVerificationMessage(channel, config) {
  try {
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

    // Send the verification message
    const verificationMessage = await channel.send({
      embeds: [embed],
      components: [buttonRow]
    });

    // Update the configuration with the new message ID
    await BotConfig.findOneAndUpdate(
      { guildId: config.guildId },
      { 
        verificationMessageId: verificationMessage.id,
        lastUpdated: new Date()
      }
    );

    logger.info(`Recreated verification message in guild ${config.guildName}`);
  } catch (error) {
    logger.error(`Error recreating verification message in channel ${channel.id}:`, error);
    throw error;
  }
}
