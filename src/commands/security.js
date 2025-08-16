const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createInfoEmbed, createErrorEmbed, createSuccessEmbed } = require('../utils/embedBuilder');
const { BotError, ErrorCodes } = require('../utils/errorHandler');
const { getGuildConfig } = require('../utils/dbUtils');
const { enableLockdown, disableLockdown, isServerLocked } = require('../utils/securityManager');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('security')
    .setDescription('Manage server security features')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(subcommand =>
      subcommand
        .setName('lockdown')
        .setDescription('Enable or disable server lockdown')
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('Enable or disable lockdown')
            .setRequired(true)
            .addChoices(
              { name: 'Enable', value: 'enable' },
              { name: 'Disable', value: 'disable' }
            )
        )
        .addStringOption(option =>
          option
            .setName('reason')
            .setDescription('Reason for lockdown')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('antispam')
        .setDescription('Configure anti-spam settings')
        .addBooleanOption(option =>
          option
            .setName('enabled')
            .setDescription('Enable or disable anti-spam')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName('max_messages')
            .setDescription('Maximum messages per time window (default: 5)')
            .setMinValue(1)
            .setMaxValue(20)
            .setRequired(false)
        )
        .addIntegerOption(option =>
          option
            .setName('time_window')
            .setDescription('Time window in seconds (default: 10)')
            .setMinValue(5)
            .setMaxValue(60)
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('antiraid')
        .setDescription('Configure anti-raid settings')
        .addBooleanOption(option =>
          option
            .setName('enabled')
            .setDescription('Enable or disable anti-raid protection')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName('join_threshold')
            .setDescription('Max joins per minute to trigger protection (default: 10)')
            .setMinValue(3)
            .setMaxValue(50)
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('Action to take when raid detected')
            .setRequired(false)
            .addChoices(
              { name: 'Kick new members', value: 'kick' },
              { name: 'Ban new members', value: 'ban' },
              { name: 'Lockdown server', value: 'lockdown' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('links')
        .setDescription('Configure link filtering')
        .addBooleanOption(option =>
          option
            .setName('enabled')
            .setDescription('Enable or disable link filtering')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('Action to take on suspicious links')
            .setRequired(false)
            .addChoices(
              { name: 'Delete message', value: 'delete' },
              { name: 'Delete and warn', value: 'warn' },
              { name: 'Delete and timeout', value: 'timeout' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('impersonation')
        .setDescription('Configure username impersonation protection')
        .addBooleanOption(option =>
          option
            .setName('enabled')
            .setDescription('Enable or disable impersonation protection')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName('similarity_threshold')
            .setDescription('Similarity threshold (0-100, default: 80)')
            .setMinValue(50)
            .setMaxValue(100)
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('View current security settings')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('whitelist')
        .setDescription('Manage link whitelist')
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('Action to perform')
            .setRequired(true)
            .addChoices(
              { name: 'Add user', value: 'add' },
              { name: 'Remove user', value: 'remove' },
              { name: 'List users', value: 'list' }
            )
        )
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('User to add/remove from whitelist')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    try {
      switch (subcommand) {
        case 'lockdown':
          await handleLockdown(interaction, guildId);
          break;
        case 'antispam':
          await handleAntiSpam(interaction, guildId);
          break;
        case 'antiraid':
          await handleAntiRaid(interaction, guildId);
          break;
        case 'links':
          await handleLinkFilter(interaction, guildId);
          break;
        case 'impersonation':
          await handleImpersonation(interaction, guildId);
          break;
        case 'status':
          await handleStatus(interaction, guildId);
          break;
        case 'whitelist':
          await handleWhitelist(interaction, guildId);
          break;
        default:
          throw new BotError('Unknown subcommand', ErrorCodes.COMMAND_ERROR);
      }
    } catch (error) {
      logger.error('Error in security command:', error);
      
      const embed = createErrorEmbed(
        'Security System Error',
        error.message || 'An error occurred while processing the security command.'
      );
      
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }
  }
};

/**
 * Handle lockdown command
 */
async function handleLockdown(interaction, guildId) {
  const action = interaction.options.getString('action');
  const reason = interaction.options.getString('reason') || 'No reason provided';

  if (action === 'enable') {
    const result = await enableLockdown(guildId, interaction.user.id, reason);
    
    const embed = createSuccessEmbed(
      '🔒 Server Lockdown Enabled',
      'The server has been locked down successfully!',
      [
        {
          name: '📝 Reason',
          value: reason,
          inline: false
        },
        {
          name: '⚠️ Effects',
          value: '• New members cannot join\n• Most channels are restricted\n• Only staff can send messages',
          inline: false
        }
      ]
    );

    await interaction.reply({ embeds: [embed] });
    
  } else if (action === 'disable') {
    const wasLocked = await isServerLocked(guildId);
    
    if (!wasLocked) {
      throw new BotError(
        'Server is not currently in lockdown.',
        ErrorCodes.SECURITY_SYSTEM
      );
    }
    
    await disableLockdown(guildId, interaction.user.id);
    
    const embed = createSuccessEmbed(
      '🔓 Server Lockdown Disabled',
      'The server lockdown has been lifted successfully!',
      [
        {
          name: '✅ Status',
          value: 'Server is now operating normally',
          inline: false
        }
      ]
    );

    await interaction.reply({ embeds: [embed] });
  }
  
  /**
   * Handle whitelist management
   */
  async function handleWhitelist(interaction, guildId) {
    const action = interaction.options.getString('action');
    const targetUser = interaction.options.getUser('user');
    const { User } = require('../database/models');
  
    switch (action) {
      case 'add':
        if (!targetUser) {
          throw new BotError('Please specify a user to add to the whitelist.', ErrorCodes.INVALID_INPUT);
        }
  
        await User.findOneAndUpdate(
          {
            userId: targetUser.id,
            guildId: guildId
          },
          {
            $set: {
              isWhitelisted: true,
              userId: targetUser.id,
              guildId: guildId,
              userGuildId: `${targetUser.id}-${guildId}`
            }
          },
          { upsert: true, new: true }
        );
  
        const addEmbed = createSuccessEmbed(
          '✅ User Whitelisted',
          `${targetUser.tag} has been added to the link whitelist.`,
          [
            {
              name: '👤 User',
              value: `<@${targetUser.id}>`,
              inline: true
            },
            {
              name: '🔧 Added By',
              value: `<@${interaction.user.id}>`,
              inline: true
            }
          ]
        );
  
        await interaction.reply({ embeds: [addEmbed] });
        break;
  
      case 'remove':
        if (!targetUser) {
          throw new BotError('Please specify a user to remove from the whitelist.', ErrorCodes.INVALID_INPUT);
        }
  
        const user = await User.findOne({ userId: targetUser.id, guildId: guildId });
        
        if (!user || !user.isWhitelisted) {
          throw new BotError('This user is not whitelisted.', ErrorCodes.INVALID_INPUT);
        }
  
        await User.findOneAndUpdate(
          { userId: targetUser.id, guildId: guildId },
          { $set: { isWhitelisted: false } }
        );
  
        const removeEmbed = createSuccessEmbed(
          '❌ User Removed from Whitelist',
          `${targetUser.tag} has been removed from the link whitelist.`,
          [
            {
              name: '👤 User',
              value: `<@${targetUser.id}>`,
              inline: true
            },
            {
              name: '🔧 Removed By',
              value: `<@${interaction.user.id}>`,
              inline: true
            }
          ]
        );
  
        await interaction.reply({ embeds: [removeEmbed] });
        break;
  
      case 'list':
        const whitelistedUsers = await User.find({
          guildId: guildId,
          isWhitelisted: true
        });
  
        const listEmbed = createInfoEmbed(
          '📋 Whitelisted Users',
          whitelistedUsers.length > 0
            ? 'The following users are allowed to post links:'
            : 'No users are currently whitelisted.',
          whitelistedUsers.length > 0 ? [
            {
              name: '👥 Users',
              value: whitelistedUsers.map(u => `<@${u.userId}>`).join('\n'),
              inline: false
            }
          ] : []
        );
  
        await interaction.reply({ embeds: [listEmbed] });
        break;
    }
  }
}

/**
 * Handle anti-spam configuration
 */
async function handleAntiSpam(interaction, guildId) {
  const enabled = interaction.options.getBoolean('enabled');
  const maxMessages = interaction.options.getInteger('max_messages') || 5;
  const timeWindow = interaction.options.getInteger('time_window') || 10;

  const { BotConfig } = require('../database/models');

  await BotConfig.findOneAndUpdate(
    { guildId },
    {
      $set: {
        'security.antiSpam.enabled': enabled,
        'security.antiSpam.maxMessages': maxMessages,
        'security.antiSpam.timeWindow': timeWindow,
        'security.antiSpam.updatedAt': new Date()
      }
    },
    { upsert: true, new: true }
  );

  const embed = createSuccessEmbed(
    '🛡️ Anti-Spam Configuration Updated',
    `Anti-spam protection has been ${enabled ? 'enabled' : 'disabled'}!`,
    enabled ? [
      {
        name: '⚙️ Settings',
        value: `• Max messages: ${maxMessages}\n• Time window: ${timeWindow} seconds`,
        inline: false
      },
      {
        name: '🎯 Actions',
        value: '• Delete spam messages\n• Timeout repeat offenders\n• Log violations',
        inline: false
      }
    ] : []
  );

  await interaction.reply({ embeds: [embed] });
}

/**
 * Handle anti-raid configuration
 */
async function handleAntiRaid(interaction, guildId) {
  const enabled = interaction.options.getBoolean('enabled');
  const joinThreshold = interaction.options.getInteger('join_threshold') || 10;
  const action = interaction.options.getString('action') || 'kick';

  const { BotConfig } = require('../database/models');

  await BotConfig.findOneAndUpdate(
    { guildId },
    {
      $set: {
        'security.antiRaid.enabled': enabled,
        'security.antiRaid.joinThreshold': joinThreshold,
        'security.antiRaid.action': action,
        'security.antiRaid.updatedAt': new Date()
      }
    },
    { upsert: true, new: true }
  );

  const actionDescriptions = {
    kick: 'Kick new members',
    ban: 'Ban new members',
    lockdown: 'Enable server lockdown'
  };

  const embed = createSuccessEmbed(
    '🛡️ Anti-Raid Configuration Updated',
    `Anti-raid protection has been ${enabled ? 'enabled' : 'disabled'}!`,
    enabled ? [
      {
        name: '⚙️ Settings',
        value: `• Join threshold: ${joinThreshold} per minute\n• Action: ${actionDescriptions[action]}`,
        inline: false
      },
      {
        name: '🎯 Protection',
        value: '• Monitor join rates\n• Detect suspicious patterns\n• Automatic response to raids',
        inline: false
      }
    ] : []
  );

  await interaction.reply({ embeds: [embed] });
}

/**
 * Handle link filter configuration
 */
async function handleLinkFilter(interaction, guildId) {
  const enabled = interaction.options.getBoolean('enabled');
  const action = interaction.options.getString('action') || 'delete';

  const { BotConfig } = require('../database/models');

  await BotConfig.findOneAndUpdate(
    { guildId },
    {
      $set: {
        'security.linkFilter.enabled': enabled,
        'security.linkFilter.action': action,
        'security.linkFilter.updatedAt': new Date()
      }
    },
    { upsert: true, new: true }
  );

  const actionDescriptions = {
    delete: 'Delete message',
    warn: 'Delete and warn user',
    timeout: 'Delete and timeout user'
  };

  const embed = createSuccessEmbed(
    '🔗 Link Filter Configuration Updated',
    `Link filtering has been ${enabled ? 'enabled' : 'disabled'}!`,
    enabled ? [
      {
        name: '⚙️ Settings',
        value: `• Action: ${actionDescriptions[action]}`,
        inline: false
      },
      {
        name: '🎯 Protection',
        value: '• Block suspicious links\n• Prevent phishing attempts\n• Filter malicious domains',
        inline: false
      }
    ] : []
  );

  await interaction.reply({ embeds: [embed] });
}

/**
 * Handle impersonation protection configuration
 */
async function handleImpersonation(interaction, guildId) {
  const enabled = interaction.options.getBoolean('enabled');
  const similarityThreshold = interaction.options.getInteger('similarity_threshold') || 80;

  const { BotConfig } = require('../database/models');

  await BotConfig.findOneAndUpdate(
    { guildId },
    {
      $set: {
        'security.impersonationProtection.enabled': enabled,
        'security.impersonationProtection.similarityThreshold': similarityThreshold,
        'security.impersonationProtection.updatedAt': new Date()
      }
    },
    { upsert: true, new: true }
  );

  const embed = createSuccessEmbed(
    '👤 Impersonation Protection Updated',
    `Username impersonation protection has been ${enabled ? 'enabled' : 'disabled'}!`,
    enabled ? [
      {
        name: '⚙️ Settings',
        value: `• Similarity threshold: ${similarityThreshold}%`,
        inline: false
      },
      {
        name: '🎯 Protection',
        value: '• Detect similar usernames\n• Prevent impersonation attempts\n• Alert staff to suspicious names',
        inline: false
      }
    ] : []
  );

  await interaction.reply({ embeds: [embed] });
}

/**
 * Handle security status display
 */
async function handleStatus(interaction, guildId) {
  const config = await getGuildConfig(guildId);
  const isLocked = await isServerLocked(guildId);

  const security = config?.security || {};
  
  const statusEmojis = {
    enabled: '✅',
    disabled: '❌'
  };

  const embed = createInfoEmbed(
    '🛡️ Security Status',
    'Current security configuration for this server:',
    [
      {
        name: '🔒 Server Lockdown',
        value: `${isLocked ? statusEmojis.enabled : statusEmojis.disabled} ${isLocked ? 'Active' : 'Inactive'}`,
        inline: true
      },
      {
        name: '🛡️ Anti-Spam',
        value: `${security.antiSpam?.enabled ? statusEmojis.enabled : statusEmojis.disabled} ${security.antiSpam?.enabled ? 'Enabled' : 'Disabled'}`,
        inline: true
      },
      {
        name: '🛡️ Anti-Raid',
        value: `${security.antiRaid?.enabled ? statusEmojis.enabled : statusEmojis.disabled} ${security.antiRaid?.enabled ? 'Enabled' : 'Disabled'}`,
        inline: true
      },
      {
        name: '🔗 Link Filter',
        value: `${security.linkFilter?.enabled ? statusEmojis.enabled : statusEmojis.disabled} ${security.linkFilter?.enabled ? 'Enabled' : 'Disabled'}`,
        inline: true
      },
      {
        name: '👤 Impersonation Protection',
        value: `${security.impersonationProtection?.enabled ? statusEmojis.enabled : statusEmojis.disabled} ${security.impersonationProtection?.enabled ? 'Enabled' : 'Disabled'}`,
        inline: true
      }
    ]
  );

  // Add detailed settings if any are enabled
  if (security.antiSpam?.enabled) {
    embed.addFields({
      name: '📊 Anti-Spam Settings',
      value: `• Max messages: ${security.antiSpam.maxMessages || 5}\n• Time window: ${security.antiSpam.timeWindow || 10}s`,
      inline: false
    });
  }

  if (security.antiRaid?.enabled) {
    embed.addFields({
      name: '📊 Anti-Raid Settings',
      value: `• Join threshold: ${security.antiRaid.joinThreshold || 10}/min\n• Action: ${security.antiRaid.action || 'kick'}`,
      inline: false
    });
  }

  await interaction.reply({ embeds: [embed] });
}