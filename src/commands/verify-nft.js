const { SlashCommandBuilder } = require('discord.js');
const logger = require('../../src/utils/logger');
const NFTVerificationService = require('../../src/services/nftVerification'); // Corrected import
const { assignRolesBasedOnNfts } = require('../../src/services/nftRoleManagerService');
const User = require('../../src/database/models/User');
const { logVerification } = require('../../src/services/verificationService'); // Import logVerification

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify-nft') // Renamed command
    .setDescription('Verifies your wallet for NFT ownership and assigns roles.')
    .addStringOption(option =>
      option.setName('wallet_address')
        .setDescription('Your Solana wallet address.')
        .setRequired(true)),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const walletAddress = interaction.options.getString('wallet_address');
    const userId = interaction.user.id;
    const username = interaction.user.username;
    const guild = interaction.guild;

    const nftService = new NFTVerificationService();

    // Validate wallet address
    if (!nftService.isValidSolanaAddress(walletAddress)) {
      return await interaction.editReply({
        content: '❌ Invalid Solana wallet address format. Please provide a valid address.',
        ephemeral: true
      });
    }

    // Check if user is already verified with this wallet
    let userProfile = await User.findOne({ discordId: userId, guildId: guild.id });
    if (userProfile && userProfile.isVerified && userProfile.walletAddress === walletAddress) {
      return await interaction.editReply({
        content: '✅ You are already verified with this wallet address!',
        ephemeral: true
      });
    }

    // Verify NFT ownership
    const verificationResult = await nftService.verifyNFTOwnership(walletAddress);

    if (!verificationResult.isVerified) {
      // Update user record with failed verification
      if (!userProfile) {
        userProfile = new User({
          discordId: userId,
          guildId: guild.id,
          userGuildId: `${userId}-${guild.id}`,
          username: username,
          discriminator: interaction.user.discriminator,
        });
      }
      userProfile.walletAddress = walletAddress;
      userProfile.isVerified = false;
      userProfile.lastVerificationCheck = new Date();
      userProfile.verificationHistory.push({
        walletAddress: walletAddress,
        verifiedAt: new Date(),
        nftCount: 0,
        status: 'failed'
      });
      await userProfile.save();

      const embed = new (require('discord.js').EmbedBuilder)()
        .setColor('#FF0000')
        .setTitle('❌ Verification Failed')
        .setDescription('No Lil Gargs NFTs found in this wallet.')
        .addFields({
          name: 'Wallet Address',
          value: walletAddress,
          inline: false
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed], ephemeral: true });

      logger.info(`User ${username} (${userId}) verification failed for wallet ${walletAddress}.`);

    } else {
      // Create or update user record with successful verification
      if (!userProfile) {
        userProfile = new User({
          discordId: userId,
          guildId: guild.id,
          userGuildId: `${userId}-${guild.id}`,
          username: username,
          discriminator: interaction.user.discriminator,
        });
      }
      userProfile.walletAddress = walletAddress;
      userProfile.isVerified = true;
      userProfile.nftTokens = verificationResult.nfts.map(nft => ({
        mint: nft.mint,
        name: nft.name,
        image: nft.image,
        verifiedAt: new Date()
      }));
      userProfile.lastVerificationCheck = new Date();
      userProfile.verificationHistory.push({
        walletAddress: walletAddress,
        verifiedAt: new Date(),
        nftCount: verificationResult.nftCount,
        status: 'success'
      });
      await userProfile.save();

      // Assign roles based on NFT count
      await assignRolesBasedOnNfts(interaction.member, walletAddress);

      // Create success embed
      const embed = new (require('discord.js').EmbedBuilder)()
        .setColor('#00FF00')
        .setTitle('✅ Verification Successful!')
        .setDescription(`Welcome to the Lil Gargs community!`)
        .addFields(
          {
            name: 'Wallet Address',
            value: walletAddress,
            inline: false
          },
          {
            name: 'NFTs Found',
            value: verificationResult.nftCount.toString(),
            inline: true
          },
          {
            name: 'Status',
            value: 'Verified',
            inline: true
          }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed], ephemeral: true });

      // Log verification to admin channel
      await logVerification(interaction.client, interaction.user, walletAddress);

      logger.info(`User ${username} (${userId}) verified successfully with ${verificationResult.nftCount} NFTs`);
    }
  },
};