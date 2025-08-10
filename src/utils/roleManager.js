const { PermissionFlagsBits } = require('discord.js');
const { User, BotConfig } = require('../database/models');
const logger = require('./logger');

class RoleManager {
    constructor(client) {
        this.client = client;
    }

    /**
     * Get or create verified role in a guild
     */
    async getVerifiedRole(guild, roleName = 'Lil Gargs Holder') {
        try {
            // Try to find existing role
            let role = guild.roles.cache.find(r => r.name === roleName);
            
            if (!role) {
                // Create the role if it doesn't exist
                role = await guild.roles.create({
                    name: roleName,
                    color: '#00ff00', // Green color
                    reason: 'Lil Gargs NFT verification role',
                    permissions: []
                });
                
                logger.info(`Created verified role: ${roleName} in guild ${guild.name}`);
            }
            
            return role;
        } catch (error) {
            logger.error('Error getting/creating verified role:', error);
            throw error;
        }
    }

    /**
     * Assign verified role to a user
     */
    async assignVerifiedRole(guild, userId, roleName = 'Lil Gargs Holder') {
        try {
            const member = await guild.members.fetch(userId);
            if (!member) {
                throw new Error('Member not found in guild');
            }

            const role = await this.getVerifiedRole(guild, roleName);
            
            if (member.roles.cache.has(role.id)) {
                return { success: true, message: 'User already has verified role' };
            }

            await member.roles.add(role);
            
            // Update user record
            await User.findOneAndUpdate(
                { discordId: userId },
                {
                    $addToSet: {
                        roles: {
                            roleId: role.id,
                            roleName: role.name,
                            assignedAt: new Date()
                        }
                    }
                }
            );

            logger.info(`Assigned verified role to user ${userId} in guild ${guild.name}`);
            return { success: true, message: 'Verified role assigned successfully' };

        } catch (error) {
            logger.error('Error assigning verified role:', error);
            throw error;
        }
    }

    /**
     * Remove verified role from a user
     */
    async removeVerifiedRole(guild, userId, roleName = 'Lil Gargs Holder') {
        try {
            const member = await guild.members.fetch(userId);
            if (!member) {
                throw new Error('Member not found in guild');
            }

            const role = guild.roles.cache.find(r => r.name === roleName);
            if (!role) {
                return { success: true, message: 'Verified role does not exist' };
            }

            if (!member.roles.cache.has(role.id)) {
                return { success: true, message: 'User does not have verified role' };
            }

            await member.roles.remove(role);
            
            // Update user record
            await User.findOneAndUpdate(
                { discordId: userId },
                {
                    $pull: {
                        roles: { roleId: role.id }
                    }
                }
            );

            logger.info(`Removed verified role from user ${userId} in guild ${guild.name}`);
            return { success: true, message: 'Verified role removed successfully' };

        } catch (error) {
            logger.error('Error removing verified role:', error);
            throw error;
        }
    }

    /**
     * Check if user has admin permissions
     */
    async hasAdminPermissions(guild, userId) {
        try {
            const member = await guild.members.fetch(userId);
            if (!member) {
                return false;
            }

            // Check if user has administrator permission
            if (member.permissions.has(PermissionFlagsBits.Administrator)) {
                return true;
            }

            // Check if user has manage guild permission
            if (member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return true;
            }

            // Check bot config for admin roles
            const botConfig = await BotConfig.findOne({ guildId: guild.id });
            if (botConfig && botConfig.adminRoleIds.length > 0) {
                const hasAdminRole = member.roles.cache.some(role => 
                    botConfig.adminRoleIds.includes(role.id)
                );
                if (hasAdminRole) {
                    return true;
                }
            }

            return false;
        } catch (error) {
            logger.error('Error checking admin permissions:', error);
            return false;
        }
    }

    /**
     * Check if user has moderator permissions
     */
    async hasModeratorPermissions(guild, userId) {
        try {
            // First check admin permissions
            if (await this.hasAdminPermissions(guild, userId)) {
                return true;
            }

            const member = await guild.members.fetch(userId);
            if (!member) {
                return false;
            }

            // Check if user has manage messages permission
            if (member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                return true;
            }

            // Check bot config for moderator roles
            const botConfig = await BotConfig.findOne({ guildId: guild.id });
            if (botConfig && botConfig.moderatorRoleIds.length > 0) {
                const hasModRole = member.roles.cache.some(role => 
                    botConfig.moderatorRoleIds.includes(role.id)
                );
                if (hasModRole) {
                    return true;
                }
            }

            return false;
        } catch (error) {
            logger.error('Error checking moderator permissions:', error);
            return false;
        }
    }

    /**
     * Get user's verification status
     */
    async getUserVerificationStatus(guild, userId) {
        try {
            const user = await User.findOne({ discordId: userId });
            const member = await guild.members.fetch(userId);
            
            if (!user || !member) {
                return {
                    isVerified: false,
                    hasRole: false,
                    nftCount: 0
                };
            }

            // Check if user has verified role
            const botConfig = await BotConfig.findOne({ guildId: guild.id });
            const roleName = botConfig?.verifiedRoleName || 'Lil Gargs Holder';
            const verifiedRole = guild.roles.cache.find(r => r.name === roleName);
            const hasRole = verifiedRole ? member.roles.cache.has(verifiedRole.id) : false;

            return {
                isVerified: user.isVerified,
                hasRole: hasRole,
                nftCount: user.nftTokens.length,
                walletAddress: user.walletAddress,
                lastVerificationCheck: user.lastVerificationCheck
            };

        } catch (error) {
            logger.error('Error getting user verification status:', error);
            return {
                isVerified: false,
                hasRole: false,
                nftCount: 0
            };
        }
    }

    /**
     * Sync user roles based on verification status
     */
    async syncUserRoles(guild, userId) {
        try {
            const status = await this.getUserVerificationStatus(guild, userId);
            const botConfig = await BotConfig.findOne({ guildId: guild.id });
            const roleName = botConfig?.verifiedRoleName || 'Lil Gargs Holder';

            if (status.isVerified && !status.hasRole) {
                // User is verified but doesn't have role - assign it
                await this.assignVerifiedRole(guild, userId, roleName);
                return { action: 'assigned', role: roleName };
            } else if (!status.isVerified && status.hasRole) {
                // User is not verified but has role - remove it
                await this.removeVerifiedRole(guild, userId, roleName);
                return { action: 'removed', role: roleName };
            }

            return { action: 'none', role: roleName };

        } catch (error) {
            logger.error('Error syncing user roles:', error);
            throw error;
        }
    }

    /**
     * Bulk sync roles for all users in a guild
     */
    async bulkSyncRoles(guild) {
        try {
            const users = await User.find({});
            const results = {
                processed: 0,
                assigned: 0,
                removed: 0,
                errors: 0
            };

            for (const user of users) {
                try {
                    const result = await this.syncUserRoles(guild, user.discordId);
                    results.processed++;
                    
                    if (result.action === 'assigned') {
                        results.assigned++;
                    } else if (result.action === 'removed') {
                        results.removed++;
                    }
                } catch (error) {
                    results.errors++;
                    logger.error(`Error syncing roles for user ${user.discordId}:`, error);
                }
            }

            logger.info(`Bulk role sync completed for guild ${guild.name}:`, results);
            return results;

        } catch (error) {
            logger.error('Error in bulk role sync:', error);
            throw error;
        }
    }
}

module.exports = RoleManager;
