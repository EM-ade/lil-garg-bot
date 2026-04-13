const logger = require('../utils/logger');
const NFTVerificationService = require('./nftVerification');
const {
  getUserStore,
  getGuildVerificationConfigStore,
} = require('./serviceFactory');

const userStore = getUserStore();
const guildVerificationConfigStore = getGuildVerificationConfigStore();

// NFT cache instance, injected from index.js
let nftCache = null;

function setNftCache(cache) {
  nftCache = cache;
}

function mapSupabaseUserRecord(record) {
  if (!record) return null;

  return {
    discordId: record.discord_id,
    guildId: record.guild_id,
    walletAddress: record.wallet_address,
  };
}

async function fetchVerifiedUsers() {
  try {
    const rows = await userStore.listVerifiedUsers();
    return rows.map(mapSupabaseUserRecord);
  } catch (error) {
    logger.error(`Failed to fetch verified users: ${error.message}`);
    return [];
  }
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

    if (!contractRules || contractRules.length === 0) {
      logger.warn(`No NFT verification rules configured for guild ${member.guild.name}. Run /verification-config add to set up rules.`);
      return;
    }

    const nftService = new NFTVerificationService();
    await applyContractRuleRoles({ member, walletAddress, contractRules, nftService });
  } catch (error) {
    logger.error(`Error in assignRolesBasedOnNfts for guild ${member.guild.id}: ${error.message}`);
  }
}

async function applyContractRuleRoles({ member, walletAddress, contractRules, nftService }) {
  const contractAddresses = contractRules
    .map((rule) => rule.contractAddress)
    .filter(Boolean);

  const guildId = member.guild.id;

  const verificationResult = await nftService.verifyNFTOwnership(walletAddress, {
    contractAddresses,
    guildId,
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

async function periodicRoleCheck(client, guildId = null) {
  if (guildId) {
    logger.info(`Performing periodic NFT role check for guild ${guildId}...`);
  } else {
    logger.info('Performing periodic NFT role check for all verified users...');
  }

  try {
    let verifiedUsers = await fetchVerifiedUsers();

    // Filter by guild if specified
    if (guildId) {
      verifiedUsers = verifiedUsers.filter(u => u.guildId === guildId);
    }

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
  setNftCache,
};
