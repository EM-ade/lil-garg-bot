const NFTVerificationService = require('./nftVerification');
const { User, BotConfig } = require('../database/models');
const logger = require('../utils/logger');

class NFTMonitoringService {
  constructor() {
    this.nftService = new NFTVerificationService();
    this.isMonitoring = false;
    this.monitoringInterval = null;
  }

  /**
   * Start the NFT monitoring service
   */
  async startMonitoring() {
    if (this.isMonitoring) {
      logger.info('NFT monitoring service is already running');
      return;
    }

    this.isMonitoring = true;
    logger.info('Starting NFT monitoring service...');

    // Run initial check
    await this.runNFTCheck();

    // Set up periodic monitoring (every 6 hours)
    this.monitoringInterval = setInterval(async () => {
      await this.runNFTCheck();
    }, 6 * 60 * 60 * 1000); // 6 hours

    logger.info('NFT monitoring service started successfully');
  }

  /**
   * Stop the NFT monitoring service
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    logger.info('NFT monitoring service stopped');
  }

  /**
   * Run a comprehensive NFT check across all guilds
   */
  async runNFTCheck() {
    try {
      logger.info('Starting comprehensive NFT check...');
      
      // Get all guilds with NFT verification enabled
      const guildConfigs = await BotConfig.find({
        'nftVerification.enabled': true,
        'nftVerification.autoRoleAssignment': true
      });

      let totalUsersChecked = 0;
      let totalUsersUpdated = 0;

      for (const config of guildConfigs) {
        try {
          const { usersChecked, usersUpdated } = await this.checkGuildNFTs(config);
          totalUsersChecked += usersChecked;
          totalUsersUpdated += usersUpdated;
        } catch (error) {
          logger.error(`Error checking guild ${config.guildId}:`, error);
        }
      }

      logger.info(`NFT check completed: ${totalUsersChecked} users checked, ${totalUsersUpdated} users updated`);
    } catch (error) {
      logger.error('Error running NFT check:', error);
    }
  }

  /**
   * Check NFTs for a specific guild
   */
  async checkGuildNFTs(guildConfig) {
    const guildId = guildConfig.guildId;
    let usersChecked = 0;
    let usersUpdated = 0;

    try {
      // Get all verified users in this guild
      const verifiedUsers = await User.find({
        isVerified: true,
        walletAddress: { $exists: true, $ne: null }
      });

      logger.info(`Checking ${verifiedUsers.length} verified users in guild ${guildId}`);

      for (const user of verifiedUsers) {
        try {
          const wasUpdated = await this.checkUserNFTs(user, guildConfig);
          if (wasUpdated) {
            usersUpdated++;
          }
          usersChecked++;

          // Add delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          logger.error(`Error checking user ${user.discordId}:`, error);
        }
      }

      return { usersChecked, usersUpdated };
    } catch (error) {
      logger.error(`Error checking guild ${guildId}:`, error);
      return { usersChecked: 0, usersUpdated: 0 };
    }
  }

  /**
   * Check NFTs for a specific user and update roles if needed
   */
  async checkUserNFTs(user, guildConfig) {
    try {
      // Get current NFT holdings
      const currentNFTs = await this.nftService.getLilGargsNFTs(user.walletAddress);
      const currentNFTCount = currentNFTs.length;

      // Check if NFT count has changed
      if (currentNFTCount !== user.nftTokens.length) {
        logger.info(`User ${user.discordId} NFT count changed: ${user.nftTokens.length} -> ${currentNFTCount}`);

        // Update user's NFT tokens
        user.nftTokens = currentNFTs.map(nft => ({
          mint: nft.mint,
          name: nft.name,
          image: nft.image,
          verifiedAt: new Date()
        }));

        // Update verification status
        user.isVerified = currentNFTCount > 0;
        user.lastVerificationCheck = new Date();

        // Add to verification history
        user.verificationHistory.push({
          walletAddress: user.walletAddress,
          verifiedAt: new Date(),
          nftCount: currentNFTCount,
          status: user.isVerified ? 'success' : 'failed'
        });

        await user.save();

        // Update roles based on new NFT count
        await this.updateUserRoles(user, guildConfig, currentNFTCount);

        return true; // User was updated
      }

      return false; // No changes
    } catch (error) {
      logger.error(`Error checking NFTs for user ${user.discordId}:`, error);
      
      // If verification fails, mark user as unverified
      if (user.isVerified) {
        user.isVerified = false;
        user.lastVerificationCheck = new Date();
        user.verificationHistory.push({
          walletAddress: user.walletAddress,
          verifiedAt: new Date(),
          nftCount: 0,
          status: 'failed'
        });
        await user.save();
        
        // Remove roles
        await this.removeUserRoles(user, guildConfig);
        return true;
      }
      
      return false;
    }
  }

  /**
   * Update user roles based on NFT count
   */
  async updateUserRoles(user, guildConfig, nftCount) {
    try {
      const guild = await this.getGuild(guildConfig.guildId);
      if (!guild) {
        logger.error(`Guild ${guildConfig.guildId} not found`);
        return;
      }

      const member = await guild.members.fetch(user.discordId);
      if (!member) {
        logger.warn(`Member ${user.discordId} not found in guild ${guildConfig.guildId}`);
        return;
      }

      // Remove old NFT-based roles
      await this.removeUserRoles(user, guildConfig);

      // Add new roles based on NFT count
      if (nftCount > 0) {
        const roleTiers = guildConfig.nftVerification.roleTiers || [];
        
        // Sort tiers by NFT count (highest first)
        const sortedTiers = roleTiers.sort((a, b) => b.nftCount - a.nftCount);
        
        // Find the highest tier the user qualifies for
        const qualifiedTier = sortedTiers.find(tier => nftCount >= tier.nftCount);
        
        if (qualifiedTier) {
          try {
            const role = await guild.roles.fetch(qualifiedTier.roleId);
            if (role) {
              await member.roles.add(role);
              logger.info(`Added role ${qualifiedTier.roleName} to user ${user.discordId} (${nftCount} NFTs)`);
            }
          } catch (error) {
            logger.error(`Error adding role ${qualifiedTier.roleName} to user ${user.discordId}:`, error);
          }
        }

        // Add verified role if configured
        if (guildConfig.verifiedRoleId) {
          try {
            const verifiedRole = await guild.roles.fetch(guildConfig.verifiedRoleId);
            if (verifiedRole) {
              await member.roles.add(verifiedRole);
              logger.info(`Added verified role to user ${user.discordId}`);
            }
          } catch (error) {
            logger.error(`Error adding verified role to user ${user.discordId}:`, error);
          }
        }
      }

      // Log role update
      await this.logRoleUpdate(guildConfig, user, nftCount);
    } catch (error) {
      logger.error(`Error updating roles for user ${user.discordId}:`, error);
    }
  }

  /**
   * Remove NFT-based roles from user
   */
  async removeUserRoles(user, guildConfig) {
    try {
      const guild = await this.getGuild(guildConfig.guildId);
      if (!guild) return;

      const member = await guild.members.fetch(user.discordId);
      if (!member) return;

      // Remove NFT tier roles
      const roleTiers = guildConfig.nftVerification.roleTiers || [];
      for (const tier of roleTiers) {
        try {
          if (member.roles.cache.has(tier.roleId)) {
            await member.roles.remove(tier.roleId);
            logger.info(`Removed role ${tier.roleName} from user ${user.discordId}`);
          }
        } catch (error) {
          logger.error(`Error removing role ${tier.roleName} from user ${user.discordId}:`, error);
        }
      }

      // Remove verified role
      if (guildConfig.verifiedRoleId && member.roles.cache.has(guildConfig.verifiedRoleId)) {
        try {
          await member.roles.remove(guildConfig.verifiedRoleId);
          logger.info(`Removed verified role from user ${user.discordId}`);
        } catch (error) {
          logger.error(`Error removing verified role from user ${user.discordId}:`, error);
        }
      }
    } catch (error) {
      logger.error(`Error removing roles from user ${user.discordId}:`, error);
    }
  }

  /**
   * Get Discord guild object
   */
  async getGuild(guildId) {
    if (!this.client) {
      logger.error('Discord client not available in NFT monitoring service');
      return null;
    }
    
    try {
      return await this.client.guilds.fetch(guildId);
    } catch (error) {
      logger.error(`Error fetching guild ${guildId}:`, error);
      return null;
    }
  }

  /**
   * Log role updates to the configured log channel
   */
  async logRoleUpdate(guildConfig, user, nftCount) {
    try {
      if (!guildConfig.logChannelId) return;

      const guild = await this.getGuild(guildConfig.guildId);
      if (!guild) return;

      const logChannel = await guild.channels.fetch(guildConfig.logChannelId);
      if (!logChannel) return;

      const embed = {
        color: nftCount > 0 ? 0x00ff00 : 0xff0000,
        title: '🔄 NFT Verification Update',
        description: `User <@${user.discordId}> NFT verification status updated`,
        fields: [
          {
            name: 'User',
            value: `${user.username} (${user.discordId})`,
            inline: true
          },
          {
            name: 'NFT Count',
            value: nftCount.toString(),
            inline: true
          },
          {
            name: 'Status',
            value: nftCount > 0 ? '✅ Verified' : '❌ Unverified',
            inline: true
          },
          {
            name: 'Wallet',
            value: `\`${user.walletAddress}\``,
            inline: false
          }
        ],
        timestamp: new Date().toISOString()
      };

      await logChannel.send({ embeds: [embed] });
    } catch (error) {
      logger.error('Error logging role update:', error);
    }
  }

  /**
   * Manual NFT check for a specific user
   */
  async manualCheckUser(discordId, guildId) {
    try {
      const user = await User.findOne({ discordId });
      if (!user) {
        throw new Error('User not found');
      }

      const guildConfig = await BotConfig.findOne({ guildId });
      if (!guildConfig || !guildConfig.nftVerification.enabled) {
        throw new Error('NFT verification not enabled in this guild');
      }

      const wasUpdated = await this.checkUserNFTs(user, guildConfig);
      return {
        success: true,
        wasUpdated,
        user: {
          discordId: user.discordId,
          username: user.username,
          isVerified: user.isVerified,
          nftCount: user.nftTokens.length,
          lastCheck: user.lastVerificationCheck
        }
      };
    } catch (error) {
      logger.error(`Error in manual NFT check for user ${discordId}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get monitoring statistics
   */
  getMonitoringStats() {
    return {
      isMonitoring: this.isMonitoring,
      monitoringInterval: this.monitoringInterval ? '6 hours' : null,
      lastCheck: new Date().toISOString()
    };
  }
}

module.exports = NFTMonitoringService;
