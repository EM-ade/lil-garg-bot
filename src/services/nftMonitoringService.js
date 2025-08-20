const NFTVerificationService = require('./nftVerification');
const { User, BotConfig } = require('../database/models');
const logger = require('../utils/logger');
const { assignRolesBasedOnNfts } = require('./nftRoleManagerService'); // Import the role assignment function

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
      // This assumes nftVerification.enabled and autoRoleAssignment are fields in BotConfig
      const guildConfigs = await BotConfig.find({
        'nftVerification.enabled': true,
        'nftVerification.autoRoleAssignment': true // Assuming this field exists and is true for auto checks
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
        guildId: guildId,
        isVerified: true,
        walletAddress: { $exists: true, $ne: null }
      });

      logger.info(`Checking ${verifiedUsers.length} verified users in guild ${guildId}`);

      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
          logger.warn(`Guild ${guildId} not found in cache during NFT check. Skipping.`);
          return { usersChecked: 0, usersUpdated: 0 };
      }

      for (const userProfile of verifiedUsers) {
        try {
          // Fetch the member object for role management
          const member = await guild.members.fetch(userProfile.discordId).catch(err => {
            logger.warn(`Could not fetch member ${userProfile.discordId} in guild ${guildId}: ${err.message}`);
            return null;
          });

          if (!member) {
              logger.warn(`Member ${userProfile.discordId} not found in guild ${guildId}. Skipping NFT check for this user.`);
              continue; // Skip to next user if member not found
          }

          const wasUpdated = await this.checkUserNFTs(userProfile, member);
          if (wasUpdated) {
            usersUpdated++;
          }
          usersChecked++;

          // Add a small delay to prevent hitting Discord API rate limits
          await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay

        } catch (error) {
          logger.error(`Error checking user ${userProfile.discordId} in guild ${guildId}:`, error);
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
   * Modified to receive the Discord member object directly.
   */
  async checkUserNFTs(userProfile, member) {
    try {
      // Get current NFT holdings using the dedicated NFTVerificationService
      // Note: If you have multiple collections, you'd iterate through them here
      // For this mock, we assume a single 'lil_gargs_collection_id' for verification
      const verificationResult = await this.nftService.verifyNFTOwnership(userProfile.walletAddress);
      const currentNFTCount = verificationResult.nftCount;
      const currentNFTs = verificationResult.nfts;

      let changed = false;

      // Check if NFT count has changed or if verified status needs updating
      if (currentNFTCount !== userProfile.nftTokens.length || userProfile.isVerified !== verificationResult.isVerified) {
        logger.info(`User ${userProfile.discordId} NFT count/status changed: ${userProfile.nftTokens.length} -> ${currentNFTCount}, Verified: ${userProfile.isVerified} -> ${verificationResult.isVerified}`);

        // Update user's NFT tokens and verification status
        userProfile.nftTokens = currentNFTs.map(nft => ({
          mint: nft.mint,
          name: nft.name,
          image: nft.image,
          verifiedAt: new Date()
        }));
        userProfile.isVerified = verificationResult.isVerified;
        userProfile.lastVerificationCheck = new Date();

        // Add to verification history
        userProfile.verificationHistory.push({
          walletAddress: userProfile.walletAddress,
          verifiedAt: new Date(),
          nftCount: currentNFTCount,
          status: userProfile.isVerified ? 'success' : 'failed'
        });

        await userProfile.save();
        changed = true;
      }

      // Always call assignRolesBasedOnNfts to ensure roles are correct based on current holdings
      // This handles both adding and removing roles based on the BotConfig rules
      await assignRolesBasedOnNfts(member, userProfile.walletAddress);

      return changed; // Return true if user data in DB was updated
    } catch (error) {
      logger.error(`Error checking NFTs for user ${userProfile.discordId}: ${error.message}`);
      
      // If an error occurs during verification, mark user as unverified if they were previously verified
      if (userProfile.isVerified) {
        userProfile.isVerified = false;
        userProfile.lastVerificationCheck = new Date();
        userProfile.verificationHistory.push({
          walletAddress: userProfile.walletAddress,
          verifiedAt: new Date(),
          nftCount: userProfile.nftTokens.length, // Log current count before setting to 0
          status: 'failed' // Mark as failed due to error
        });
        userProfile.nftTokens = []; // Clear NFTs on verification failure
        await userProfile.save();

        // Attempt to remove all managed NFT roles as verification failed
        await assignRolesBasedOnNfts(member, userProfile.walletAddress); // This will remove roles if nftCount is effectively 0
        return true; // User data was updated due to error
      }
      
      return false; // No changes to user data if already unverified or no action taken
    }
  }

  /**
   * Manual NFT check for a specific user
   */
  async manualCheckUser(discordId, guildId) {
    try {
      const userProfile = await User.findOne({ discordId, guildId });
      if (!userProfile) {
        throw new Error('User not found in this guild.');
      }

      const guild = await this.client.guilds.fetch(guildId);
      if (!guild) {
        throw new Error('Guild not found.');
      }

      const member = await guild.members.fetch(discordId).catch(err => {
        logger.warn(`Could not fetch member ${discordId} in guild ${guildId} for manual check: ${err.message}`);
        return null;
      });

      if (!member) {
        throw new Error('Discord member not found in the guild.');
      }

      const wasUpdated = await this.checkUserNFTs(userProfile, member);
      
      return {
        success: true,
        wasUpdated,
        user: {
          discordId: userProfile.discordId,
          username: userProfile.username,
          isVerified: userProfile.isVerified,
          nftCount: userProfile.nftTokens.length,
          lastCheck: userProfile.lastVerificationCheck
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
