const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { User } = require('../database/models');
const NFTVerificationService = require('../services/nftVerification');
const RoleManager = require('../utils/roleManager');
const EmbedBuilderUtil = require('../utils/embedBuilder');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Verify your Lil Gargs NFT ownership')
        .addStringOption(option =>
            option.setName('wallet')
                .setDescription('Your Solana wallet address')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const walletAddress = interaction.options.getString('wallet');
            const userId = interaction.user.id;
            const username = interaction.user.username;
            const guild = interaction.guild;

            // Initialize services
            const nftService = new NFTVerificationService();
            const roleManager = new RoleManager(interaction.client);

            // Validate wallet address
            if (!nftService.isValidSolanaAddress(walletAddress)) {
                return await interaction.editReply({
                    content: '❌ Invalid Solana wallet address. Please provide a valid wallet address.',
                });
            }

            // Check if user is already verified with this wallet
            const existingUser = await User.findOne({ discordId: userId });
            if (existingUser && existingUser.isVerified && existingUser.walletAddress === walletAddress) {
                return await interaction.editReply({
                    content: '✅ You are already verified with this wallet address!',
                });
            }

            // Verify NFT ownership
            const verificationResult = await nftService.verifyNFTOwnership(walletAddress);

            if (!verificationResult.isVerified) {
                // Update user record with failed verification
                await User.findOneAndUpdate(
                    { discordId: userId },
                    {
                        discordId: userId,
                        username: username,
                        walletAddress: walletAddress,
                        isVerified: false,
                        lastVerificationCheck: new Date(),
                        $push: {
                            verificationHistory: {
                                walletAddress: walletAddress,
                                verifiedAt: new Date(),
                                nftCount: 0,
                                status: 'failed'
                            }
                        }
                    },
                    { upsert: true, new: true }
                );

                const embed = EmbedBuilderUtil.createVerificationEmbed(walletAddress, 0, 'failed');

                return await interaction.editReply({ embeds: [embed] });
            }

            // Create or update user record
            const user = await User.findOneAndUpdate(
                { discordId: userId },
                {
                    discordId: userId,
                    username: username,
                    walletAddress: walletAddress,
                    isVerified: true,
                    nftTokens: verificationResult.nfts.map(nft => ({
                        mint: nft.mint,
                        name: nft.name,
                        image: nft.image,
                        verifiedAt: new Date()
                    })),
                    lastVerificationCheck: new Date(),
                    $push: {
                        verificationHistory: {
                            walletAddress: walletAddress,
                            verifiedAt: new Date(),
                            nftCount: verificationResult.nftCount,
                            status: 'success'
                        }
                    }
                },
                { upsert: true, new: true }
            );

            // Assign verified role
            try {
                await roleManager.assignVerifiedRole(guild, userId);
            } catch (roleError) {
                logger.error('Error assigning role:', roleError);
                // Continue with verification even if role assignment fails
            }

            // Create success embed
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Verification Successful!')
                .setDescription(`You have been verified as a Lil Gargs holder!`)
                .addFields(
                    { name: 'Wallet Address', value: `\`${walletAddress}\``, inline: false },
                    { name: 'NFTs Found', value: verificationResult.nftCount.toString(), inline: true },
                    { name: 'Status', value: 'Verified ✅', inline: true }
                )
                .setTimestamp();

            // Add NFT details if available
            if (verificationResult.nfts.length > 0) {
                const nftList = verificationResult.nfts
                    .slice(0, 5) // Show max 5 NFTs
                    .map(nft => `• ${nft.name || 'Unknown Lil Garg'}`)
                    .join('\n');
                
                embed.addFields({
                    name: 'Your Lil Gargs NFTs',
                    value: nftList + (verificationResult.nfts.length > 5 ? `\n... and ${verificationResult.nfts.length - 5} more` : ''),
                    inline: false
                });
            }

            // Add thumbnail if available
            if (verificationResult.nfts[0]?.image) {
                embed.setThumbnail(verificationResult.nfts[0].image);
            }

            await interaction.editReply({ embeds: [embed] });

            // Log successful verification
            logger.info(`User ${username} (${userId}) verified with wallet ${walletAddress} - ${verificationResult.nftCount} NFTs found`);

        } catch (error) {
            logger.error('Error in verify command:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Verification Error')
                .setDescription('An error occurred during verification. Please try again later.')
                .addFields(
                    { name: 'Error', value: error.message || 'Unknown error', inline: false }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },
};
