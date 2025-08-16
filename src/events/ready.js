const { Events } = require('discord.js');
const { logger } = require('../utils/logger');
const { connectDatabase } = require('../database/connection');
const schedule = require('node-schedule');
const { cleanupBattleChannels, cleanupTicketChannels } = require('../utils/cleanupManager');

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