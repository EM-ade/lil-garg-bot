/**
 * Wallet Command - Manage linked wallet
 *
 * Subcommands:
 *   /wallet show
 *   /wallet unlink
 */

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const logger = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("wallet")
    .setDescription("Manage your linked wallet")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("show")
        .setDescription("Show your linked wallet and verification status"),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("unlink").setDescription("Unlink your current wallet"),
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case "show":
          await handleWalletShow(interaction);
          break;
        case "unlink":
          await handleWalletUnlink(interaction);
          break;
        default:
          await interaction.reply({
            content: "Unknown wallet command.",
            flags: 64,
          });
      }
    } catch (error) {
      logger.error("Error in wallet command:", error);
      await interaction.reply({
        content: "❌ An error occurred while processing this command.",
        flags: 64,
      });
    }
  },
};

async function handleWalletShow(interaction) {
  const userId = interaction.user.id;
  const guildId = interaction.guildId;

  // Try to find user's verification record
  const { GuildVerificationConfig, User } = require("../database/models");

  // Find user record
  const user = await User.findOne({
    discord_id: userId,
    guild_id: guildId,
  });

  if (!user || !user.wallet_address) {
    const embed = new EmbedBuilder()
      .setColor(0xfbbc04)
      .setTitle("👛 No Wallet Linked")
      .setDescription(
        "You have not linked a wallet yet.\n\n" +
          "Use `/verify` to start the verification process and link your wallet.",
      );

    return interaction.reply({ embeds: [embed] });
  }

  const embed = new EmbedBuilder()
    .setColor(0x34a853)
    .setTitle("👛 Your Linked Wallet")
    .addFields(
      {
        name: "Wallet Address",
        value: `\`${user.wallet_address}\``,
        inline: false,
      },
      {
        name: "Linked Since",
        value: user.first_joined?.toLocaleString() || "Unknown",
        inline: true,
      },
      {
        name: "Status",
        value: user.is_verified ? "✅ Verified" : "⏳ Pending",
        inline: true,
      },
    );

  if (user.is_verified) {
    embed.addFields({
      name: "Last Verification",
      value: user.last_verification_check?.toLocaleString() || "Unknown",
      inline: true,
    });
  }

  embed
    .setFooter({ text: "Use /wallet unlink to remove this wallet" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleWalletUnlink(interaction) {
  const userId = interaction.user.id;
  const guildId = interaction.guildId;

  const { User } = require("../database/models");

  const user = await User.findOne({
    discord_id: userId,
    guild_id: guildId,
  });

  if (!user || !user.wallet_address) {
    return interaction.reply({
      content: "❌ You do not have a linked wallet to unlink.",
      flags: 64,
    });
  }

  // Unlink wallet
  user.wallet_address = null;
  user.is_verified = false;
  user.last_verification_check = null;
  await user.save();

  const embed = new EmbedBuilder()
    .setColor(0xea4335)
    .setTitle("👛 Wallet Unlinked")
    .setDescription(
      `Successfully unlinked wallet \`${user.wallet_address}\`.\n\n` +
        "⚠️ Note: Your verification roles may be removed if the server requires NFT ownership.",
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
