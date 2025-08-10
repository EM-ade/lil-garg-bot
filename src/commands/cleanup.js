const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const CleanupManager = require("../utils/cleanupManager");
const logger = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("cleanup")
    .setDescription("Manage the automated cleanup system")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName("run")
        .setDescription("Run manual cleanup for specific features")
        .addBooleanOption(option =>
          option
            .setName("battles")
            .setDescription("Clean up old battles")
            .setRequired(false)
        )
        .addBooleanOption(option =>
          option
            .setName("tickets")
            .setDescription("Clean up old tickets")
            .setRequired(false)
        )
        .addBooleanOption(option =>
          option
            .setName("verifications")
            .setDescription("Clean up old verifications")
            .setRequired(false)
        )
        .addBooleanOption(option =>
          option
            .setName("pets")
            .setDescription("Clean up inactive pets")
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("stats")
        .setDescription("View cleanup statistics")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("schedule")
        .setDescription("View cleanup schedule information")
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case "run":
          await this.handleRunCleanup(interaction);
          break;
        case "stats":
          await this.handleShowStats(interaction);
          break;
        case "schedule":
          await this.handleShowSchedule(interaction);
          break;
      }
    } catch (error) {
      logger.error(`Error in cleanup command (${subcommand}):`, error);
      await interaction.reply({
        content: "❌ An error occurred while processing your request.",
        ephemeral: true,
      });
    }
  },

  async handleRunCleanup(interaction) {
    const battles = interaction.options.getBoolean("battles") ?? false;
    const tickets = interaction.options.getBoolean("tickets") ?? false;
    const verifications = interaction.options.getBoolean("verifications") ?? false;
    const pets = interaction.options.getBoolean("pets") ?? false;

    // If no options specified, run all
    const runAll = !battles && !tickets && !verifications && !pets;
    
    const options = {
      battles: runAll || battles,
      tickets: runAll || tickets,
      verifications: runAll || verifications,
      pets: runAll || pets
    };

    try {
      await interaction.deferReply({ ephemeral: true });

      // Create cleanup manager instance
      const cleanupManager = new CleanupManager(interaction.client);
      
      // Run manual cleanup
      const results = await cleanupManager.manualCleanup(interaction.guild, options);

      // Create results embed
      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("🧹 Cleanup Results")
        .setDescription("Manual cleanup completed successfully!")
        .addFields(
          { name: "Battles Cleaned", value: results.battles.toString(), inline: true },
          { name: "Tickets Cleaned", value: results.tickets.toString(), inline: true },
          { name: "Verifications Updated", value: results.verifications.toString(), inline: true },
          { name: "Pets Archived", value: results.pets.toString(), inline: true }
        )
        .setFooter({ text: `Cleanup run by ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      logger.info(`Manual cleanup completed in ${interaction.guild.name} by ${interaction.user.tag}`);
    } catch (error) {
      logger.error("Error during manual cleanup:", error);
      await interaction.editReply({
        content: "❌ An error occurred during cleanup. Please check the logs.",
        ephemeral: true
      });
    }
  },

  async handleShowStats(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      // Create cleanup manager instance
      const cleanupManager = new CleanupManager(interaction.client);
      
      // Get cleanup statistics
      const stats = await cleanupManager.getCleanupStats(interaction.guild.id);

      // Create stats embed
      const embed = new EmbedBuilder()
        .setColor("#0099FF")
        .setTitle("📊 Cleanup Statistics")
        .setDescription("Current data statistics for this server")
        .addFields(
          { name: "Total Battles", value: stats.totalBattles.toString(), inline: true },
          { name: "Completed Battles", value: stats.completedBattles.toString(), inline: true },
          { name: "Active Battles", value: (stats.totalBattles - stats.completedBattles).toString(), inline: true },
          { name: "Total Tickets", value: stats.totalTickets.toString(), inline: true },
          { name: "Closed Tickets", value: stats.closedTickets.toString(), inline: true },
          { name: "Open Tickets", value: (stats.totalTickets - stats.closedTickets).toString(), inline: true },
          { name: "Total Pets", value: stats.totalPets.toString(), inline: true },
          { name: "Archived Pets", value: stats.archivedPets.toString(), inline: true },
          { name: "Active Pets", value: (stats.totalPets - stats.archivedPets).toString(), inline: true },
          { name: "Verified Users", value: stats.verifiedUsers.toString(), inline: false }
        )
        .setFooter({ text: `Statistics for ${interaction.guild.name}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error getting cleanup stats:", error);
      await interaction.editReply({
        content: "❌ An error occurred while fetching statistics.",
        ephemeral: true
      });
    }
  },

  async handleShowSchedule(interaction) {
    try {
      const embed = new EmbedBuilder()
        .setColor("#FFA500")
        .setTitle("⏰ Cleanup Schedule")
        .setDescription("Information about the automated cleanup system")
        .addFields(
          { name: "🔄 Frequency", value: "Every hour (automated)", inline: false },
          { name: "⚔️ Battle Cleanup", value: "24+ hours old completed/cancelled battles", inline: false },
          { name: "🎫 Ticket Cleanup", value: "7+ days old closed tickets", inline: false },
          { name: "🔐 Verification Cleanup", value: "30+ days old verifications (marks for reverification)", inline: false },
          { name: "🐲 Pet Cleanup", value: "90+ days inactive pets (archived, not deleted)", inline: false },
          { name: "📝 Logging", value: "All cleanup actions logged to mod-log channel if configured", inline: false }
        )
        .addFields(
          { name: "💡 Manual Cleanup", value: "Use `/cleanup run` to manually trigger cleanup", inline: false },
          { name: "📊 Statistics", value: "Use `/cleanup stats` to view current data statistics", inline: false }
        )
        .setFooter({ text: "Cleanup system helps maintain server performance and data hygiene" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      logger.error("Error showing cleanup schedule:", error);
      await interaction.reply({
        content: "❌ An error occurred while showing schedule information.",
        ephemeral: true
      });
    }
  }
};
