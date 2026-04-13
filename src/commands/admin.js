const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const logger = require('../utils/logger');
const { periodicRoleCheck } = require('../services/nftRoleManagerService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Admin moderation commands')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addSubcommand(subcommand =>
            subcommand
                .setName('ban')
                .setDescription('Ban a user from the server')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to ban')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for ban')
                        .setRequired(false)
                        .setMaxLength(200)
                )
                .addIntegerOption(option =>
                    option.setName('days')
                        .setDescription('Number of days of messages to delete (0-7)')
                        .setRequired(false)
                        .setMinValue(0)
                        .setMaxValue(7)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('kick')
                .setDescription('Kick a user from the server')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to kick')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for kick')
                        .setRequired(false)
                        .setMaxLength(200)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('timeout')
                .setDescription('Timeout a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to timeout')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('duration')
                        .setDescription('Timeout duration in minutes')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(40320) // 28 days max
                )
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for timeout')
                        .setRequired(false)
                        .setMaxLength(200)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('purge')
                .setDescription('Delete multiple messages')
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Number of messages to delete (1-100)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(100)
                )
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('Only delete messages from this user')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('slowmode')
                .setDescription('Set channel slowmode')
                .addIntegerOption(option =>
                    option.setName('seconds')
                        .setDescription('Slowmode in seconds (0-21600)')
                        .setRequired(true)
                        .setMinValue(0)
                        .setMaxValue(21600)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('recheck-roles')
                .setDescription('Re-check all verified users\' NFT holdings and update roles')
                .addBooleanOption(option =>
                    option.setName('force')
                        .setDescription('Force re-check even users recently verified (ignores cache)')
                        .setRequired(false)
                )
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: 64 });

        try {
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'ban':
                    await this.handleBan(interaction);
                    break;
                case 'kick':
                    await this.handleKick(interaction);
                    break;
                case 'timeout':
                    await this.handleTimeout(interaction);
                    break;
                case 'purge':
                    await this.handlePurge(interaction);
                    break;
                case 'slowmode':
                    await this.handleSlowmode(interaction);
                    break;
                case 'recheck-roles':
                    await this.handleRecheckRoles(interaction);
                    break;
                default:
                    await interaction.editReply({
                        content: '❌ Unknown subcommand.',
                        flags: 64
                    });
            }
        } catch (error) {
            logger.error('Error in admin command:', error);
            await interaction.editReply({
                content: '❌ An error occurred while processing the admin command.',
                flags: 64
            });
        }
    },

    async handleBan(interaction) {
        try {
            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            const days = interaction.options.getInteger('days') || 0;

            // Check if user can be banned
            if (targetUser.id === interaction.user.id) {
                return await interaction.editReply({
                    content: '❌ You cannot ban yourself.',
                    flags: 64
                });
            }

            if (targetUser.id === interaction.guild.ownerId) {
                return await interaction.editReply({
                    content: '❌ You cannot ban the server owner.',
                    flags: 64
                });
            }

            const targetMember = await interaction.guild.members.fetch(targetUser.id);
            if (targetMember && !targetMember.bannable) {
                return await interaction.editReply({
                    content: '❌ I cannot ban this user. They may have higher permissions than me.',
                    flags: 64
                });
            }

            // Ban the user
            await interaction.guild.members.ban(targetUser, {
                reason: `${reason} - Banned by ${interaction.user.tag}`,
                deleteMessageDays: days
            });

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🔨 User Banned')
                .setDescription(`**User:** ${targetUser.tag} (${targetUser.id})`)
                .addFields({
                    name: '👮 Banned By',
                    value: interaction.user.tag,
                    inline: true
                }, {
                    name: '📅 Banned At',
                    value: new Date().toLocaleString(),
                    inline: true
                }, {
                    name: '🗑️ Messages Deleted',
                    value: `${days} days`,
                    inline: true
                }, {
                    name: '📝 Reason',
                    value: reason,
                    inline: false
                })
                .setThumbnail(targetUser.displayAvatarURL())
                .setTimestamp();

            await interaction.editReply({
                embeds: [embed],
                content: `✅ Successfully banned ${targetUser.tag}`
            });

            // Log the action
            await this.logModAction(interaction.guild, 'User Banned', {
                user: targetUser.tag,
                userId: targetUser.id,
                bannedBy: interaction.user.tag,
                reason: reason,
                deleteMessageDays: days
            });

        } catch (error) {
            logger.error('Error banning user:', error);
            await interaction.editReply({
                content: '❌ Failed to ban user. Please check my permissions and try again.',
                flags: 64
            });
        }
    },

    async handleKick(interaction) {
        try {
            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'No reason provided';

            // Check if user can be kicked
            if (targetUser.id === interaction.user.id) {
                return await interaction.editReply({
                    content: '❌ You cannot kick yourself.',
                    flags: 64
                });
            }

            if (targetUser.id === interaction.guild.ownerId) {
                return await interaction.editReply({
                    content: '❌ You cannot kick the server owner.',
                    flags: 64
                });
            }

            const targetMember = await interaction.guild.members.fetch(targetUser.id);
            if (targetMember && !targetMember.kickable) {
                return await interaction.editReply({
                    content: '❌ I cannot kick this user. They may have higher permissions than me.',
                    flags: 64
                });
            }

            // Kick the user
            await targetMember.kick(`${reason} - Kicked by ${interaction.user.tag}`);

            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('👢 User Kicked')
                .setDescription(`**User:** ${targetUser.tag} (${targetUser.id})`)
                .addFields({
                    name: '👮 Kicked By',
                    value: interaction.user.tag,
                    inline: true
                }, {
                    name: '📅 Kicked At',
                    value: new Date().toLocaleString(),
                    inline: true
                }, {
                    name: '📝 Reason',
                    value: reason,
                    inline: false
                })
                .setThumbnail(targetUser.displayAvatarURL())
                .setTimestamp();

            await interaction.editReply({
                embeds: [embed],
                content: `✅ Successfully kicked ${targetUser.tag}`
            });

            // Log the action
            await this.logModAction(interaction.guild, 'User Kicked', {
                user: targetUser.tag,
                userId: targetUser.id,
                kickedBy: interaction.user.tag,
                reason: reason
            });

        } catch (error) {
            logger.error('Error kicking user:', error);
            await interaction.editReply({
                content: '❌ Failed to kick user. Please check my permissions and try again.',
                flags: 64
            });
        }
    },

    async handleTimeout(interaction) {
        try {
            const targetUser = interaction.options.getUser('user');
            const duration = interaction.options.getInteger('duration');
            const reason = interaction.options.getString('reason') || 'No reason provided';

            // Check if user can be timed out
            if (targetUser.id === interaction.user.id) {
                return await interaction.editReply({
                    content: '❌ You cannot timeout yourself.',
                    flags: 64
                });
            }

            if (targetUser.id === interaction.guild.ownerId) {
                return await interaction.editReply({
                    content: '❌ You cannot timeout the server owner.',
                    flags: 64
                });
            }

            const targetMember = await interaction.guild.members.fetch(targetUser.id);
            if (targetMember && !targetMember.moderatable) {
                return await interaction.editReply({
                    content: '❌ I cannot timeout this user. They may have higher permissions than me.',
                    flags: 64
                });
            }

            // Calculate timeout duration
            const timeoutDuration = duration * 60 * 1000; // Convert to milliseconds

            // Timeout the user
            await targetMember.timeout(timeoutDuration, `${reason} - Timed out by ${interaction.user.tag}`);

            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('⏰ User Timed Out')
                .setDescription(`**User:** ${targetUser.tag} (${targetUser.id})`)
                .addFields({
                    name: '👮 Timed Out By',
                    value: interaction.user.tag,
                    inline: true
                }, {
                    name: '⏱️ Duration',
                    value: `${duration} minutes`,
                    inline: true
                }, {
                    name: '📅 Timed Out At',
                    value: new Date().toLocaleString(),
                    inline: true
                }, {
                    name: '📝 Reason',
                    value: reason,
                    inline: false
                })
                .setThumbnail(targetUser.displayAvatarURL())
                .setTimestamp();

            await interaction.editReply({
                embeds: [embed],
                content: `✅ Successfully timed out ${targetUser.tag} for ${duration} minutes`
            });

            // Log the action
            await this.logModAction(interaction.guild, 'User Timed Out', {
                user: targetUser.tag,
                userId: targetUser.id,
                timedOutBy: interaction.user.tag,
                duration: `${duration} minutes`,
                reason: reason
            });

        } catch (error) {
            logger.error('Error timing out user:', error);
            await interaction.editReply({
                content: '❌ Failed to timeout user. Please check my permissions and try again.',
                flags: 64
            });
        }
    },

    async handlePurge(interaction) {
        try {
            const amount = interaction.options.getInteger('amount');
            const targetUser = interaction.options.getUser('user');

            // Check if channel is a text channel
            if (interaction.channel.type !== 0) {
                return await interaction.editReply({
                    content: '❌ This command can only be used in text channels.',
                    flags: 64
                });
            }

            // Delete messages
            let deletedCount = 0;
            if (targetUser) {
                // Delete messages from specific user
                const messages = await interaction.channel.messages.fetch({ limit: 100 });
                const userMessages = messages.filter(msg => msg.author.id === targetUser.id).first(amount);
                
                if (userMessages.length > 0) {
                    await interaction.channel.bulkDelete(userMessages, true);
                    deletedCount = userMessages.length;
                }
            } else {
                // Delete all messages
                const messages = await interaction.channel.bulkDelete(amount, true);
                deletedCount = messages.size;
            }

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🗑️ Messages Purged')
                .setDescription(`Successfully deleted ${deletedCount} message(s)`)
                .addFields({
                    name: '👮 Purged By',
                    value: interaction.user.tag,
                    inline: true
                }, {
                    name: '📅 Purged At',
                    value: new Date().toLocaleString(),
                    inline: true
                }, {
                    name: '🎯 Target',
                    value: targetUser ? targetUser.tag : 'All messages',
                    inline: true
                })
                .setTimestamp();

            await interaction.editReply({
                embeds: [embed],
                content: `✅ Successfully purged ${deletedCount} message(s)`
            });

            // Log the action
            await this.logModAction(interaction.guild, 'Messages Purged', {
                channel: interaction.channel.name,
                amount: deletedCount,
                target: targetUser ? targetUser.tag : 'All messages',
                purgedBy: interaction.user.tag
            });

        } catch (error) {
            logger.error('Error purging messages:', error);
            await interaction.editReply({
                content: '❌ Failed to purge messages. Messages older than 14 days cannot be deleted.',
                flags: 64
            });
        }
    },

    async handleSlowmode(interaction) {
        try {
            const seconds = interaction.options.getInteger('seconds');

            // Check if channel is a text channel
            if (interaction.channel.type !== 0) {
                return await interaction.editReply({
                    content: '❌ This command can only be used in text channels.',
                    flags: 64
                });
            }

            // Set slowmode
            await interaction.channel.setRateLimitPerUser(seconds);

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🐌 Slowmode Updated')
                .setDescription(`Slowmode has been set to ${seconds} seconds`)
                .addFields({
                    name: '👮 Set By',
                    value: interaction.user.tag,
                    inline: true
                }, {
                    name: '📅 Set At',
                    value: new Date().toLocaleString(),
                    inline: true
                }, {
                    name: '⏱️ Duration',
                    value: seconds === 0 ? 'Disabled' : `${seconds} seconds`,
                    inline: true
                })
                .setTimestamp();

            await interaction.editReply({
                embeds: [embed],
                content: `✅ Slowmode set to ${seconds} seconds`
            });

            // Log the action
            await this.logModAction(interaction.guild, 'Slowmode Updated', {
                channel: interaction.channel.name,
                duration: seconds === 0 ? 'Disabled' : `${seconds} seconds`,
                setBy: interaction.user.tag
            });

        } catch (error) {
            logger.error('Error setting slowmode:', error);
            await interaction.editReply({
                content: '❌ Failed to set slowmode. Please check my permissions and try again.',
                flags: 64
            });
        }
    },

    async handleRecheckRoles(interaction) {
        const force = interaction.options.getBoolean('force') || false;
        const guild = interaction.guild;
        const guildId = guild.id;

        const startTime = Date.now();
        let usersChecked = 0;
        let rolesUpdated = 0;

        // Send initial status
        await interaction.editReply({
            content: `🔄 Starting role re-check for all verified users in **${guild.name}**... This may take a moment.`,
        });

        try {
            // Override the periodicRoleCheck to capture stats
            const { getUserStore, getGuildVerificationConfigStore } = require('../services/serviceFactory');
            const NFTVerificationService = require('../services/nftVerification');
            const userStore = getUserStore();

            let verifiedUsers = [];
            try {
                const rows = await userStore.listVerifiedUsers();
                verifiedUsers = rows
                    .filter(r => r.guild_id === guildId && r.wallet_address)
                    .map(r => ({
                        discordId: r.discord_id,
                        guildId: r.guild_id,
                        walletAddress: r.wallet_address,
                    }));
            } catch (err) {
                throw new Error(`Failed to fetch verified users: ${err.message}`);
            }

            if (verifiedUsers.length === 0) {
                return await interaction.editReply({
                    content: `ℹ️ No verified users found in this server. Nothing to re-check.`,
                });
            }

            const contractRules = getGuildVerificationConfigStore()
                ? await getGuildVerificationConfigStore().listByGuild(guildId)
                : [];

            if (!contractRules || contractRules.length === 0) {
                return await interaction.editReply({
                    content: `❌ No NFT verification rules configured for this server. Use \`/verification-config add\` to set up rules first.`,
                });
            }

            const nftService = new NFTVerificationService();
            const contractAddresses = contractRules.map(r => r.contractAddress).filter(Boolean);

            for (const user of verifiedUsers) {
                const member = await guild.members.fetch(user.discordId).catch(() => null);
                if (!member) {
                    usersChecked++;
                    continue;
                }

                usersChecked++;

                try {
                    const result = await nftService.verifyNFTOwnership(user.walletAddress, {
                        contractAddresses,
                        guildId,
                    });

                    const byContract = result.byContract || {};

                    for (const rule of contractRules) {
                        const normalizedContract = rule.contractAddress?.toLowerCase?.();
                        const ownedCount = normalizedContract ? byContract[normalizedContract] || 0 : 0;
                        const required = rule.requiredNftCount || 1;

                        let role = null;
                        if (rule.roleId) role = guild.roles.cache.get(rule.roleId);
                        if (!role && rule.roleName) role = guild.roles.cache.find(r => r.name === rule.roleName);
                        if (!role) continue;

                        if (ownedCount >= required && !member.roles.cache.has(role.id)) {
                            await member.roles.add(role);
                            rolesUpdated++;
                        } else if (ownedCount < required && member.roles.cache.has(role.id)) {
                            await member.roles.remove(role);
                            rolesUpdated++;
                        }
                    }
                } catch (err) {
                    logger.warn(`Failed to recheck roles for user ${user.discordId}: ${err.message}`);
                }
            }

            const duration = ((Date.now() - startTime) / 1000).toFixed(1);

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Role Re-Check Complete')
                .setDescription(`NFT role assignments have been refreshed for all verified users in **${guild.name}**.`)
                .addFields(
                    { name: 'Users Checked', value: String(usersChecked), inline: true },
                    { name: 'Roles Updated', value: String(rolesUpdated), inline: true },
                    { name: 'Duration', value: `${duration}s`, inline: true },
                    { name: 'Verification Rules', value: contractRules.length.toString(), inline: true },
                    { name: 'Triggered By', value: interaction.user.tag, inline: true },
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            logger.error('Error in handleRecheckRoles:', error);
            await interaction.editReply({
                content: `❌ Failed to re-check roles: ${error.message}`,
            });
        }
    },

    async logModAction(guild, action, details) {
        try {
            // Find mod-log channel
            const modLogChannel = guild.channels.cache.find(channel => 
                channel.name === 'mod-log' || channel.name === 'admin-log'
            );

            if (modLogChannel) {
                const embed = new EmbedBuilder()
                    .setColor('#FF6B35')
                    .setTitle(`👮 Mod Action: ${action}`)
                    .setTimestamp()
                    .addFields(
                        Object.entries(details).map(([key, value]) => ({
                            name: key.charAt(0).toUpperCase() + key.slice(1),
                            value: value.toString(),
                            inline: true
                        }))
                    );

                await modLogChannel.send({ embeds: [embed] });
            }
        } catch (error) {
            logger.error('Failed to log mod action:', error);
        }
    }
};
