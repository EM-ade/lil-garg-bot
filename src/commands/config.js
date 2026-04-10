/**
 * Config Command - View/manage bot configuration
 *
 * Subcommands:
 *   /config view
 *   /config reset
 */

const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const { BotConfig } = require("../database/models");
const { getGuildVerificationConfigStore } = require("../services/serviceFactory");
const logger = require("../utils/logger");

const guildVerificationConfigStore = getGuildVerificationConfigStore();

module.exports = {
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("View or manage bot configuration")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("view")
        .setDescription("Show current server configuration"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reset")
        .setDescription("Reset all bot configuration (WARNING: irreversible)"),
    ),

  async execute(interaction) {
    // Check admin permissions
    if (
      !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      return interaction.reply({
        content: "❌ You need Administrator permissions to use this command.",
        flags: 64,
      });
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case "view":
          await handleConfigView(interaction);
          break;
        case "reset":
          await handleConfigReset(interaction);
          break;
        default:
          await interaction.reply({
            content: "Unknown config command.",
            flags: 64,
          });
      }
    } catch (error) {
      logger.error("Error in config command:", error);
      await interaction.reply({
        content: "❌ An error occurred while processing this command.",
        flags: 64,
      });
    }
  },
};

async function handleConfigView(interaction) {
  const guildId = interaction.guildId;

  const rules = guildVerificationConfigStore
    ? await guildVerificationConfigStore.listByGuild(guildId)
    : [];

  const embed = new EmbedBuilder()
    .setColor(0x4285f4)
    .setTitle(`⚙️ Server Configuration - ${interaction.guild.name}`)
    .setDescription("Current NFT verification configuration")
    .addFields(
      { name: "Verification Rules", value: rules.length.toString(), inline: true },
      { name: "Status", value: "✅ Active", inline: true },
    );

  if (rules.length > 0) {
    const ruleList = rules
      .map((r) => {
        const roleValue = r.roleId
          ? `<@&${r.roleId}>`
          : r.roleName || "Not set";
        return `• **${r.contractAddress}** — ${r.requiredNftCount || 1} NFT(s) → ${roleValue}`;
      })
      .join("\n");

    embed.addFields({
      name: "Verification Rules",
      value: ruleList,
      inline: false,
    });
  } else {
    embed.addFields({
      name: "No Rules Configured",
      value: "Use `/verification-config add` to set up your first NFT verification rule.",
      inline: false,
    });
  }

  embed.setFooter({ text: `Guild ID: ${guildId}` }).setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleConfigReset(interaction) {
  if (!guildVerificationConfigStore) {
    return interaction.reply({
      content: "❌ Verification config store is not available.",
      flags: 64,
    });
  }

  // Note: Supabase repository doesn't have a bulk delete by guild method.
  // We delete rules individually by first listing them.
  const rules = await guildVerificationConfigStore.listByGuild(interaction.guildId);

  for (const rule of rules) {
    await guildVerificationConfigStore.deleteRule({
      guildId: interaction.guildId,
      contractAddress: rule.contractAddress,
      requiredNftCount: rule.requiredNftCount,
    });
  }

  const embed = new EmbedBuilder()
    .setColor(0xea4335)
    .setTitle("⚠️ Configuration Reset")
    .setDescription(
      `All ${rules.length} verification rule(s) have been removed.\n\nUse \`/verification-config add\` to set up new rules.`,
    )
    .setFooter({ text: "This action cannot be undone" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
