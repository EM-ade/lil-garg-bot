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
    ),

  async execute(interaction) {
    if (!isSupabaseEnabled() || !guildVerificationConfigStore) {
      return interaction.reply({
        content:
          '❌ Supabase-backed verification must be enabled to manage contract rules.',
        ephemeral: true,
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
      default:
        return interaction.reply({
          content: '❌ Unknown subcommand.',
          ephemeral: true,
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
        ephemeral: true,
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
      ephemeral: true,
    })
  } catch (error) {
    logger.error('Failed to list verification contract rules:', error)
    return interaction.reply({
      content: '❌ Failed to fetch rules. Please try again later.',
      ephemeral: true,
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
      ephemeral: true,
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
      ephemeral: true,
    })
  } catch (error) {
    logger.error('Failed to upsert verification contract rule:', error)
    return interaction.reply({
      content: '❌ Failed to save the rule. Please try again later.',
      ephemeral: true,
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
      ephemeral: true,
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
      ephemeral: true,
    })
  } catch (error) {
    logger.error('Failed to delete verification contract rule:', error)
    return interaction.reply({
      content: '❌ Failed to delete the rule. Please try again later.',
      ephemeral: true,
    })
  }
}
