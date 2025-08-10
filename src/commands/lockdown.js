const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { BotConfig } = require('../database/models');
const EmbedBuilder = require('../utils/embedBuilder');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lockdown')
        .setDescription('Emergency lockdown - restrict all chat to founders only')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for lockdown')
                .setRequired(false)
                .setMaxLength(200)
        ),

    async execute(interaction) {
        const guild = interaction.guild;
        const reason = interaction.options.getString('reason') || 'Emergency lockdown initiated';
        
        try {
            // Check if user has founder role
            const botConfig = await BotConfig.findOne({ guildId: guild.id });
            if (!botConfig) {
                return await interaction.reply({
                    content: '❌ Bot configuration not found. Please run `/config` first.',
                    ephemeral: true
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
                    content: '❌ Only founders can initiate lockdown.',
                    ephemeral: true
                });
            }

            // Start lockdown process
            await interaction.deferReply();

            // Update bot config to mark lockdown status
            await BotConfig.findOneAndUpdate(
                { guildId: guild.id },
                { 
                    $set: { 
                        'security.lockdown': {
                            active: true,
                            initiatedBy: interaction.user.id,
                            reason: reason,
                            timestamp: new Date()
                        }
                    }
                },
                { upsert: true }
            );

            // Apply lockdown to all text channels
            const textChannels = guild.channels.cache.filter(channel => 
                channel.type === 0 && // Text channels
                channel.name !== 'mod-log' && // Don't lock mod-log
                channel.name !== 'admin' // Don't lock admin channels
            );

            let lockedChannels = 0;
            for (const [channelId, channel] of textChannels) {
                try {
                    // Set permissions so only founders can send messages
                    await channel.permissionOverwrites.set([
                        {
                            id: guild.roles.everyone.id,
                            deny: ['SendMessages', 'AddReactions']
                        },
                        ...founderRoles.map(roleId => ({
                            id: roleId,
                            allow: ['SendMessages', 'AddReactions']
                        }))
                    ]);
                    lockedChannels++;
                } catch (error) {
                    logger.error(`Failed to lock channel ${channel.name}:`, error);
                }
            }

            // Send lockdown notification to general channel
            const generalChannel = guild.channels.cache.find(channel => 
                channel.name === 'general' || 
                channel.name === 'chat' ||
                channel.name === 'main'
            );

            if (generalChannel) {
                const lockdownEmbed = EmbedBuilder.createLockdownEmbed(reason);
                await generalChannel.send({
                    content: '@everyone',
                    embeds: [lockdownEmbed]
                });
            }

            // Log the action
            await this.logLockdownAction(guild, interaction.user, reason, lockedChannels);

            // Send confirmation
            const confirmationEmbed = EmbedBuilder.createMatricaStyleEmbed({
                title: '🔒 Lockdown Initiated',
                description: `Server has been locked down successfully.`,
                color: '#FF0000',
                fields: [
                    {
                        name: '📊 Status',
                        value: `✅ Locked ${lockedChannels} channels\n🔒 Only founders can post\n⏰ Initiated at ${new Date().toLocaleString()}`,
                        inline: false
                    },
                    {
                        name: '📝 Reason',
                        value: reason,
                        inline: false
                    }
                ]
            });

            await interaction.editReply({
                embeds: [confirmationEmbed]
            });

            logger.info(`Lockdown initiated by ${interaction.user.tag} in ${guild.name}. Reason: ${reason}`);

        } catch (error) {
            logger.error('Error during lockdown:', error);
            await interaction.editReply({
                content: '❌ An error occurred while initiating lockdown.',
                ephemeral: true
            });
        }
    },

    async logLockdownAction(guild, user, reason, lockedChannels) {
        try {
            const botConfig = await BotConfig.findOne({ guildId: guild.id });
            const modLogChannel = botConfig?.modLogChannel;
            
            if (modLogChannel) {
                const channel = guild.channels.cache.get(modLogChannel);
                if (channel) {
                    const logEmbed = EmbedBuilder.createMatricaStyleEmbed({
                        title: '🚨 Lockdown Log',
                        description: 'Emergency lockdown has been initiated',
                        color: '#FF0000',
                        fields: [
                            {
                                name: '👤 Initiated By',
                                value: `${user.tag} (${user.id})`,
                                inline: true
                            },
                            {
                                name: '🔒 Channels Locked',
                                value: lockedChannels.toString(),
                                inline: true
                            },
                            {
                                name: '📝 Reason',
                                value: reason,
                                inline: false
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
            logger.error('Failed to log lockdown action:', error);
        }
    }
};
