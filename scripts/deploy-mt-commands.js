/**
 * Deploy Multi-Tenant Slash Commands
 * 
 * This script registers the new multi-tenant slash commands with Discord.
 * 
 * Usage:
 *   npm run deploy:mt
 *   or
 *   node scripts/deploy-mt-commands.js
 */

const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
require("dotenv").config();

// Define all multi-tenant slash commands
const commands = [
  // Setup commands (Admin)
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
            .setDescription('Minimum NFTs required (default: 1)')
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
            .setDescription('Minimum NFTs for this role (default: 1)')
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
        .setDescription('Get link to web dashboard for advanced configuration')
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

  // User commands
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Start NFT verification to get your Discord role')
    .addStringOption(option =>
      option
        .setName('wallet')
        .setDescription('Your Solana wallet address (optional)')
    ),

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

  new SlashCommandBuilder()
    .setName('reverify')
    .setDescription('Re-check your NFT ownership and update roles'),

  // Welcome command
  new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Manage the welcome message system')
    .addSubcommand(subcommand =>
      subcommand
        .setName('setup')
        .setDescription('Set up or update the welcome message')
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('The channel where welcome messages will be sent')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('message')
            .setDescription('The welcome message. Use {user} and {server}.')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('disable')
        .setDescription('Disable the welcome message system')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('test')
        .setDescription('Send a test welcome message')
    ),

  // Verification Config command (loaded from file, but need to register with Discord)
  new SlashCommandBuilder()
    .setName('verification-config')
    .setDescription('Manage verification configuration for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List configured verification rules')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add a verification contract rule')
        .addStringOption(option =>
          option.setName('contract_address').setDescription('NFT contract address').setRequired(true)
        )
        .addIntegerOption(option =>
          option.setName('required_nfts').setDescription('Required NFT count (default 1)').setMinValue(1)
        )
        .addRoleOption(option =>
          option.setName('role').setDescription('Role to assign')
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a verification contract rule')
        .addStringOption(option =>
          option.setName('contract_address').setDescription('Contract address to remove').setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('settings')
        .setDescription('Configure verification settings')
        .addStringOption(option =>
          option.setName('helius_api_key').setDescription('Helius API key')
        )
        .addBooleanOption(option =>
          option.setName('periodic_enabled').setDescription('Enable periodic checks')
        )
        .addIntegerOption(option =>
          option.setName('periodic_interval').setDescription('Check interval in minutes').setMinValue(60).setMaxValue(1440)
        )
    ),
];

// Get Client ID (match existing working script)
let clientId = process.env.DISCORD_CLIENT_ID;

if (!clientId && process.env.DISCORD_BOT_TOKEN) {
  // Extract client ID from bot token (first part before the first dot)
  clientId = process.env.DISCORD_BOT_TOKEN.split(".")[0];
  // Decode base64 to get the actual client ID
  try {
    clientId = Buffer.from(clientId, "base64").toString("ascii");
  } catch (e) {
    console.error("❌ Could not extract client ID from bot token.");
    process.exit(1);
  }
}

if (!clientId) {
  console.error("❌ CLIENT_ID or DISCORD_CLIENT_ID is required in .env");
  process.exit(1);
}

console.log(`📋 Client ID: ${clientId}`);

// Deploy commands (match existing working script exactly)
const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  try {
    console.log(`\n🚀 Deploying ${commands.length} multi-tenant slash commands...\n`);
    console.log("🌍 Deploying globally (may take up to 1 hour to appear)\n");

    // Deploy globally (matches existing working script)
    const data = await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands }
    );

    console.log(`✅ Successfully deployed ${data.length} commands globally!`);

    console.log("\n📋 Commands deployed:");
    console.log("   • /setup collection <address> <name> [required]");
    console.log("   • /setup role <@role> <collection> [min] [max]");
    console.log("   • /setup remove <collection>");
    console.log("   • /setup dashboard");
    console.log("   • /config view");
    console.log("   • /config reset");
    console.log("   • /verify [wallet]");
    console.log("   • /wallet show");
    console.log("   • /wallet unlink");
    console.log("   • /reverify");
    console.log("   • /welcome setup <channel> <message>");
    console.log("   • /welcome disable");
    console.log("   • /welcome test");
    console.log("   • /verification-config list");
    console.log("   • /verification-config add <contract> [required] [role]");
    console.log("   • /verification-config remove <contract>");
    console.log("   • /verification-config settings [helius_api_key] [periodic_enabled] [periodic_interval]");

    console.log("\n✨ Done! Check Discord to see the new commands.");
    console.log("   If they don't appear immediately, try:");
    console.log("   1. Restart Discord client");
    console.log("   2. Type / and wait 30 seconds");
    console.log("   3. Re-invite bot to server\n");

  } catch (error) {
    console.error("❌ Error deploying commands:");
    console.error(error);
    process.exit(1);
  }
})();
