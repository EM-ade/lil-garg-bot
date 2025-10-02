const { PermissionFlagsBits } = require('discord.js');
const logger = require('./logger');
const {
    isSupabaseEnabled,
    getUserStore,
    getBotConfigStore,
} = require('../services/serviceFactory');

const userStore = getUserStore();
const botConfigStore = getBotConfigStore();

function normalizeBotConfig(record) {
    if (!record) {
        return null;
    }

    if (!isSupabaseEnabled()) {
        const data = typeof record.toObject === 'function' ? record.toObject() : record;
        return {
            ...data,
            adminRoleIds: data.adminRoleIds || [],
            moderatorRoleIds: data.moderatorRoleIds || [],
            nftVerification: data.nftVerification || data.settings?.nftVerification || {},
            settings: data.settings || {},
            stats: data.stats || {},
        };
    }

    const settings = record.settings || {};
    return {
        guildId: record.guild_id,
        guildName: record.guild_name,
        verifiedRoleId: settings.nftVerification?.verifiedRoleId || record.verified_role_id || null,
        verifiedRoleName: settings.nftVerification?.verifiedRoleName || record.verified_role_name || null,
        adminRoleIds: settings.adminRoleIds || [],
        moderatorRoleIds: settings.moderatorRoleIds || [],
        nftVerification: settings.nftVerification || {},
        settings,
        stats: record.stats || {},
    };
}

async function fetchBotConfig(guildId) {
    if (isSupabaseEnabled()) {
        const config = await botConfigStore.getBotConfigByGuildId(guildId);
        return normalizeBotConfig(config);
    }

    const config = await botConfigStore.findOne({ guildId });
    return normalizeBotConfig(config);
}

function normalizeUser(record) {
    if (!record) {
        return null;
    }

    if (!isSupabaseEnabled()) {
        const data = typeof record.toObject === 'function' ? record.toObject() : record;
        return {
            id: data._id ? data._id.toString() : data.id,
            discordId: data.discordId,
            guildId: data.guildId,
            walletAddress: data.walletAddress,
            isVerified: data.isVerified,
            nftTokens: data.nftTokens || [],
            roles: data.roles || [],
            lastVerificationCheck: data.lastVerificationCheck,
        };
    }

    return {
        id: record.id,
        discordId: record.discord_id,
        guildId: record.guild_id,
        walletAddress: record.wallet_address,
        isVerified: record.is_verified,
        nftTokens: record.user_nft_tokens || [],
        roles: record.user_roles || [],
        lastVerificationCheck: record.last_verification_check,
    };
}

async function getSupabaseUser(discordId, guildId, username = null) {
    let user = await userStore.findUserByDiscordAndGuild(discordId, guildId);
    if (!user && userStore.ensureUserRecord) {
        user = await userStore.ensureUserRecord({ discordId, guildId, username });
    }
    return user;
}

async function getUser(discordId, guildId, username = null) {
    if (isSupabaseEnabled()) {
        return getSupabaseUser(discordId, guildId, username);
    }

    return userStore.findOne({ discordId, guildId });
}

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
            if (isSupabaseEnabled()) {
                const userRecord = await getSupabaseUser(userId, guild.id, member.user.username);
                if (userRecord && userStore.addUserRole) {
                    await userStore.addUserRole(userRecord.id, {
                        roleId: role.id,
                        roleName: role.name,
                        assignedAt: new Date().toISOString(),
                    });
                }
            } else {
                await userStore.findOneAndUpdate(
                    { discordId: userId, guildId: guild.id },
                    {
                        $addToSet: {
                            roles: {
                                roleId: role.id,
                                roleName: role.name,
                                assignedAt: new Date(),
                            },
                        },
                    },
                    { upsert: true }
                );
            }

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
            
            if (isSupabaseEnabled()) {
                const userRecord = await userStore.findUserByDiscordAndGuild(userId, guild.id);
                if (userRecord && userStore.removeUserRole) {
                    await userStore.removeUserRole(userRecord.id, role.id);
                }
            } else {
                await userStore.findOneAndUpdate(
                    { discordId: userId, guildId: guild.id },
                    {
                        $pull: {
                            roles: { roleId: role.id },
                        },
                    }
                );
            }

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
            const botConfig = await fetchBotConfig(guild.id);
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
            const botConfig = await fetchBotConfig(guild.id);
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
            const botConfig = await fetchBotConfig(guild.id);
            const roleName = botConfig?.nftVerification?.verifiedRoleName || botConfig?.verifiedRoleName || 'Lil Gargs Holder';

            let user;
            if (isSupabaseEnabled()) {
                const detailed = await userStore.fetchUserDetailsByDiscordAndGuild(userId, guild.id);
                user = normalizeUser(detailed);
            } else {
                user = normalizeUser(await userStore.findOne({ discordId: userId, guildId: guild.id }));
            }
            const member = await guild.members.fetch(userId);
            
            if (!user || !member) {
                return {
                    isVerified: false,
                    hasRole: false,
                    nftCount: 0
                };
            }

            // Check if user has verified role
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
            const botConfig = await fetchBotConfig(guild.id);
            const roleName = botConfig?.nftVerification?.verifiedRoleName || botConfig?.verifiedRoleName || 'Lil Gargs Holder';

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
            let users;
            if (isSupabaseEnabled()) {
                users = await userStore.listUsersByGuild(guild.id);
            } else {
                users = await userStore.find({ guildId: guild.id });
            }
            const results = {
                processed: 0,
                assigned: 0,
                removed: 0,
                errors: 0
            };

            for (const user of users) {
                try {
                    const discordId = isSupabaseEnabled() ? user.discord_id : user.discordId;
                    const result = await this.syncUserRoles(guild, discordId);
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
