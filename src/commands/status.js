const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const RoleManager = require('../utils/roleManager');
const AIChatbot = require('../services/aiChatbot');
const logger = require('../utils/logger');
const {
    isSupabaseEnabled,
    getUserStore,
    getDocumentStore,
    getBotConfigStore,
} = require('../services/serviceFactory');
const {
    verificationSessionService,
} = require('../services/verificationSessionService');
const {
    buildVerificationLink,
    buildSessionEmbed,
} = require('../utils/verificationSessionUi');

const userStore = getUserStore();
const documentStore = getDocumentStore();
const botConfigStore = getBotConfigStore();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Check your verification status and bot statistics'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const userId = interaction.user.id;
            const username = interaction.user.username;
            const guild = interaction.guild;
            const guildId = guild?.id;

            // Get user verification status
            const roleManager = new RoleManager(interaction.client);
            const userStatus = await roleManager.getUserVerificationStatus(guild, userId);
            
            // Get user data from database
            let userData;
            if (isSupabaseEnabled()) {
                userData = await userStore.findUserByDiscordAndGuild(userId, guildId);
            } else {
                userData = await userStore.findOne({ discordId: userId });
            }

            // Get AI chat stats
            const aiChatbot = new AIChatbot();
            const chatStats = await aiChatbot.getChatStats();

            // Get bot config for this guild
            let botConfig;
            if (isSupabaseEnabled()) {
                botConfig = (await botConfigStore.getBotConfigByGuildId(guildId)) || {};
            } else {
                botConfig = await botConfigStore.findOne({ guildId }) || {};
            }

            // Create main embed
            const embed = new EmbedBuilder()
                .setColor(userStatus.isVerified ? '#00ff00' : '#ffaa00')
                .setTitle('📊 Your Status & Bot Statistics')
                .setThumbnail(interaction.user.displayAvatarURL())
                .setTimestamp();

            // User verification section
            let verificationText = '';
            if (userStatus.isVerified) {
                verificationText += `✅ **Verified** - You own ${userStatus.nftCount} Lil Gargs NFT(s)\n`;
                verificationText += `🎭 **Role Status:** ${userStatus.hasRole ? 'Assigned' : 'Not Assigned'}\n`;
                if (userStatus.walletAddress) {
                    verificationText += `💼 **Wallet:** \`${userStatus.walletAddress.substring(0, 8)}...${userStatus.walletAddress.substring(-8)}\`\n`;
                }
                if (userStatus.lastVerificationCheck) {
                    verificationText += `🕒 **Last Check:** ${new Date(userStatus.lastVerificationCheck).toLocaleDateString()}\n`;
                }
            } else {
                verificationText += `❌ **Not Verified** - Use \`/verify\` to verify your NFT ownership\n`;
            }

            embed.addFields({
                name: '🔐 Verification Status',
                value: verificationText,
                inline: false
            });

            // User activity section if user exists in database
            if (userData) {
                let activityText = '';
                const firstJoined = userData.firstJoined || userData.created_at;
                if (firstJoined) {
                    activityText += `📅 **Member Since:** ${new Date(firstJoined).toLocaleDateString()}\n`;
                }

                const verificationHistory = userData.verificationHistory || userData.user_verification_history || [];
                activityText += `🔄 **Verification Attempts:** ${verificationHistory.length}\n`;

                const nftTokens = userData.nftTokens || userData.user_nft_tokens || [];
                if (nftTokens.length > 0) {
                    activityText += `🎨 **NFTs in Database:** ${nftTokens.length}\n`;
                    const recentNFT = nftTokens[nftTokens.length - 1];
                    if (recentNFT.name) {
                        activityText += `🎭 **Latest NFT:** ${recentNFT.name}\n`;
                    }
                }

                embed.addFields({
                    name: '📈 Your Activity',
                    value: activityText,
                    inline: false
                });
            }

            // Bot statistics section
            let botStatsText = '';
            botStatsText += `📚 **Knowledge Base:** ${chatStats.totalDocuments} documents\n`;
            botStatsText += `🤖 **AI Processing:** ${chatStats.processingRate}% complete\n`;
            
            if (botConfig.stats) {
                botStatsText += `✅ **Total Verifications:** ${botConfig.stats.totalVerifications || 0}\n`;
                botStatsText += `💬 **AI Queries:** ${botConfig.stats.totalAIQueries || 0}\n`;
            }

            // Get total verified users
            let totalVerifiedUsers = 0;
            if (isSupabaseEnabled() && userStore.countVerifiedUsers) {
                totalVerifiedUsers = await userStore.countVerifiedUsers();
            } else if (userStore.countDocuments) {
                totalVerifiedUsers = await userStore.countDocuments({ isVerified: true });
            }
            botStatsText += `👥 **Verified Users:** ${totalVerifiedUsers}\n`;

            embed.addFields({
                name: '🤖 Bot Statistics',
                value: botStatsText,
                inline: false
            });

            // Server configuration section (for admins)
            const hasAdminPermission = await roleManager.hasAdminPermissions(guild, userId);
            if (hasAdminPermission && botConfig) {
                let configText = '';
                configText += `🔧 **NFT Verification:** ${botConfig.nftVerification?.enabled !== false ? 'Enabled' : 'Disabled'}\n`;
                configText += `🤖 **AI Chat:** ${botConfig.aiChat?.enabled !== false ? 'Enabled' : 'Disabled'}\n`;
                configText += `🎭 **Auto Role Assignment:** ${botConfig.nftVerification?.autoRoleAssignment !== false ? 'Enabled' : 'Disabled'}\n`;
                
                if (botConfig.verifiedRoleId) {
                    const role = guild.roles.cache.get(botConfig.verifiedRoleId);
                    configText += `👑 **Verified Role:** ${role ? role.name : 'Role not found'}\n`;
                }

                embed.addFields({
                    name: '⚙️ Server Configuration',
                    value: configText,
                    inline: false
                });
            }

            // Add helpful commands section
            let commandsText = '';
            if (!userStatus.isVerified) {
                commandsText += `• \`/verify\` - Verify your NFT ownership\n`;
            }
            commandsText += `• \`/ask\` - Ask the AI about Lil Gargs\n`;
            commandsText += `• \`/list-documents\` - View knowledge base documents\n`;
            
            if (hasAdminPermission) {
                commandsText += `• \`/add-document\` - Add documents to knowledge base\n`;
                commandsText += `• \`/remove-document\` - Remove documents from knowledge base\n`;
            }

            if (isSupabaseEnabled() && !userStatus.isVerified) {
                commandsText += `• \`/verify\` - Launch secure verification portal\n`;
            }

            embed.addFields({
                name: '🛠️ Available Commands',
                value: commandsText,
                inline: false
            });

            if (isSupabaseEnabled() && !userStatus.isVerified) {
                try {
                    const session = await verificationSessionService.createSession({
                        discordId: userId,
                        guildId,
                        walletAddress: userData?.wallet_address || userData?.walletAddress,
                        username,
                    });
                    const verificationUrl = buildVerificationLink(session.token);
                    if (verificationUrl) {
                        const { embed: sessionEmbed, components } = buildSessionEmbed({
                            walletAddress: userData?.wallet_address || userData?.walletAddress || 'Not linked yet',
                            expiresAt: session.expiresAt,
                            verificationUrl,
                        });
                        embed.addFields({
                            name: '🔐 Verify Now',
                            value: 'Use the button below to open the verification portal and complete your NFT verification.',
                            inline: false,
                        });
                        await interaction.editReply({ embeds: [embed, sessionEmbed], components, ephemeral: true });
                        logger.info(`Status triggered verification session for user ${userId}`);
                        return;
                    }
                } catch (sessionError) {
                    logger.warn('Failed to generate verification session during status command:', sessionError.message);
                }
            }

            await interaction.editReply({ embeds: [embed] });

            // Log the status check
            logger.info(`Status checked by ${username} (${userId}) - Verified: ${userStatus.isVerified}`);

        } catch (error) {
            logger.error('Error in status command:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Error Getting Status')
                .setDescription('An error occurred while retrieving your status.')
                .addFields(
                    { name: 'Error Details', value: error.message || 'Unknown error', inline: false }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },
};
