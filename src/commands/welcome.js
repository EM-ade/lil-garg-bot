const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const { BotConfig } = require("../database/models");
const logger = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Manage the welcome system for new members")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName("setup")
        .setDescription("Set up the welcome system")
        .addChannelOption(option =>
          option
            .setName("channel")
            .setDescription("Channel to send welcome messages")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
        .addStringOption(option =>
          option
            .setName("message")
            .setDescription("Custom welcome message (use {user} for username, {server} for server name)")
            .setRequired(false)
        )
        .addBooleanOption(option =>
          option
            .setName("buttons")
            .setDescription("Include feature buttons in welcome message")
            .setRequired(false)
        )
        .addBooleanOption(option =>
          option
            .setName("embed")
            .setDescription("Use embed format for welcome message")
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("test")
        .setDescription("Test the welcome message")
        .addUserOption(option =>
          option
            .setName("user")
            .setDescription("User to test welcome message with")
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("disable")
        .setDescription("Disable the welcome system")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("preview")
        .setDescription("Preview the current welcome message")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("customize")
        .setDescription("Customize welcome message components")
        .addStringOption(option =>
          option
            .setName("title")
            .setDescription("Welcome message title")
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName("description")
            .setDescription("Welcome message description")
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName("color")
            .setDescription("Welcome message color (hex code)")
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName("footer")
            .setDescription("Welcome message footer text")
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    try {
      // Get or create bot config
      let botConfig = await BotConfig.findOne({ guildId });
      if (!botConfig) {
        botConfig = new BotConfig({
          guildId: guildId,
          guildName: interaction.guild.name
        });
        await botConfig.save();
      }

      switch (subcommand) {
        case "setup":
          await this.handleSetup(interaction, botConfig);
          break;
        case "test":
          await this.handleTest(interaction, botConfig);
          break;
        case "disable":
          await this.handleDisable(interaction, botConfig);
          break;
        case "preview":
          await this.handlePreview(interaction, botConfig);
          break;
        case "customize":
          await this.handleCustomize(interaction, botConfig);
          break;
      }
    } catch (error) {
      logger.error(`Error in welcome command (${subcommand}):`, error);
      await interaction.reply({
        content: "❌ An error occurred while processing your request.",
        ephemeral: true,
      });
    }
  },

  async handleSetup(interaction, botConfig) {
    const channel = interaction.options.getChannel("channel");
    const customMessage = interaction.options.getString("message");
    const includeButtons = interaction.options.getBoolean("buttons") ?? true;
    const useEmbed = interaction.options.getBoolean("embed") ?? true;

    try {
      // Update bot config
      botConfig.welcomeSystem = {
        enabled: true,
        channelId: channel.id,
        channelName: channel.name,
        customMessage: customMessage || null,
        includeButtons: includeButtons,
        useEmbed: useEmbed,
        title: botConfig.welcomeSystem?.title || "🎉 Welcome to Lil Gargs!",
        description: botConfig.welcomeSystem?.description || "We're excited to have you join our community!",
        color: botConfig.welcomeSystem?.color || "#FF6B35",
        footer: botConfig.welcomeSystem?.footer || "Use the buttons below to get started!"
      };

      await botConfig.save();

      // Send confirmation
      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("✅ Welcome System Setup Complete")
        .setDescription(`Welcome system has been configured for ${channel}!`)
        .addFields(
          { name: "Channel", value: channel.toString(), inline: true },
          { name: "Custom Message", value: customMessage ? "✅ Enabled" : "❌ Disabled", inline: true },
          { name: "Feature Buttons", value: includeButtons ? "✅ Enabled" : "❌ Disabled", inline: true },
          { name: "Embed Format", value: useEmbed ? "✅ Enabled" : "❌ Disabled", inline: true }
        )
        .setFooter({ text: "New members will now receive welcome messages!" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

      // Send a test welcome message to the channel
      if (includeButtons) {
        await this.sendWelcomeMessage(channel, interaction.user, botConfig.welcomeSystem, true);
      }

      logger.info(`Welcome system setup in ${channel.name} by ${interaction.user.tag}`);
    } catch (error) {
      logger.error("Error setting up welcome system:", error);
      await interaction.reply({
        content: "❌ Failed to setup welcome system. Please try again.",
        ephemeral: true
      });
    }
  },

  async handleTest(interaction, botConfig) {
    const testUser = interaction.options.getUser("user") || interaction.user;

    try {
      if (!botConfig.welcomeSystem?.enabled) {
        return await interaction.reply({
          content: "❌ Welcome system is not enabled. Use `/welcome setup` first.",
          ephemeral: true
        });
      }

      const channel = interaction.guild.channels.cache.get(botConfig.welcomeSystem.channelId);
      if (!channel) {
        return await interaction.reply({
          content: "❌ Welcome channel not found. Please reconfigure the welcome system.",
          ephemeral: true
        });
      }

      // Send test welcome message
      await this.sendWelcomeMessage(channel, testUser, botConfig.welcomeSystem, true);

      await interaction.reply({
        content: `✅ Test welcome message sent to ${channel}!`,
        ephemeral: true
      });

      logger.info(`Welcome message test sent by ${interaction.user.tag} for ${testUser.tag}`);
    } catch (error) {
      logger.error("Error testing welcome message:", error);
      await interaction.reply({
        content: "❌ Failed to send test welcome message. Please try again.",
        ephemeral: true
      });
    }
  },

  async handleDisable(interaction, botConfig) {
    try {
      botConfig.welcomeSystem = {
        ...botConfig.welcomeSystem,
        enabled: false
      };

      await botConfig.save();

      await interaction.reply({
        content: "✅ Welcome system has been disabled. New members will no longer receive welcome messages.",
        ephemeral: true
      });

      logger.info(`Welcome system disabled by ${interaction.user.tag}`);
    } catch (error) {
      logger.error("Error disabling welcome system:", error);
      await interaction.reply({
        content: "❌ Failed to disable welcome system. Please try again.",
        ephemeral: true
      });
    }
  },

  async handlePreview(interaction, botConfig) {
    try {
      if (!botConfig.welcomeSystem?.enabled) {
        return await interaction.reply({
          content: "❌ Welcome system is not enabled. Use `/welcome setup` first.",
          ephemeral: true
        });
      }

      const welcomeSystem = botConfig.welcomeSystem;
      
      // Send preview to the user
      await this.sendWelcomeMessage(interaction.channel, interaction.user, welcomeSystem, false);

      await interaction.reply({
        content: "✅ Welcome message preview sent above!",
        ephemeral: true
      });
    } catch (error) {
      logger.error("Error previewing welcome message:", error);
      await interaction.reply({
        content: "❌ Failed to preview welcome message. Please try again.",
        ephemeral: true
      });
    }
  },

  async handleCustomize(interaction, botConfig) {
    const title = interaction.options.getString("title");
    const description = interaction.options.getString("description");
    const color = interaction.options.getString("color");
    const footer = interaction.options.getString("footer");

    try {
      if (!botConfig.welcomeSystem?.enabled) {
        return await interaction.reply({
          content: "❌ Welcome system is not enabled. Use `/welcome setup` first.",
          ephemeral: true
        });
      }

      // Update welcome system settings
      if (title) botConfig.welcomeSystem.title = title;
      if (description) botConfig.welcomeSystem.description = description;
      if (color) botConfig.welcomeSystem.color = color;
      if (footer) botConfig.welcomeSystem.footer = footer;

      await botConfig.save();

      const embed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("✅ Welcome Message Customized")
        .setDescription("Your welcome message has been updated!")
        .addFields(
          { name: "Title", value: botConfig.welcomeSystem.title, inline: false },
          { name: "Description", value: botConfig.welcomeSystem.description, inline: false },
          { name: "Color", value: botConfig.welcomeSystem.color, inline: true },
          { name: "Footer", value: botConfig.welcomeSystem.footer, inline: true }
        )
        .setFooter({ text: "Use /welcome preview to see the changes!" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

      logger.info(`Welcome message customized by ${interaction.user.tag}`);
    } catch (error) {
      logger.error("Error customizing welcome message:", error);
      await interaction.reply({
        content: "❌ Failed to customize welcome message. Please try again.",
        ephemeral: true
      });
    }
  },

  async sendWelcomeMessage(channel, user, welcomeSystem, includeButtons) {
    try {
      if (welcomeSystem.useEmbed) {
        const embed = new EmbedBuilder()
          .setColor(welcomeSystem.color)
          .setTitle(welcomeSystem.title)
          .setDescription(this.replacePlaceholders(welcomeSystem.description, user, channel.guild))
          .setThumbnail(user.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: "👋 Welcome", value: `Hello ${user}! We're glad you're here!`, inline: false },
            { name: "🐲 Pet System", value: "Adopt and train your Lil Garg companion", inline: false },
            { name: "💎 NFT Verification", value: "Verify your NFT ownership and get roles", inline: false },
            { name: "⚔️ Battle Arena", value: "Challenge other members in epic battles", inline: false },
            { name: "🎫 Support", value: "Create tickets if you need help", inline: false }
          )
          .setFooter({ text: welcomeSystem.footer })
          .setTimestamp();

        if (includeButtons) {
          const buttons = this.createWelcomeButtons();
          await channel.send({ content: `Welcome ${user}! 🎉`, embeds: [embed], components: buttons });
        } else {
          await channel.send({ content: `Welcome ${user}! 🎉`, embeds: [embed] });
        }
      } else {
        // Plain text message
        let message = this.replacePlaceholders(welcomeSystem.customMessage || 
          `Welcome ${user} to ${channel.guild.name}! We're excited to have you join our Lil Gargs community!`, 
          user, channel.guild);

        if (includeButtons) {
          const buttons = this.createWelcomeButtons();
          await channel.send({ content: message, components: buttons });
        } else {
          await channel.send(message);
        }
      }
    } catch (error) {
      logger.error("Error sending welcome message:", error);
      throw error;
    }
  },

  createWelcomeButtons() {
    const row1 = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId("welcome_pet_adopt")
          .setLabel("Adopt Pet")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("🐲"),
        new ButtonBuilder()
          .setCustomId("welcome_nft_verify")
          .setLabel("Verify NFT")
          .setStyle(ButtonStyle.Success)
          .setEmoji("💎")
      );

    const row2 = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId("welcome_battle_start")
          .setLabel("Start Battle")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("⚔️"),
        new ButtonBuilder()
          .setCustomId("feature_create_ticket")
          .setLabel("Get Help")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("🎫")
      );

    return [row1, row2];
  },

  replacePlaceholders(text, user, guild) {
    return text
      .replace(/{user}/g, user.toString())
      .replace(/{username}/g, user.username)
      .replace(/{server}/g, guild.name)
      .replace(/{memberCount}/g, guild.memberCount.toString());
  }
};
