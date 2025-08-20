const logger = require('../utils/logger');
const User = require('../database/models/User');
const BotConfig = require('../database/models/BotConfig'); // Import BotConfig model
const NFTVerificationService = require('./nftVerification'); // Import NFTVerificationService


async function assignRolesBasedOnNfts(member, walletAddress) {
  if (!member || !walletAddress) {
    logger.warn('assignRolesBasedOnNfts called with missing member or walletAddress.');
    return;
  }

  logger.info(`Assigning roles for user ${member.user.tag} with wallet ${walletAddress}`);

  try {
    const botConfig = await BotConfig.findOne({ guildId: member.guild.id });
    if (!botConfig || !botConfig.nftVerification || !botConfig.nftVerification.roleTiers || botConfig.nftVerification.roleTiers.length === 0) {
      logger.warn(`No NFT role tiers configured for guild ${member.guild.name}. Skipping role assignment.`);
      return;
    }

    // Instantiate NFTVerificationService to fetch NFT holdings
    const nftService = new NFTVerificationService();

    // Use NFTVerificationService to verify NFT ownership and get NFT information
    const verificationResult = await nftService.verifyNFTOwnership(walletAddress);

    const currentNFTCount = verificationResult.nftCount;

    // Sort roles by requiredNfts in descending order to assign the highest eligible role first
    const sortedRoles = [...botConfig.nftVerification.roleTiers].sort((a, b) => b.nftCount - a.nftCount);

    // Keep track of which roles were assigned from this managed system
    const rolesToKeep = new Set();
    let highestRoleAssigned = null;

    for (const roleConfig of sortedRoles) {
      const role = member.guild.roles.cache.get(roleConfig.roleId);

      if (!role) {
        logger.warn(`Role with ID '${roleConfig.roleId}' (Name: ${roleConfig.roleName}) not found in guild ${member.guild.name}. Skipping.`);
        continue;
      }

      if (currentNFTCount >= roleConfig.nftCount) {
        // User qualifies for this role
        if (!member.roles.cache.has(role.id)) {
          try {
            await member.roles.add(role);
            logger.info(`Assigned role '${role.name}' to ${member.user.tag} for holding ${currentNFTCount} NFTs.`);
          } catch (error) {
            logger.error(`Error assigning role '${role.name}' to ${member.user.tag}: ${error.message}`);
          }
        }
        rolesToKeep.add(role.id); // Mark this role to be kept
        if (!highestRoleAssigned) { // Assign the highest qualifying role
            highestRoleAssigned = role.id;
        }
      } else {
        // User does not qualify for this role, ensure it's removed if they have it
        if (member.roles.cache.has(role.id)) {
          try {
            await member.roles.remove(role);
            logger.info(`Removed role '${role.name}' from ${member.user.tag} as holdings (${currentNFTCount}) no longer meet requirement (${roleConfig.nftCount}).`);
          } catch (error) {
            logger.error(`Error removing role '${role.name}' from ${member.user.tag}: ${error.message}`);
          }
        }
      }
    }

    // Logic to ensure only the highest qualifying role (and roles that are not part of this managed system)
    // are kept, if you want exclusive tiers.
    // For now, the loop ensures lower roles are removed if higher ones are met and the `holdings` condition changes.
    // If you desire strict exclusivity (e.g., only Whale OR Holder, never both), this needs more advanced logic.
    // Current implementation allows a user to have both Holder and Whale if they meet both criteria based on how tiers are defined.

  } catch (error) {
    logger.error(`Error in assignRolesBasedOnNfts for guild ${member.guild.id}: ${error.message}`);
  }
}

async function periodicRoleCheck(client) {
  logger.info('Performing periodic NFT role check for all verified users...');

  try {
    const verifiedUsers = await User.find({ isVerified: true });

    if (verifiedUsers.length === 0) {
      logger.info('No verified users found for periodic role check.');
      return;
    }

    for (const userProfile of verifiedUsers) {
      // Find the guild and member to perform role operations
      const guild = client.guilds.cache.get(userProfile.guildId);
      if (!guild) {
        logger.warn(`Guild with ID ${userProfile.guildId} not found for user ${userProfile.discordId}. Skipping.`);
        continue;
      }

      const member = await guild.members.fetch(userProfile.discordId).catch(error => {
        logger.warn(`Could not fetch member ${userProfile.discordId} in guild ${userProfile.guildId}: ${error.message}`);
        return null;
      });

      if (member && userProfile.walletAddress) {
        // Ensure the member is in the guild and not null before calling assignRolesBasedOnNfts
        await assignRolesBasedOnNfts(member, userProfile.walletAddress);
      } else if (!userProfile.walletAddress) {
          logger.warn(`User ${userProfile.discordId} is marked as verified but has no wallet address. Skipping role check.`);
      }
    }
    logger.info('Periodic NFT role check completed.');
  } catch (error) {
    logger.error(`Error during periodic role check: ${error.message}`);
  }
}

module.exports = {
  assignRolesBasedOnNfts,
  periodicRoleCheck,
};
