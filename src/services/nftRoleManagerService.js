const logger = require('../utils/logger');
const NFTVerificationService = require('./nftVerification');
const {
  isSupabaseEnabled,
  getUserStore,
  getBotConfigStore,
  getGuildVerificationConfigStore,
} = require('./serviceFactory');

const userStore = getUserStore();
const botConfigStore = getBotConfigStore();
const guildVerificationConfigStore = getGuildVerificationConfigStore();

async function fetchBotConfig(guildId) {
  if (isSupabaseEnabled()) {
    try {
      return await botConfigStore.getBotConfigByGuildId(guildId);
    } catch (error) {
      logger.error(`Failed to fetch bot config from Supabase for guild ${guildId}: ${error.message}`);
      return null;
    }
  }

  return botConfigStore.findOne({ guildId });
}

function extractNftVerificationConfig(botConfig) {
  if (!botConfig) return null;
  if (botConfig.nftVerification) {
    return botConfig.nftVerification;
  }
  if (botConfig.settings?.nftVerification) {
    return botConfig.settings.nftVerification;
  }
  return null;
}

function mapSupabaseUserRecord(record) {
  if (!record) return null;
  if (!isSupabaseEnabled()) {
    return record;
  }

  return {
    discordId: record.discord_id,
    guildId: record.guild_id,
    walletAddress: record.wallet_address,
  };
}

async function fetchVerifiedUsers() {
  if (isSupabaseEnabled()) {
    try {
      const rows = await userStore.listVerifiedUsers();
      return rows.map(mapSupabaseUserRecord);
    } catch (error) {
      logger.error(`Failed to fetch verified users from Supabase: ${error.message}`);
      return [];
    }
  }

  return userStore.find({ isVerified: true });
}

async function assignRolesBasedOnNfts(member, walletAddress) {
  if (!member || !walletAddress) {
    logger.warn('assignRolesBasedOnNfts called with missing member or walletAddress.');
    return;
  }

  logger.info(`Assigning roles for user ${member.user.tag} with wallet ${walletAddress}`);

  try {
    const contractRules = guildVerificationConfigStore
      ? await guildVerificationConfigStore.listByGuild(member.guild.id)
      : [];

    const nftService = new NFTVerificationService();

    if (contractRules && contractRules.length > 0) {
      await applyContractRuleRoles({ member, walletAddress, contractRules, nftService });
      return;
    }

    const botConfig = await fetchBotConfig(member.guild.id);
    const nftVerificationConfig = extractNftVerificationConfig(botConfig);

    if (
      !nftVerificationConfig ||
      !Array.isArray(nftVerificationConfig.roleTiers) ||
      nftVerificationConfig.roleTiers.length === 0
    ) {
      logger.warn(`No NFT role tiers configured for guild ${member.guild.name}. Skipping role assignment.`);
      return;
    }

    const verificationResult = await nftService.verifyNFTOwnership(walletAddress);

    const currentNFTCount = verificationResult.nftCount;

    const sortedRoles = [...nftVerificationConfig.roleTiers].sort((a, b) => b.nftCount - a.nftCount);

    const rolesToKeep = new Set();

    for (const roleConfig of sortedRoles) {
      const role = member.guild.roles.cache.get(roleConfig.roleId);

      if (!role) {
        logger.warn(`Role with ID '${roleConfig.roleId}' (Name: ${roleConfig.roleName}) not found in guild ${member.guild.name}. Skipping.`);
        continue;
      }

      if (currentNFTCount >= roleConfig.nftCount) {
        if (!member.roles.cache.has(role.id)) {
          try {
            await member.roles.add(role);
            logger.info(`Assigned role '${role.name}' to ${member.user.tag} for holding ${currentNFTCount} NFTs.`);
          } catch (error) {
            logger.error(`Error assigning role '${role.name}' to ${member.user.tag}: ${error.message}`);
          }
        }
        rolesToKeep.add(role.id);
      } else if (member.roles.cache.has(role.id)) {
        try {
          await member.roles.remove(role);
          logger.info(
            `Removed role '${role.name}' from ${member.user.tag} as holdings (${currentNFTCount}) no longer meet requirement (${roleConfig.nftCount}).`
          );
        } catch (error) {
          logger.error(`Error removing role '${role.name}' from ${member.user.tag}: ${error.message}`);
        }
      }
    }
  } catch (error) {
    logger.error(`Error in assignRolesBasedOnNfts for guild ${member.guild.id}: ${error.message}`);
  }
}

async function applyContractRuleRoles({ member, walletAddress, contractRules, nftService }) {
  const contractAddresses = contractRules
    .map((rule) => rule.contractAddress)
    .filter(Boolean);

  const verificationResult = await nftService.verifyNFTOwnership(walletAddress, {
    contractAddresses,
  });

  const byContract = verificationResult.byContract || {};

  for (const rule of contractRules) {
    const normalizedContract = rule.contractAddress?.toLowerCase?.();
    const ownedCount = normalizedContract ? byContract[normalizedContract] || 0 : 0;
    const required = rule.requiredNftCount || 1;

    let role = null;
    if (rule.roleId) {
      role = member.guild.roles.cache.get(rule.roleId);
    }
    if (!role && rule.roleName) {
      role = member.guild.roles.cache.find((r) => r.name === rule.roleName);
    }

    if (!role) {
      logger.warn(
        `[verification] Role not found for rule ${rule.contractAddress} in guild ${member.guild.name}.`);
      continue;
    }

    if (ownedCount >= required) {
      if (!member.roles.cache.has(role.id)) {
        try {
          await member.roles.add(role);
          logger.info(
            `Assigned role '${role.name}' to ${member.user.tag} for holding ${ownedCount} NFTs of ${rule.contractAddress}.`
          );
        } catch (error) {
          logger.error(`Error assigning role '${role.name}' to ${member.user.tag}: ${error.message}`);
        }
      }
    } else if (member.roles.cache.has(role.id)) {
      try {
        await member.roles.remove(role);
        logger.info(
          `Removed role '${role.name}' from ${member.user.tag}; holdings (${ownedCount}) below requirement (${required}) for ${rule.contractAddress}.`
        );
      } catch (error) {
        logger.error(`Error removing role '${role.name}' from ${member.user.tag}: ${error.message}`);
      }
    }
  }
}

async function periodicRoleCheck(client) {
  logger.info('Performing periodic NFT role check for all verified users...');

  try {
    const verifiedUsers = await fetchVerifiedUsers();

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
