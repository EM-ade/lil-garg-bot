const express = require('express');
const router = express.Router();
const { assignRolesBasedOnNfts } = require('../services/nftRoleManagerService');
const { isSupabaseEnabled, getUserStore } = require('../services/serviceFactory');

const userStore = getUserStore();

async function upsertUserVerification(discordId, guildId, walletAddress, nftCount) {
  const lastVerified = new Date();
  const isVerified = nftCount > 0;

  if (isSupabaseEnabled()) {
    await userStore.upsertVerificationStatus({
      discordId,
      guildId,
      walletAddress,
      isVerified,
      lastVerified: lastVerified.toISOString(),
    });
    return;
  }

  await userStore.findOneAndUpdate(
    { discordId, guildId },
    {
      walletAddress,
      isVerified,
      lastVerificationCheck: lastVerified,
    },
    { upsert: true, new: true }
  );
}

// Endpoint to handle verification callback from the frontend
router.post('/verification-callback', async (req, res) => {
  const { discordId, walletAddress, nftCount } = req.body;

  // Validate inputs
  if (!discordId || !walletAddress || nftCount === undefined) {
    return res.status(400).json({ success: false, error: 'Invalid data: discordId, walletAddress, and nftCount are required.' });
  }

  try {
    // Get the Discord client from the app
    const client = req.app.get('discordClient');
    if (!client) {
      return res.status(500).json({ success: false, error: 'Discord client not available.' });
    }

    // Find the user in all guilds the bot is in
    let member = null;
    let guild = null;
    
    for (const [guildId, currentGuild] of client.guilds.cache) {
      try {
        const potentialMember = await currentGuild.members.fetch(discordId).catch(() => null);
        if (potentialMember) {
          member = potentialMember;
          guild = currentGuild;
          break;
        }
      } catch (error) {
        console.error(`Error fetching member ${discordId} from guild ${guildId}:`, error);
      }
    }

    if (!member || !guild) {
      return res.status(404).json({ success: false, error: 'User not found in any server where the bot is present.' });
    }

    // Update user record in database
    await upsertUserVerification(discordId, guild.id, walletAddress, nftCount);

    // Assign roles based on NFT count
    await assignRolesBasedOnNfts(member, walletAddress);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error in verification callback:', error);
    return res.status(500).json({ success: false, error: 'Failed to process verification.' });
  }
});

module.exports = router;
