#!/usr/bin/env node

/**
 * Manually trigger the periodic NFT role check.
 * Usage: node scripts/manual-nft-check.js
 * 
 * This script logs in as the Discord bot, runs the periodic NFT role check
 * for all verified users across all guilds, then logs out and exits.
 */

require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const logger = require('../src/utils/logger');
const { periodicRoleCheck } = require('../src/services/nftRoleManagerService');

async function main() {
    logger.info('Starting manual NFT role check...');

    // Validate environment
    if (!process.env.DISCORD_BOT_TOKEN) {
        logger.error('DISCORD_BOT_TOKEN environment variable is missing.');
        process.exit(1);
    }

    // Create a Discord client with minimal intents
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMembers,
        ],
    });

    // Set up event handlers
    client.once('ready', async () => {
        logger.info(`Logged in as ${client.user.tag}`);
        logger.info(`Bot is in ${client.guilds.cache.size} guild(s).`);

        try {
            // Run the periodic role check
            await periodicRoleCheck(client);
            logger.info('Manual NFT role check completed successfully.');
        } catch (error) {
            logger.error('Error during manual NFT role check:', error);
        } finally {
            // Log out and destroy the client
            client.destroy();
            logger.info('Discord client logged out.');
            process.exit(0);
        }
    });

    client.on('error', (error) => {
        logger.error('Discord client error:', error);
        process.exit(1);
    });

    // Login
    try {
        await client.login(process.env.DISCORD_BOT_TOKEN);
    } catch (error) {
        logger.error('Failed to log in to Discord:', error);
        process.exit(1);
    }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

main();