const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const NFTMonitoringService = require("../services/nftMonitoringService");
const logger = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("nft-monitor")
    .setDescription("Manage NFT monitoring and auto-role updates")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName("start")
        .setDescription("Start the NFT monitoring service")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("stop")
        .setDescription("Stop the NFT monitoring service")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("status")
        .setDescription("Check the status of NFT monitoring")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("check-user")
        .setDescription("Manually check a specific user's NFT status")
        .addUserOption(option =>
          option
            .setName("user")
            .setDescription("User to check")
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("run-check")
        .setDescription("Manually run a full NFT check for all users")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("configure")
        .setDescription("Configure NFT monitoring settings")
        .addBooleanOption(option =>
          option
            .setName("enabled")
            .setDescription("Enable/disable NFT monitoring")
            .setRequired(false)
        )
        .addNumberOption(option =>
          option
            .setName("interval")
            .setDescription("Monitoring interval in hours (default: 6)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(168) // 1 week max
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    try {
      // Check if user has permission
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return await interaction.reply({
          content: "❌ You need Administrator permissions to use this command.",
          flags: 64,
        });
      }

      switch (subcommand) {
        case "start":
          await this.handleStart(interaction, guildId);
          break;
        case "stop":
          await this.handleStop(interaction, guildId);
          break;
        case "status":
          await this.handleStatus(interaction, guildId);
          break;
        case "check-user":
          await this.handleCheckUser(interaction, guildId);
          break;
        case "run-check":
          await this.handleRunCheck(interaction, guildId);
          break;
        case "configure":
          await this.handleConfigure(interaction, guildId);
          break;
      }
    } catch (error) {
      logger.error(`Error in nft-monitor command (${subcommand}):`, error);
      await interaction.reply({
        content: "❌ An error occurred while processing your request.",
        flags: 64,
      });
    }
  },

  async handleStart(interaction, guildId) {
    try {
      // Get the monitoring service from the client
      const monitoringService = interaction.client.nftMonitoringService;
      
      if (!monitoringService) {
        return await interaction.reply({
          content: "❌ NFT monitoring service is not available. Please contact a bot administrator.",
          flags: 64,
        });
      }

      await monitoringService.startMonitoring();

      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("🟢 NFT Monitoring Started")
        .setDescription("The NFT monitoring service has been started successfully.")
        .addFields(
          { name: "Status", value: "🟢 Active", inline: true },
          { name: "Interval", value: "6 hours", inline: true },
          { name: "Guild", value: interaction.guild.name, inline: true }
        )
        .setFooter({ text: "NFT monitoring will automatically check and update user roles" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error starting NFT monitoring:", error);
      await interaction.reply({
        content: "❌ Failed to start NFT monitoring service.",
        flags: 64,
      });
    }
  },

  async handleStop(interaction, guildId) {
    try {
      const monitoringService = interaction.client.nftMonitoringService;
      
      if (!monitoringService) {
        return await interaction.reply({
          content: "❌ NFT monitoring service is not available.",
          flags: 64,
        });
      }

      monitoringService.stopMonitoring();

      const embed = new EmbedBuilder()
        .setColor("#FF0000")
        .setTitle("🔴 NFT Monitoring Stopped")
        .setDescription("The NFT monitoring service has been stopped.")
        .addFields(
          { name: "Status", value: "🔴 Inactive", inline: true },
          { name: "Guild", value: interaction.guild.name, inline: true }
        )
        .setFooter({ text: "Manual checks can still be performed" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error stopping NFT monitoring:", error);
      await interaction.reply({
        content: "❌ Failed to stop NFT monitoring service.",
        flags: 64,
      });
    }
  },

  async handleStatus(interaction, guildId) {
    try {
      const monitoringService = interaction.client.nftMonitoringService;

      if (!monitoringService) {
        return await interaction.reply({
          content: "❌ NFT monitoring service is not available.",
          flags: 64,
        });
      }

      const stats = monitoringService.getMonitoringStats();

      const embed = new EmbedBuilder()
        .setColor(stats.isMonitoring ? "#00FF00" : "#FF0000")
        .setTitle("📊 NFT Monitoring Status")
        .setDescription("Current status of the NFT monitoring service")
        .addFields(
          {
            name: "Service Status",
            value: stats.isMonitoring ? "🟢 Active" : "🔴 Inactive",
            inline: true
          },
          {
            name: "Check Interval",
            value: stats.monitoringInterval || "Not set",
            inline: true
          },
          {
            name: "Last Check",
            value: stats.lastCheck ? new Date(stats.lastCheck).toLocaleString() : "Never",
            inline: true
          }
        )
        .setFooter({ text: "Use /verification-config to manage verification rules" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error getting NFT monitoring status:", error);
      await interaction.reply({
        content: "❌ Failed to get monitoring status.",
        flags: 64,
      });
    }
  },

  async handleCheckUser(interaction, guildId) {
    const targetUser = interaction.options.getUser("user");
    
    try {
      const monitoringService = interaction.client.nftMonitoringService;
      
      if (!monitoringService) {
        return await interaction.reply({
          content: "❌ NFT monitoring service is not available.",
          flags: 64,
        });
      }

      await interaction.deferReply();

      const result = await monitoringService.manualCheckUser(targetUser.id, guildId);
      
      if (result.success) {
        const embed = new EmbedBuilder()
          .setColor(result.wasUpdated ? "#FFA500" : "#00FF00")
          .setTitle("🔍 NFT Status Check")
          .setDescription(`NFT verification status for ${targetUser}`)
          .addFields(
            { name: "User", value: `${targetUser.username} (${targetUser.id})`, inline: true },
            { name: "Status", value: result.user.isVerified ? "✅ Verified" : "❌ Unverified", inline: true },
            { name: "NFT Count", value: result.user.nftCount.toString(), inline: true },
            { name: "Last Check", value: result.user.lastCheck ? new Date(result.user.lastCheck).toLocaleString() : "Never", inline: true },
            { name: "Updated", value: result.wasUpdated ? "✅ Yes" : "❌ No", inline: true }
          )
          .setFooter({ text: result.wasUpdated ? "User roles have been updated" : "No changes detected" })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.editReply({
          content: `❌ Failed to check user: ${result.error}`,
          flags: 64,
        });
      }
    } catch (error) {
      logger.error("Error checking user NFT status:", error);
      await interaction.editReply({
        content: "❌ Failed to check user NFT status.",
        flags: 64,
      });
    }
  },

  async handleRunCheck(interaction, guildId) {
    try {
      const monitoringService = interaction.client.nftMonitoringService;
      
      if (!monitoringService) {
        return await interaction.reply({
          content: "❌ NFT monitoring service is not available.",
          flags: 64,
        });
      }

      await interaction.deferReply();

      // Run the NFT check
      await monitoringService.runNFTCheck();

      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("🔄 Manual NFT Check Complete")
        .setDescription("A manual NFT verification check has been completed for all users.")
        .addFields(
          { name: "Status", value: "✅ Completed", inline: true },
          { name: "Guild", value: interaction.guild.name, inline: true },
          { name: "Type", value: "Manual Check", inline: true }
        )
        .setFooter({ text: "Check the logs for detailed results" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error running manual NFT check:", error);
      await interaction.editReply({
        content: "❌ Failed to run NFT check.",
        flags: 64,
      });
    }
  },

  async handleConfigure(interaction, guildId) {
    const enabled = interaction.options.getBoolean("enabled");
    const interval = interaction.options.getNumber("interval");

    try {
      const monitoringService = interaction.client.nftMonitoringService;

      if (!monitoringService) {
        return await interaction.reply({
          content: "❌ NFT monitoring service is not available.",
          flags: 64,
        });
      }

      let updateMessage = "Configuration updated:\n";

      if (enabled !== null) {
        if (enabled) {
          await monitoringService.startMonitoring();
          updateMessage += `• NFT Monitoring: ✅ Enabled\n`;
        } else {
          monitoringService.stopMonitoring();
          updateMessage += `• NFT Monitoring: ❌ Disabled\n`;
        }
      }

      if (interval !== null) {
        monitoringService.setInterval(interval * 60 * 60 * 1000);
        updateMessage += `• Check Interval: ${interval} hours\n`;
      }

      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("⚙️ NFT Monitoring Configuration Updated")
        .setDescription(updateMessage)
        .setFooter({ text: "Changes will take effect immediately" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error configuring NFT monitoring:", error);
      await interaction.reply({
        content: "❌ Failed to update configuration.",
        flags: 64,
      });
    }
  },
};
