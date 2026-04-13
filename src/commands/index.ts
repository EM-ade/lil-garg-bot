/**
 * Discord Slash Commands - Multi-Tenant NFT Verification Bot
 * 
 * This module registers all slash commands for the bot.
 * Commands are organized into:
 * - Admin commands: For server administrators to configure the bot
 * - User commands: For regular users to verify and manage their wallets
 * 
 * All commands are guild-scoped for tenant isolation.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { getDatabase, closeDatabase, type Database } from '../db';
import { GuildConfigService } from '../services/GuildConfigService';
import { CollectionService } from '../services/CollectionService';
import { RoleMappingService } from '../services/RoleMappingService';
import { VerificationService } from '../services/VerificationService';
import { WalletService } from '../services/WalletService';
import logger from '../utils/logger';

// ============================================================================
// COMMAND REGISTRATION
// ============================================================================

/**
 * Register all slash commands with Discord
 * Call this once during bot startup
 */
export async function registerCommands(client: any): Promise<void> {
  const commands = [
    // Admin commands
    new SlashCommandBuilder()
      .setName('setup')
      .setDescription('Configure NFT verification for this server')
      .addSubcommand(subcommand =>
        subcommand
          .setName('collection')
          .setDescription('Register an NFT collection for verification')
          .addStringOption(option =>
            option
              .setName('address')
              .setDescription('Solana collection address (mint pubkey)')
              .setRequired(true)
          )
          .addStringOption(option =>
            option
              .setName('name')
              .setDescription('Human-readable name for the collection')
              .setRequired(true)
          )
          .addIntegerOption(option =>
            option
              .setName('required')
              .setDescription('Minimum NFTs required for verification (default: 1)')
              .setMinValue(1)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('role')
          .setDescription('Map a collection to a Discord role')
          .addRoleOption(option =>
            option
              .setName('role')
              .setDescription('Discord role to assign')
              .setRequired(true)
          )
          .addStringOption(option =>
            option
              .setName('collection')
              .setDescription('Collection address or name')
              .setRequired(true)
          )
          .addIntegerOption(option =>
            option
              .setName('min')
              .setDescription('Minimum NFTs required for this role (default: 1)')
              .setMinValue(1)
          )
          .addIntegerOption(option =>
            option
              .setName('max')
              .setDescription('Maximum NFTs for this role (optional)')
              .setMinValue(1)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('remove')
          .setDescription('Remove a collection from verification')
          .addStringOption(option =>
            option
              .setName('collection')
              .setDescription('Collection address or name to remove')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('dashboard')
          .setDescription('Get a link to the web dashboard for advanced configuration')
      ),

    // Config commands
    new SlashCommandBuilder()
      .setName('config')
      .setDescription('View or manage bot configuration')
      .addSubcommand(subcommand =>
        subcommand
          .setName('view')
          .setDescription('Show current server configuration')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('reset')
          .setDescription('Reset all bot configuration (WARNING: irreversible)')
      ),

    // Verification commands
    new SlashCommandBuilder()
      .setName('verify')
      .setDescription('Start NFT verification to get your Discord role')
      .addStringOption(option =>
        option
          .setName('wallet')
          .setDescription('Your Solana wallet address (optional)')
      ),

    // Wallet commands
    new SlashCommandBuilder()
      .setName('wallet')
      .setDescription('Manage your linked wallet')
      .addSubcommand(subcommand =>
        subcommand
          .setName('show')
          .setDescription('Show your linked wallet and verification status')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('unlink')
          .setDescription('Unlink your current wallet')
      ),

    // Reverify command
    new SlashCommandBuilder()
      .setName('reverify')
      .setDescription('Re-check your NFT ownership and update roles'),
  ];

  try {
    // Register commands globally (can take up to 1 hour to propagate)
    // For faster testing during development, use guild-specific registration:
    // await client.application.commands.set(commands, GUILD_ID);
    await client.application.commands.set(commands);
    logger.info(`[Commands] Registered ${commands.length} slash commands globally`);
  } catch (error) {
    logger.error('[Commands] Failed to register commands:', error);
    throw error;
  }
}

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

/**
 * Handle all slash command interactions
 * Call this from your interactionCreate event handler
 */
export async function handleCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const commandName = interaction.commandName;

  try {
    switch (commandName) {
      // Admin commands
      case 'setup':
        await handleSetupCommand(interaction);
        break;

      // Config commands
      case 'config':
        await handleConfigCommand(interaction);
        break;

      // User commands
      case 'verify':
        await handleVerifyCommand(interaction);
        break;

      case 'wallet':
        await handleWalletCommand(interaction);
        break;

      case 'reverify':
        await handleReverifyCommand(interaction);
        break;

      default:
        logger.warn(`[Commands] Unknown command: ${commandName}`);
    }
  } catch (error) {
    logger.error(`[Commands] Error handling ${commandName}:`, error);
    
    const errorMessage = 'An error occurred while processing this command.';
    
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: errorMessage, ephemeral: true });
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if user has admin permissions for this bot
 */
async function hasAdminPermissions(
  interaction: ChatInputCommandInteraction,
  db: Database
): Promise<boolean> {
  const guildConfigService = new GuildConfigService(db);
  
  const member = interaction.member;
  if (!member) return false;

  // Check if user is the guild owner
  if (interaction.guild?.ownerId === member.user.id) {
    return true;
  }

  // Check if user has Administrator permission
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return true;
  }

  // Check guild's admin role configuration
  const guild = await guildConfigService.getGuildByDiscordId(interaction.guildId!);
  
  if (!guild) {
    return false;
  }

  const memberRoles = (member as any).roles.cache.map((r: any) => r.id);
  const adminRoleIds = guild.adminRoleIds || [];
  
  return memberRoles.some((roleId: string) => adminRoleIds.includes(roleId));
}

/**
 * Get or create guild record
 */
async function getOrCreateGuild(
  db: Database,
  interaction: ChatInputCommandInteraction
): Promise<any> {
  const guildConfigService = new GuildConfigService(db);
  
  return guildConfigService.getOrCreateGuild({
    guildId: interaction.guildId!,
    guildName: interaction.guild?.name || 'Unknown Server',
    ownerDiscordId: interaction.guild?.ownerId,
  });
}

// ============================================================================
// SETUP COMMAND HANDLERS
// ============================================================================

async function handleSetupCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const db = await getDatabase();
  const isAdmin = await hasAdminPermissions(interaction, db);

  if (!isAdmin) {
    await interaction.editReply({
      content: '❌ You do not have permission to use this command. Only server admins can configure the bot.',
    });
    await closeDatabase();
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const guild = await getOrCreateGuild(db, interaction);

  try {
    switch (subcommand) {
      case 'collection':
        await handleSetupCollection(db, interaction, guild.id);
        break;

      case 'role':
        await handleSetupRole(db, interaction, guild.id);
        break;

      case 'remove':
        await handleRemoveCollection(db, interaction, guild.id);
        break;

      case 'dashboard':
        await handleDashboardLink(interaction);
        break;
    }
  } finally {
    await closeDatabase();
  }
}

async function handleSetupCollection(
  db: Database,
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const collectionService = new CollectionService(db);

  const address = interaction.options.getString('address', true);
  const name = interaction.options.getString('name', true);
  const required = interaction.options.getInteger('required') || 1;

  try {
    const collection = await collectionService.addCollection(guildId, {
      collectionAddress: address,
      collectionName: name,
      requiredNftCount: required,
    });

    const embed = new EmbedBuilder()
      .setColor(0x34A853)  // Green
      .setTitle('✅ Collection Added')
      .setDescription(`Successfully registered NFT collection for verification.`)
      .addFields(
        { name: 'Collection Name', value: name, inline: true },
        { name: 'Collection Address', value: `\`${address}\``, inline: true },
        { name: 'Required NFTs', value: required.toString(), inline: true }
      )
      .setFooter({ text: 'Next: Use /setup role to map this collection to a Discord role' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error: any) {
    await interaction.editReply({
      content: `❌ Error: ${error.message}`,
    });
  }
}

async function handleSetupRole(
  db: Database,
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const roleMappingService = new RoleMappingService(db);
  const collectionService = new CollectionService(db);

  const role = interaction.options.getRole('role', true);
  const collectionInput = interaction.options.getString('collection', true);
  const minNftCount = interaction.options.getInteger('min') || 1;
  const maxNftCount = interaction.options.getInteger('max') || undefined;

  // Find collection by address or name
  const collections = await collectionService.getCollectionsByGuild(guildId);
  const collection = collections.find(
    c => c.collectionAddress === collectionInput || 
         c.collectionName.toLowerCase() === collectionInput.toLowerCase()
  );

  if (!collection) {
    await interaction.editReply({
      content: `❌ Collection not found: ${collectionInput}\nPlease use /setup collection first to register the collection.`,
    });
    return;
  }

  try {
    await roleMappingService.createRoleMapping(guildId, {
      collectionId: collection.id,
      roleId: role.id,
      roleName: role.name,
      minNftCount,
      maxNftCount,
    });

    const embed = new EmbedBuilder()
      .setColor(0x34A853)
      .setTitle('✅ Role Mapping Created')
      .setDescription(`Successfully mapped Discord role to NFT collection.`)
      .addFields(
        { name: 'Discord Role', value: `<@&${role.id}>`, inline: true },
        { name: 'Collection', value: collection.collectionName, inline: true },
        { name: 'NFT Requirement', value: `${minNftCount}${maxNftCount ? `-${maxNftCount}` : '+'}`, inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error: any) {
    await interaction.editReply({
      content: `❌ Error: ${error.message}`,
    });
  }
}

async function handleRemoveCollection(
  db: Database,
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const collectionService = new CollectionService(db);

  const collectionInput = interaction.options.getString('collection', true);

  // Find collection
  const collections = await collectionService.getCollectionsByGuild(guildId);
  const collection = collections.find(
    c => c.collectionAddress === collectionInput || 
         c.collectionName.toLowerCase() === collectionInput.toLowerCase()
  );

  if (!collection) {
    await interaction.editReply({
      content: `❌ Collection not found: ${collectionInput}`,
    });
    return;
  }

  try {
    await collectionService.removeCollection(collection.id);

    const embed = new EmbedBuilder()
      .setColor(0xEA4335)  // Red
      .setTitle('🗑️ Collection Removed')
      .setDescription(`Successfully removed collection from verification.`)
      .addFields(
        { name: 'Collection', value: collection.collectionName, inline: true },
        { name: 'Address', value: `\`${collection.collectionAddress}\``, inline: true }
      )
      .setFooter({ text: 'Note: Existing verified users will keep their roles until re-verification.' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error: any) {
    await interaction.editReply({
      content: `❌ Error: ${error.message}`,
    });
  }
}

async function handleDashboardLink(interaction: ChatInputCommandInteraction): Promise<void> {
  const frontendUrl = process.env.FRONTEND_URL || 'https://discord.lilgarg.xyz';
  
  const embed = new EmbedBuilder()
    .setColor(0x4285F4)  // Blue
    .setTitle('🌐 Web Dashboard')
    .setDescription(
      'Access the web dashboard for advanced configuration options:\n\n' +
      '- Manage multiple collections\n' +
      '- Configure tiered roles (Bronze, Silver, Gold)\n' +
      '- View verification statistics\n' +
      '- Manage verified users'
    )
    .addFields({
      name: 'Dashboard Link',
      value: `[Click here to open dashboard](${frontendUrl}/dashboard?guild=${interaction.guildId})`,
    })
    .setFooter({ text: 'You must be logged in with Discord to access the dashboard' })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ============================================================================
// CONFIG COMMAND HANDLERS
// ============================================================================

async function handleConfigCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const db = await getDatabase();
  const isAdmin = await hasAdminPermissions(interaction, db);

  if (!isAdmin) {
    await interaction.editReply({
      content: '❌ You do not have permission to use this command.',
    });
    await closeDatabase();
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const guild = await getOrCreateGuild(db, interaction);

  try {
    if (subcommand === 'view') {
      await handleConfigView(db, interaction, guild.id);
    } else if (subcommand === 'reset') {
      await handleConfigReset(db, interaction, guild.id);
    }
  } finally {
    await closeDatabase();
  }
}

async function handleConfigView(
  db: Database,
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  const guildConfigService = new GuildConfigService(db);
  const collectionService = new CollectionService(db);
  const roleMappingService = new RoleMappingService(db);

  const guild = await guildConfigService.getGuildById(guildId);
  const collections = await collectionService.getCollectionsByGuild(guildId);
  const roleMappings = await roleMappingService.getRoleMappingsByGuild(guildId);

  if (!guild) {
    await interaction.editReply({
      content: '❌ Guild configuration not found.',
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x4285F4)
    .setTitle(`⚙️ Server Configuration - ${guild.guildName}`)
    .setDescription('Current NFT verification configuration')
    .addFields(
      { name: 'Collections', value: collections.length.toString(), inline: true },
      { name: 'Role Mappings', value: roleMappings.length.toString(), inline: true },
      { name: 'Status', value: guild.isActive ? '✅ Active' : '❌ Inactive', inline: true }
    );

  if (collections.length > 0) {
    embed.addFields({
      name: 'Registered Collections',
      value: collections.slice(0, 5).map(c => 
        `• **${c.collectionName}** - ${c.requiredNftCount} NFT(s) required`
      ).join('\n') || 'None',
      inline: false
    });
  }

  if (roleMappings.length > 0) {
    embed.addFields({
      name: 'Role Mappings',
      value: roleMappings.slice(0, 5).map(r => 
        `• <@&${r.roleId}> - Min: ${r.minNftCount}${r.maxNftCount ? `, Max: ${r.maxNftCount}` : ''}`
      ).join('\n') || 'None',
      inline: false
    });
  }

  embed.setFooter({ text: `Guild ID: ${guild.guildId}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleConfigReset(
  db: Database,
  interaction: ChatInputCommandInteraction,
  guildId: string
): Promise<void> {
  // This would implement a full configuration reset
  // For safety, we'll just show a warning
  const embed = new EmbedBuilder()
    .setColor(0xEA4335)
    .setTitle('⚠️ Configuration Reset Warning')
    .setDescription(
      'Are you sure you want to reset all configuration?\n\n' +
      'This will:\n' +
      '• Remove all registered collections\n' +
      '• Remove all role mappings\n' +
      '• Reset all settings to defaults\n\n' +
      '**This action cannot be undone.**'
    )
    .setFooter({ text: 'Contact the bot developer to perform a full reset' });

  await interaction.editReply({ embeds: [embed] });
}

export { handleVerifyCommand, handleWalletCommand, handleReverifyCommand } from './userCommands';
