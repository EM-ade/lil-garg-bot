const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const PetMaintenanceService = require("../services/petMaintenanceService");
const { Pet, BotConfig } = require("../database/models");
const logger = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("pet-maintenance")
    .setDescription("Manage pet maintenance and care systems")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName("start")
        .setDescription("Start the pet maintenance service")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("stop")
        .setDescription("Stop the pet maintenance service")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("status")
        .setDescription("Check the status of pet maintenance")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("stats")
        .setDescription("View pet maintenance statistics")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("maintain")
        .setDescription("Manually maintain a specific pet")
        .addStringOption(option =>
          option
            .setName("pet_id")
            .setDescription("ID of the pet to maintain")
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("emergency-care")
        .setDescription("Apply emergency care to a pet")
        .addStringOption(option =>
          option
            .setName("pet_id")
            .setDescription("ID of the pet to care for")
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("run-maintenance")
        .setDescription("Manually run pet maintenance for all pets")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("abandoned")
        .setDescription("View abandoned pets in the server")
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    try {
      // Check if user has permission
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return await interaction.reply({
          content: "❌ You need Administrator permissions to use this command.",
          ephemeral: true,
        });
      }

      // Check if pet system is enabled
      const botConfig = await BotConfig.findOne({ guildId });
      if (!botConfig?.petSystem?.enabled) {
        return await interaction.reply({
          content: "❌ Pet system is not enabled in this server. Use `/config` to enable it first.",
          ephemeral: true,
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
        case "stats":
          await this.handleStats(interaction, guildId);
          break;
        case "maintain":
          await this.handleMaintain(interaction, guildId);
          break;
        case "emergency-care":
          await this.handleEmergencyCare(interaction, guildId);
          break;
        case "run-maintenance":
          await this.handleRunMaintenance(interaction, guildId);
          break;
        case "abandoned":
          await this.handleAbandoned(interaction, guildId);
          break;
      }
    } catch (error) {
      logger.error(`Error in pet-maintenance command (${subcommand}):`, error);
      await interaction.reply({
        content: "❌ An error occurred while processing your request.",
        ephemeral: true,
      });
    }
  },

  async handleStart(interaction, guildId) {
    try {
      const maintenanceService = interaction.client.petMaintenanceService;
      
      if (!maintenanceService) {
        return await interaction.reply({
          content: "❌ Pet maintenance service is not available. Please contact a bot administrator.",
          ephemeral: true,
        });
      }

      await maintenanceService.startMaintenance();

      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("🟢 Pet Maintenance Started")
        .setDescription("The pet maintenance service has been started successfully.")
        .addFields(
          { name: "Status", value: "🟢 Active", inline: true },
          { name: "Interval", value: "1 hour", inline: true },
          { name: "Guild", value: interaction.guild.name, inline: true }
        )
        .setFooter({ text: "Pets will be automatically maintained and cared for" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error starting pet maintenance:", error);
      await interaction.reply({
        content: "❌ Failed to start pet maintenance service.",
        ephemeral: true,
      });
    }
  },

  async handleStop(interaction, guildId) {
    try {
      const maintenanceService = interaction.client.petMaintenanceService;
      
      if (!maintenanceService) {
        return await interaction.reply({
          content: "❌ Pet maintenance service is not available.",
          ephemeral: true,
        });
      }

      maintenanceService.stopMaintenance();

      const embed = new EmbedBuilder()
        .setColor("#FF0000")
        .setTitle("🔴 Pet Maintenance Stopped")
        .setDescription("The pet maintenance service has been stopped.")
        .addFields(
          { name: "Status", value: "🔴 Inactive", inline: true },
          { name: "Guild", value: interaction.guild.name, inline: true }
        )
        .setFooter({ text: "Manual maintenance can still be performed" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error stopping pet maintenance:", error);
      await interaction.reply({
        content: "❌ Failed to stop pet maintenance service.",
        ephemeral: true,
      });
    }
  },

  async handleStatus(interaction, guildId) {
    try {
      const maintenanceService = interaction.client.petMaintenanceService;
      
      if (!maintenanceService) {
        return await interaction.reply({
          content: "❌ Pet maintenance service is not available.",
          ephemeral: true,
        });
      }

      const stats = await maintenanceService.getMaintenanceStats();
      const botConfig = await BotConfig.findOne({ guildId });

      if (!stats) {
        return await interaction.reply({
          content: "❌ Failed to get maintenance statistics.",
          ephemeral: true,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(stats.isRunning ? "#00FF00" : "#FF0000")
        .setTitle("📊 Pet Maintenance Status")
        .setDescription("Current status of the pet maintenance service")
        .addFields(
          { 
            name: "Service Status", 
            value: stats.isRunning ? "🟢 Active" : "🔴 Inactive", 
            inline: true 
          },
          { 
            name: "Maintenance Interval", 
            value: stats.maintenanceInterval || "Not set", 
            inline: true 
          },
          { 
            name: "Total Active Pets", 
            value: stats.totalPets.toString(), 
            inline: true 
          },
          { 
            name: "Happy Pets", 
            value: `${stats.happyPets} (${stats.totalPets > 0 ? Math.round((stats.happyPets / stats.totalPets) * 100) : 0}%)`, 
            inline: true 
          },
          { 
            name: "Sad Pets", 
            value: `${stats.sadPets} (${stats.totalPets > 0 ? Math.round((stats.sadPets / stats.totalPets) * 100) : 0}%)`, 
            inline: true 
          },
          { 
            name: "Abandoned Pets", 
            value: stats.abandonedPets.toString(), 
            inline: true 
          }
        )
        .setFooter({ text: "Use /pet-maintenance stats for detailed information" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error getting pet maintenance status:", error);
      await interaction.reply({
        content: "❌ Failed to get maintenance status.",
        ephemeral: true,
      });
    }
  },

  async handleStats(interaction, guildId) {
    try {
      const maintenanceService = interaction.client.petMaintenanceService;
      
      if (!maintenanceService) {
        return await interaction.reply({
          content: "❌ Pet maintenance service is not available.",
          ephemeral: true,
        });
      }

      const stats = await maintenanceService.getMaintenanceStats();
      
      if (!stats) {
        return await interaction.reply({
          content: "❌ Failed to get maintenance statistics.",
          ephemeral: true,
        });
      }

      // Get additional detailed stats
      const guildPets = await Pet.find({ guildId: guildId, isActive: true });
      const averageMood = guildPets.length > 0 
        ? Math.round(guildPets.reduce((sum, pet) => sum + pet.stats.mood, 0) / guildPets.length)
        : 0;
      const averageEnergy = guildPets.length > 0
        ? Math.round(guildPets.reduce((sum, pet) => sum + pet.stats.energy, 0) / guildPets.length)
        : 0;

      const embed = new EmbedBuilder()
        .setColor("#0099FF")
        .setTitle("📈 Pet Maintenance Statistics")
        .setDescription("Detailed statistics about pets in this server")
        .addFields(
          { name: "Total Active Pets", value: stats.totalPets.toString(), inline: true },
          { name: "Happy Pets (80+ mood)", value: stats.happyPets.toString(), inline: true },
          { name: "Sad Pets (<30 mood)", value: stats.sadPets.toString(), inline: true },
          { name: "Abandoned Pets", value: stats.abandonedPets.toString(), inline: true },
          { name: "Average Mood", value: `${averageMood}/100`, inline: true },
          { name: "Average Energy", value: `${averageEnergy}/100`, inline: true },
          { name: "Service Status", value: stats.isRunning ? "🟢 Active" : "🔴 Inactive", inline: true },
          { name: "Maintenance Interval", value: stats.maintenanceInterval || "Not set", inline: true }
        )
        .setFooter({ text: "Statistics are updated in real-time" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error getting pet maintenance stats:", error);
      await interaction.reply({
        content: "❌ Failed to get maintenance statistics.",
        ephemeral: true,
      });
    }
  },

  async handleMaintain(interaction, guildId) {
    const petId = interaction.options.getString("pet_id");
    
    try {
      const maintenanceService = interaction.client.petMaintenanceService;
      
      if (!maintenanceService) {
        return await interaction.reply({
          content: "❌ Pet maintenance service is not available.",
          ephemeral: true,
        });
      }

      await interaction.deferReply();

      const result = await maintenanceService.manualMaintenance(petId);
      
      if (result.success) {
        const embed = new EmbedBuilder()
          .setColor(result.wasUpdated ? "#FFA500" : "#00FF00")
          .setTitle("🔧 Pet Maintenance Complete")
          .setDescription(`Maintenance completed for pet: **${result.pet.name}**`)
          .addFields(
            { name: "Pet ID", value: result.pet.id, inline: true },
            { name: "Mood", value: `${result.pet.mood}/100`, inline: true },
            { name: "Energy", value: `${result.pet.energy}/100`, inline: true },
            { name: "Health", value: `${result.pet.health}/200`, inline: true },
            { name: "Updated", value: result.wasUpdated ? "✅ Yes" : "❌ No", inline: true },
            { name: "Last Maintenance", value: result.pet.lastMaintenance ? new Date(result.pet.lastMaintenance).toLocaleString() : "Never", inline: true }
          )
          .setFooter({ text: result.wasUpdated ? "Pet has been maintained" : "No maintenance needed" })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.editReply({
          content: `❌ Failed to maintain pet: ${result.error}`,
          ephemeral: true,
        });
      }
    } catch (error) {
      logger.error("Error maintaining pet:", error);
      await interaction.editReply({
        content: "❌ Failed to maintain pet.",
        ephemeral: true,
      });
    }
  },

  async handleEmergencyCare(interaction, guildId) {
    const petId = interaction.options.getString("pet_id");
    
    try {
      const maintenanceService = interaction.client.petMaintenanceService;
      
      if (!maintenanceService) {
        return await interaction.reply({
          content: "❌ Pet maintenance service is not available.",
          ephemeral: true,
        });
      }

      await interaction.deferReply();

      const result = await maintenanceService.emergencyCare(petId);
      
      if (result.success) {
        const embed = new EmbedBuilder()
          .setColor("#FF6B6B")
          .setTitle("🚨 Emergency Care Applied")
          .setDescription(`Emergency care has been applied to pet: **${result.pet.name}**`)
          .addFields(
            { name: "Pet ID", value: result.pet.id, inline: true },
            { name: "New Mood", value: `${result.pet.mood}/100`, inline: true },
            { name: "New Energy", value: `${result.pet.energy}/100`, inline: true },
            { name: "Health", value: `${result.pet.health}/200`, inline: true }
          )
          .setFooter({ text: "Pet has been restored to better condition" })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.editReply({
          content: `❌ Failed to apply emergency care: ${result.error}`,
          ephemeral: true,
        });
      }
    } catch (error) {
      logger.error("Error applying emergency care:", error);
      await interaction.editReply({
        content: "❌ Failed to apply emergency care.",
        ephemeral: true,
      });
    }
  },

  async handleRunMaintenance(interaction, guildId) {
    try {
      const maintenanceService = interaction.client.petMaintenanceService;
      
      if (!maintenanceService) {
        return await interaction.reply({
          content: "❌ Pet maintenance service is not available.",
          ephemeral: true,
        });
      }

      await interaction.deferReply();

      // Run the maintenance
      await maintenanceService.runMaintenance();

      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("🔄 Manual Pet Maintenance Complete")
        .setDescription("A manual pet maintenance cycle has been completed for all pets.")
        .addFields(
          { name: "Status", value: "✅ Completed", inline: true },
          { name: "Guild", value: interaction.guild.name, inline: true },
          { name: "Type", value: "Manual Maintenance", inline: true }
        )
        .setFooter({ text: "Check the logs for detailed results" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error running manual pet maintenance:", error);
      await interaction.editReply({
        content: "❌ Failed to run pet maintenance.",
        ephemeral: true,
      });
    }
  },

  async handleAbandoned(interaction, guildId) {
    try {
      const abandonedPets = await Pet.find({ 
        guildId: guildId, 
        isActive: false, 
        status: 'abandoned' 
      });

      if (abandonedPets.length === 0) {
        const embed = new EmbedBuilder()
          .setColor("#00FF00")
          .setTitle("🎉 No Abandoned Pets")
          .setDescription("All pets in this server are being well cared for!")
          .setFooter({ text: "Great job, pet owners!" })
          .setTimestamp();

        return await interaction.reply({ embeds: [embed] });
      }

      const embed = new EmbedBuilder()
        .setColor("#FF6B6B")
        .setTitle("😢 Abandoned Pets")
        .setDescription(`Found ${abandonedPets.length} abandoned pets in this server`)
        .addFields(
          abandonedPets.slice(0, 10).map(pet => ({
            name: pet.name,
            value: `Owner: <@${pet.ownerId}>\nAbandoned: ${new Date(pet.lastActivity).toLocaleDateString()}`,
            inline: true
          }))
        )
        .setFooter({ 
          text: abandonedPets.length > 10 
            ? `Showing first 10 of ${abandonedPets.length} abandoned pets` 
            : "Use /pet-maintenance emergency-care to help these pets" 
        })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error getting abandoned pets:", error);
      await interaction.reply({
        content: "❌ Failed to get abandoned pets information.",
        ephemeral: true,
      });
    }
  },
};
