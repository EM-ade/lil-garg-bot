const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createInfoEmbed, createErrorEmbed, createSuccessEmbed } = require('../utils/embedBuilder');
const { BotError, ErrorCodes } = require('../utils/errorHandler');
const { getGuildConfig } = require('../utils/dbUtils');
const SecurityManager = require('../utils/securityManager'); // Assuming lockdown functions might move here
const logger = require('../utils/logger');
const { User, BotConfig } = require('../database/models');

// Helper function to get a singleton instance of SecurityManager
let securityManagerInstance = null;
function getSecurityManager(client) {
  if (!securityManagerInstance) {
    securityManagerInstance = new SecurityManager(client);
  }
  return securityManagerInstance;
}

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
        // ... other antispam options
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
        // ... other antiraid options
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
        .setName('status')
        .setDescription('View current security settings')
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
        case 'status':
          await handleStatus(interaction, guildId);
          break;
        default:
          throw new BotError('Unknown subcommand', ErrorCodes.COMMAND_ERROR);
      }
    } catch (error) {
      logger.error('Error in security command:', error);
      const embed = createErrorEmbed(
        'Command Error',
        'An unexpected error occurred. Please try again later.',
        null,
        'GEN_001'
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
    const securityManager = getSecurityManager(interaction.client);
    const action = interaction.options.getString('action');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (action === 'enable') {
        await securityManager.lockdown(interaction.guild, reason);
        const embed = createSuccessEmbed('🔒 Server Lockdown Enabled', `The server has been locked down. Reason: ${reason}`);
        await interaction.reply({ embeds: [embed] });
    } else if (action === 'disable') {
        await securityManager.unlock(interaction.guild);
        const embed = createSuccessEmbed('🔓 Server Lockdown Disabled', 'The server lockdown has been lifted.');
        await interaction.reply({ embeds: [embed] });
    }
}

/**
 * Handle anti-spam configuration
 */
async function handleAntiSpam(interaction, guildId) {
  const enabled = interaction.options.getBoolean('enabled');
  await BotConfig.findOneAndUpdate(
    { guildId },
    { $set: { 'security.antiSpam.enabled': enabled } },
    { upsert: true }
  );
  const embed = createSuccessEmbed('🛡️ Anti-Spam Settings Updated', `Anti-spam protection has been ${enabled ? 'enabled' : 'disabled'}.`);
  await interaction.reply({ embeds: [embed] });
}

/**
 * Handle anti-raid configuration
 */
async function handleAntiRaid(interaction, guildId) {
  const enabled = interaction.options.getBoolean('enabled');
  await BotConfig.findOneAndUpdate(
    { guildId },
    { $set: { 'security.antiRaid.enabled': enabled } },
    { upsert: true }
  );
  const embed = createSuccessEmbed('🛡️ Anti-Raid Settings Updated', `Anti-raid protection has been ${enabled ? 'enabled' : 'disabled'}.`);
  await interaction.reply({ embeds: [embed] });
}

/**
 * Handle link filter configuration
 */
async function handleLinkFilter(interaction, guildId) {
  const enabled = interaction.options.getBoolean('enabled');
  const action = interaction.options.getString('action') || 'delete';
  await BotConfig.findOneAndUpdate(
    { guildId },
    { $set: { 'security.linkFilter.enabled': enabled, 'security.linkFilter.action': action } },
    { upsert: true }
  );
  const embed = createSuccessEmbed('🔗 Link Filter Settings Updated', `Link filtering has been ${enabled ? 'enabled' : 'disabled'}.`);
  await interaction.reply({ embeds: [embed] });
}

/**
 * Handle security status display
 */
async function handleStatus(interaction, guildId) {
  const config = await getGuildConfig(guildId);
  const security = config?.security || {};
  
  const statusEmojis = { enabled: '✅', disabled: '❌' };

  const description = [
    `**Anti-Spam:** ${security.antiSpam?.enabled ? statusEmojis.enabled : statusEmojis.disabled}`,
    `**Anti-Raid:** ${security.antiRaid?.enabled ? statusEmojis.enabled : statusEmojis.disabled}`,
    `**Link Filter:** ${security.linkFilter?.enabled ? statusEmojis.enabled : statusEmojis.disabled}`,
  ].join('\n');

  const embed = createInfoEmbed('🛡️ Security Status', description);
  await interaction.reply({ embeds: [embed] });
}
