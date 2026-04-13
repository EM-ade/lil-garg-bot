const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { BotConfig } = require('../database/models');
const EmbedBuilder = require('../utils/embedBuilder');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Lift emergency lockdown and restore normal permissions')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const guild = interaction.guild;
        
        try {
            // Check if user has founder role
            const botConfig = await BotConfig.findOne({ guildId: guild.id });
            if (!botConfig) {
                return await interaction.reply({
                    content: '❌ Bot configuration not found. Please run `/config` first.',
                    flags: 64
                });
            }

            const founderRoles = botConfig.founderRoles || [];
            const member = interaction.member;
            const hasFounderRole = member.roles.cache.some(role => 
                founderRoles.includes(role.id) || 
                role.name.toLowerCase().includes('founder') ||
                role.name.toLowerCase().includes('owner')
            );

            if (!hasFounderRole && !member.permissions.has(PermissionFlagsBits.Administrator)) {
                return await interaction.reply({
                    content: '❌ Only founders can lift lockdown.',
                    flags: 64
                });
            }

            // Check if lockdown is active
            if (!botConfig.security?.lockdown?.active) {
                return await interaction.reply({
                    content: '❌ No active lockdown found.',
                    flags: 64
                });
            }

            // Start unlock process
            await interaction.deferReply();

            // Update bot config to mark lockdown as inactive
            await BotConfig.findOneAndUpdate(
                { guildId: guild.id },
                { 
                    $set: { 
                        'security.lockdown.active': false,
                        'security.lockdown.liftedBy': interaction.user.id,
                        'security.lockdown.liftedAt': new Date()
                    }
                }
            );

            // Restore permissions to all text channels
            const textChannels = guild.channels.cache.filter(channel => 
                channel.type === 0 && // Text channels
                channel.name !== 'mod-log' && // Don't modify mod-log
                channel.name !== 'admin' // Don't modify admin channels
            );

            let unlockedChannels = 0;
            for (const [channelId, channel] of textChannels) {
                try {
                    // Clear permission overwrites to restore default permissions
                    await channel.permissionOverwrites.set([]);
                    unlockedChannels++;
                } catch (error) {
                    logger.error(`Failed to unlock channel ${channel.name}:`, error);
                }
            }

            // Send unlock notification to general channel
            const generalChannel = guild.channels.cache.find(channel => 
                channel.name === 'general' || 
                channel.name === 'chat' ||
                channel.name === 'main'
            );

            if (generalChannel) {
                const unlockEmbed = EmbedBuilder.createMatricaStyleEmbed({
                    title: '🔓 Lockdown Lifted',
                    description: 'Emergency lockdown has been lifted. Normal permissions restored.',
                    color: '#00FF00',
                    fields: [
                        {
                            name: '✅ Status',
                            value: 'All chat channels have been unlocked and permissions restored.',
                            inline: false
                        },
                        {
                            name: '👤 Lifted By',
                            value: interaction.user.tag,
                            inline: true
                        },
                        {
                            name: '⏰ Lifted At',
                            value: new Date().toLocaleString(),
                            inline: true
                        }
                    ]
                });

                await generalChannel.send({
                    content: '@everyone',
                    embeds: [unlockEmbed]
                });
            }

            // Log the action
            await this.logUnlockAction(guild, interaction.user, unlockedChannels);

            // Send confirmation
            const confirmationEmbed = EmbedBuilder.createMatricaStyleEmbed({
                title: '🔓 Lockdown Lifted',
                description: `Server lockdown has been lifted successfully.`,
                color: '#00FF00',
                fields: [
                    {
                        name: '📊 Status',
                        value: `✅ Unlocked ${unlockedChannels} channels\n🔓 Normal permissions restored\n⏰ Lifted at ${new Date().toLocaleString()}`,
                        inline: false
                    },
                    {
                        name: '👤 Lifted By',
                        value: interaction.user.tag,
                        inline: false
                    }
                ]
            });

            await interaction.editReply({
                embeds: [confirmationEmbed]
            });

            logger.info(`Lockdown lifted by ${interaction.user.tag} in ${guild.name}`);

        } catch (error) {
            logger.error('Error during unlock:', error);
            await interaction.editReply({
                content: '❌ An error occurred while lifting lockdown.',
                flags: 64
            });
        }
    },

    async logUnlockAction(guild, user, unlockedChannels) {
        try {
            const botConfig = await BotConfig.findOne({ guildId: guild.id });
            const modLogChannel = botConfig?.modLogChannel;
            
            if (modLogChannel) {
                const channel = guild.channels.cache.get(modLogChannel);
                if (channel) {
                    const logEmbed = EmbedBuilder.createMatricaStyleEmbed({
                        title: '🔓 Unlock Log',
                        description: 'Emergency lockdown has been lifted',
                        color: '#00FF00',
                        fields: [
                            {
                                name: '👤 Lifted By',
                                value: `${user.tag} (${user.id})`,
                                inline: true
                            },
                            {
                                name: '🔓 Channels Unlocked',
                                value: unlockedChannels.toString(),
                                inline: true
                            },
                            {
                                name: '⏰ Timestamp',
                                value: new Date().toLocaleString(),
                                inline: false
                            }
                        ]
                    });

                    await channel.send({ embeds: [logEmbed] });
                }
            }
        } catch (error) {
            logger.error('Failed to log unlock action:', error);
        }
    }
};
