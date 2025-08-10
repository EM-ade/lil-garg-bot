const { EmbedBuilder } = require('discord.js');
const { Battle, Ticket, User, Pet } = require('../database/models');
const { BotConfig } = require('../database/models');
const logger = require('./logger');

class CleanupManager {
    constructor(client) {
        this.client = client;
        this.cleanupIntervals = new Map();
        this.setupCleanupJobs();
    }

    setupCleanupJobs() {
        // Run cleanup every hour
        setInterval(() => {
            this.runCleanup();
        }, 60 * 60 * 1000); // 1 hour

        // Run cleanup immediately on startup
        this.runCleanup();

        logger.info('Cleanup manager initialized');
    }

    async runCleanup() {
        try {
            logger.info('Starting scheduled cleanup...');
            
            const guilds = this.client.guilds.cache;
            for (const [guildId, guild] of guilds) {
                await this.cleanupGuild(guild);
            }
            
            logger.info('Scheduled cleanup completed');
        } catch (error) {
            logger.error('Error during scheduled cleanup:', error);
        }
    }

    async cleanupGuild(guild) {
        try {
            const botConfig = await BotConfig.findOne({ guildId: guild.id });
            if (!botConfig) return;

            // Cleanup old battles
            if (botConfig.battleSystem?.enabled) {
                await this.cleanupOldBattles(guild, botConfig);
            }

            // Cleanup old tickets
            if (botConfig.ticketSystem?.enabled) {
                await this.cleanupOldTickets(guild, botConfig);
            }

            // Cleanup old verification data
            if (botConfig.nftVerification?.enabled) {
                await this.cleanupOldVerifications(guild, botConfig);
            }

            // Cleanup inactive pets
            if (botConfig.petSystem?.enabled) {
                await this.cleanupInactivePets(guild, botConfig);
            }

        } catch (error) {
            logger.error(`Error cleaning up guild ${guild.name}:`, error);
        }
    }

    async cleanupOldBattles(guild, botConfig) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setHours(cutoffDate.getHours() - 24); // 24 hours ago

            // Find old completed or cancelled battles
            const oldBattles = await Battle.find({
                guildId: guild.id,
                status: { $in: ['completed', 'cancelled'] },
                updatedAt: { $lt: cutoffDate }
            });

            let deletedBattles = 0;
            for (const battle of oldBattles) {
                try {
                    // Try to delete the battle channel if it still exists
                    if (battle.channelId) {
                        const channel = guild.channels.cache.get(battle.channelId);
                        if (channel) {
                            await channel.delete('Battle cleanup - old battle');
                        }
                    }

                    // Delete the battle record
                    await Battle.findByIdAndDelete(battle._id);
                    deletedBattles++;
                } catch (error) {
                    logger.error(`Failed to cleanup battle ${battle._id}:`, error);
                }
            }

            if (deletedBattles > 0) {
                logger.info(`Cleaned up ${deletedBattles} old battles in ${guild.name}`);
                
                // Log cleanup to mod-log if available
                if (botConfig.logChannelId) {
                    await this.logCleanupAction(guild, botConfig.logChannelId, 'Battle Cleanup', 
                        `Cleaned up ${deletedBattles} old battles`);
                }
            }
        } catch (error) {
            logger.error(`Error cleaning up old battles in ${guild.name}:`, error);
        }
    }

    async cleanupOldTickets(guild, botConfig) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setHours(cutoffDate.getHours() - 168); // 7 days ago

            // Find old closed tickets
            const oldTickets = await Ticket.find({
                guildId: guild.id,
                status: 'closed',
                updatedAt: { $lt: cutoffDate }
            });

            let deletedTickets = 0;
            for (const ticket of oldTickets) {
                try {
                    // Try to delete the ticket channel if it still exists
                    if (ticket.channelId) {
                        const channel = guild.channels.cache.get(ticket.channelId);
                        if (channel) {
                            await channel.delete('Ticket cleanup - old ticket');
                        }
                    }

                    // Delete the ticket record
                    await Ticket.findByIdAndDelete(ticket._id);
                    deletedTickets++;
                } catch (error) {
                    logger.error(`Failed to cleanup ticket ${ticket._id}:`, error);
                }
            }

            if (deletedTickets > 0) {
                logger.info(`Cleaned up ${deletedTickets} old tickets in ${guild.name}`);
                
                // Log cleanup to mod-log if available
                if (botConfig.logChannelId) {
                    await this.logCleanupAction(guild, botConfig.logChannelId, 'Ticket Cleanup', 
                        `Cleaned up ${deletedTickets} old tickets`);
                }
            }
        } catch (error) {
            logger.error(`Error cleaning up old tickets in ${guild.name}:`, error);
        }
    }

    async cleanupOldVerifications(guild, botConfig) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 30); // 30 days ago

            // Find users with old verification data
            const oldUsers = await User.find({
                lastVerificationCheck: { $lt: cutoffDate },
                isVerified: true
            });

            let updatedUsers = 0;
            for (const user of oldUsers) {
                try {
                    // Mark for reverification
                    user.isVerified = false;
                    user.verificationExpiresAt = new Date();
                    await user.save();
                    updatedUsers++;
                } catch (error) {
                    logger.error(`Failed to update user ${user.discordId}:`, error);
                }
            }

            if (updatedUsers > 0) {
                logger.info(`Marked ${updatedUsers} users for reverification in ${guild.name}`);
                
                // Log cleanup to mod-log if available
                if (botConfig.logChannelId) {
                    await this.logCleanupAction(guild, botConfig.logChannelId, 'Verification Cleanup', 
                        `Marked ${updatedUsers} users for reverification`);
                }
            }
        } catch (error) {
            logger.error(`Error cleaning up old verifications in ${guild.name}:`, error);
        }
    }

    async cleanupInactivePets(guild, botConfig) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 90); // 90 days ago

            // Find pets that haven't been interacted with for 90 days
            const inactivePets = await Pet.find({
                guildId: guild.id,
                'cooldowns.lastFed': { $lt: cutoffDate },
                'cooldowns.lastTrained': { $lt: cutoffDate },
                'cooldowns.lastPlayed': { $lt: cutoffDate }
            });

            let archivedPets = 0;
            for (const pet of inactivePets) {
                try {
                    // Archive the pet instead of deleting
                    pet.status = 'archived';
                    pet.archivedAt = new Date();
                    pet.archiveReason = 'Inactive for 90+ days';
                    await pet.save();
                    archivedPets++;
                } catch (error) {
                    logger.error(`Failed to archive pet ${pet._id}:`, error);
                }
            }

            if (archivedPets > 0) {
                logger.info(`Archived ${archivedPets} inactive pets in ${guild.name}`);
                
                // Log cleanup to mod-log if available
                if (botConfig.logChannelId) {
                    await this.logCleanupAction(guild, botConfig.logChannelId, 'Pet Cleanup', 
                        `Archived ${archivedPets} inactive pets`);
                }
            }
        } catch (error) {
            logger.error(`Error cleaning up inactive pets in ${guild.name}:`, error);
        }
    }

    async logCleanupAction(guild, logChannelId, action, details) {
        try {
            const logChannel = guild.channels.cache.get(logChannelId);
            if (!logChannel) return;

            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('🧹 Cleanup Action')
                .setDescription(details)
                .addFields(
                    { name: 'Action', value: action, inline: true },
                    { name: 'Guild', value: guild.name, inline: true },
                    { name: 'Timestamp', value: new Date().toISOString(), inline: true }
                )
                .setFooter({ text: 'Automated cleanup system' })
                .setTimestamp();

            await logChannel.send({ embeds: [embed] });
        } catch (error) {
            logger.error('Failed to log cleanup action:', error);
        }
    }

    // Manual cleanup methods for admins
    async manualCleanup(guild, options = {}) {
        try {
            const results = {
                battles: 0,
                tickets: 0,
                verifications: 0,
                pets: 0
            };

            if (options.battles) {
                results.battles = await this.cleanupOldBattles(guild, { logChannelId: null });
            }

            if (options.tickets) {
                results.tickets = await this.cleanupOldTickets(guild, { logChannelId: null });
            }

            if (options.verifications) {
                results.verifications = await this.cleanupOldVerifications(guild, { logChannelId: null });
            }

            if (options.pets) {
                results.pets = await this.cleanupInactivePets(guild, { logChannelId: null });
            }

            return results;
        } catch (error) {
            logger.error(`Error during manual cleanup in ${guild.name}:`, error);
            throw error;
        }
    }

    // Get cleanup statistics
    async getCleanupStats(guildId) {
        try {
            const stats = {
                totalBattles: await Battle.countDocuments({ guildId }),
                completedBattles: await Battle.countDocuments({ guildId, status: 'completed' }),
                totalTickets: await Ticket.countDocuments({ guildId }),
                closedTickets: await Ticket.countDocuments({ guildId, status: 'closed' }),
                totalPets: await Pet.countDocuments({ guildId }),
                archivedPets: await Pet.countDocuments({ guildId, status: 'archived' }),
                verifiedUsers: await User.countDocuments({ isVerified: true })
            };

            return stats;
        } catch (error) {
            logger.error(`Error getting cleanup stats for guild ${guildId}:`, error);
            throw error;
        }
    }
}

module.exports = CleanupManager;
