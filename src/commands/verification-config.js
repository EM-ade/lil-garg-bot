const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js')
const {
  isSupabaseEnabled,
  getGuildVerificationConfigStore,
} = require('../services/serviceFactory')
const logger = require('../utils/logger')

const guildVerificationConfigStore = getGuildVerificationConfigStore()

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verification-config')
    .setDescription('Manage contract verification rules for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('List configured verification contract rules'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add')
        .setDescription('Add or update a verification contract rule')
        .addStringOption((option) =>
          option
            .setName('contract_address')
            .setDescription('NFT contract address to verify against')
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName('required_nfts')
            .setDescription('Minimum NFTs required for the role (default 1)')
            .setMinValue(1),
        )
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('Discord role to assign when the threshold is met'),
        )
        .addStringOption((option) =>
          option
            .setName('role_name')
            .setDescription('Fallback role name if the role option is unavailable'),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Remove a verification contract rule')
        .addStringOption((option) =>
          option
            .setName('contract_address')
            .setDescription('NFT contract address to remove')
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName('required_nfts')
            .setDescription('If provided, only remove the rule matching this NFT threshold')
            .setMinValue(1),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('settings')
        .setDescription('Configure per-server verification settings')
        .addStringOption((option) =>
          option
            .setName('helius_api_key')
            .setDescription('Helius API key for this server (leave empty to use global key)')
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName('periodic_enabled')
            .setDescription('Enable/disable periodic NFT checks for this server')
            .setRequired(false),
        )
        .addIntegerOption((option) =>
          option
            .setName('periodic_interval')
            .setDescription('Minutes between periodic checks (60-1440)')
            .setMinValue(60)
            .setMaxValue(1440)
            .setRequired(false),
        ),
    ),

  async execute(interaction) {
    if (!isSupabaseEnabled() || !guildVerificationConfigStore) {
      return interaction.reply({
        content:
          '❌ Supabase-backed verification must be enabled to manage contract rules.',
        flags: 64,
      })
    }

    const subcommand = interaction.options.getSubcommand()

    switch (subcommand) {
      case 'list':
        return handleList(interaction)
      case 'add':
        return handleAdd(interaction)
      case 'remove':
        return handleRemove(interaction)
      case 'settings':
        return handleSettings(interaction)
      default:
        return interaction.reply({
          content: '❌ Unknown subcommand.',
          flags: 64,
        })
    }
  },
}

async function handleList(interaction) {
  try {
    const rules = await guildVerificationConfigStore.listByGuild(interaction.guild.id)

    if (!rules || rules.length === 0) {
      return interaction.reply({
        content:
          'ℹ️ No verification contract rules configured yet. Use `/verification-config add` to create one.',
        flags: 64,
      })
    }

    const lines = rules.map((rule, index) => {
      const roleText = rule.roleId
        ? `<@&${rule.roleId}>`
        : rule.roleName || '—'
      return `${index + 1}. **${rule.contractAddress}** → require **${rule.requiredNftCount}** NFT(s) → role ${roleText}`
    })

    return interaction.reply({
      content: ['📋 **Verification Contract Rules**', ...lines].join('\n'),
      flags: 64,
    })
  } catch (error) {
    logger.error('Failed to list verification contract rules:', error)
    return interaction.reply({
      content: '❌ Failed to fetch rules. Please try again later.',
      flags: 64,
    })
  }
}

async function handleAdd(interaction) {
  const contractAddressRaw = interaction.options.getString('contract_address', true)
  const contractAddress = contractAddressRaw.trim()
  const requiredNfts = interaction.options.getInteger('required_nfts') || 1
  const roleOption = interaction.options.getRole('role')
  const roleNameOption = interaction.options.getString('role_name')

  if (!contractAddress) {
    return interaction.reply({
      content: '❌ Contract address cannot be empty.',
      flags: 64,
    })
  }

  const payload = {
    guildId: interaction.guild.id,
    contractAddress,
    requiredNftCount: requiredNfts,
    roleId: roleOption?.id || null,
    roleName: roleOption?.name || roleNameOption || null,
  }

  try {
    await guildVerificationConfigStore.upsertRule(payload)

    return interaction.reply({
      content:
        `✅ Saved verification rule for **${contractAddress}**\n• Required NFTs: **${requiredNfts}**\n• Role: **${payload.roleId ? `<@&${payload.roleId}>` : payload.roleName || '—'}**`,
      flags: 64,
    })
  } catch (error) {
    logger.error('Failed to upsert verification contract rule:', error)
    return interaction.reply({
      content: '❌ Failed to save the rule. Please try again later.',
      flags: 64,
    })
  }
}

async function handleRemove(interaction) {
  const contractAddressRaw = interaction.options.getString('contract_address', true)
  const contractAddress = contractAddressRaw.trim()
  const requiredNfts = interaction.options.getInteger('required_nfts')

  if (!contractAddress) {
    return interaction.reply({
      content: '❌ Contract address cannot be empty.',
      flags: 64,
    })
  }

  try {
    await guildVerificationConfigStore.deleteRule({
      guildId: interaction.guild.id,
      contractAddress,
      requiredNftCount: requiredNfts ?? null,
    })

    return interaction.reply({
      content: requiredNfts
        ? `🗑️ Removed verification rule for **${contractAddress}** at **${requiredNfts}** NFT(s)`
        : `🗑️ Removed verification rule(s) for **${contractAddress}**`,
      flags: 64,
    })
  } catch (error) {
    logger.error('Failed to delete verification contract rule:', error)
    return interaction.reply({
      content: '❌ Failed to delete the rule. Please try again later.',
      flags: 64,
    })
  }
}

async function handleSettings(interaction) {
  const heliusApiKey = interaction.options.getString('helius_api_key')
  const periodicEnabled = interaction.options.getBoolean('periodic_enabled')
  const periodicInterval = interaction.options.getInteger('periodic_interval')

  const guildId = interaction.guild.id

  // If nothing is being set, show current settings
  if (heliusApiKey === null && periodicEnabled === null && periodicInterval === null) {
    return handleShowSettings(interaction)
  }

  const updatePayload = {}

  // Handle Helius API key
  if (heliusApiKey !== null) {
    if (heliusApiKey.trim() === '') {
      updatePayload.heliusApiKey = null // Clear to use global key
    } else {
      // Basic validation: Helius keys are typically alphanumeric
      updatePayload.heliusApiKey = heliusApiKey.trim()
    }
  }

  // Handle periodic check toggle
  if (periodicEnabled !== null) {
    updatePayload.periodicCheckEnabled = periodicEnabled
  }

  // Handle periodic interval
  if (periodicInterval !== null) {
    updatePayload.periodicCheckIntervalMinutes = periodicInterval
  }

  try {
    await guildVerificationConfigStore.updateGuildSettings({
      guildId,
      ...updatePayload,
    })

    let responseLines = ['✅ Settings updated:']

    if (updatePayload.heliusApiKey !== undefined) {
      responseLines.push(
        `• Helius API Key: ${updatePayload.heliusApiKey ? 'Set (custom key)' : 'Cleared (using global key)'}`
      )
    }
    if (updatePayload.periodicCheckEnabled !== undefined) {
      responseLines.push(`• Periodic Checks: ${updatePayload.periodicCheckEnabled ? '✅ Enabled' : '❌ Disabled'}`)
    }
    if (updatePayload.periodicCheckIntervalMinutes !== undefined) {
      const hours = (updatePayload.periodicCheckIntervalMinutes / 60).toFixed(1)
      responseLines.push(`• Periodic Interval: ${hours} hours (${updatePayload.periodicCheckIntervalMinutes} minutes)`)
    }

    return interaction.reply({
      content: responseLines.join('\n'),
      flags: 64,
    })
  } catch (error) {
    logger.error('Failed to update guild verification settings:', error)
    return interaction.reply({
      content: '❌ Failed to update settings. Please try again later.',
      flags: 64,
    })
  }
}

async function handleShowSettings(interaction) {
  const guildId = interaction.guild.id

  try {
    const settings = await guildVerificationConfigStore.getGuildSettings(guildId)

    const heliusKeyStatus = settings.heliusApiKey
      ? `✅ Custom key set (\`${settings.heliusApiKey.substring(0, 8)}...\`)`
      : '⚪ Using global Helius key'

    const intervalHours = (settings.periodicCheckIntervalMinutes / 60).toFixed(1)

    return interaction.reply({
      content: [
        '⚙️ **Server Verification Settings**',
        `• Helius API Key: ${heliusKeyStatus}`,
        `• Periodic Checks: ${settings.periodicCheckEnabled ? '✅ Enabled' : '❌ Disabled'}`,
        `• Periodic Interval: ${intervalHours} hours (${settings.periodicCheckIntervalMinutes} minutes)`,
      ].join('\n'),
      flags: 64,
    })
  } catch (error) {
    logger.error('Failed to fetch guild settings:', error)
    return interaction.reply({
      content: '❌ Failed to fetch settings. Please try again later.',
      flags: 64,
    })
  }
}
