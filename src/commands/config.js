const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js");
const { BotConfig } = require("../database/models");
const logger = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Configure bot settings for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName("channels")
        .setDescription("Configure channels for different bot features")
        .addStringOption(option =>
          option
            .setName("feature")
            .setDescription("Which feature to configure")
            .setRequired(true)
            .addChoices(
              { name: "Pet System", value: "pet" },
              { name: "Battle System", value: "battle" },
              { name: "NFT Verification", value: "nft" },
              { name: "Ticket System", value: "ticket" },
              { name: "Welcome Messages", value: "welcome" },
              { name: "Mod Log", value: "modlog" }
            )
        )
        .addChannelOption(option =>
          option
            .setName("channel")
            .setDescription("Channel to set for this feature")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("roles")
        .setDescription("Configure NFT verification role tiers")
        .addIntegerOption(option =>
          option
            .setName("nft_count")
            .setDescription("Minimum NFT count for this tier")
            .setRequired(true)
            .setMinValue(1)
        )
        .addRoleOption(option =>
          option
            .setName("role")
            .setDescription("Role to assign for this NFT count")
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("features")
        .setDescription("Toggle features on/off")
        .addStringOption(option =>
          option
            .setName("feature")
            .setDescription("Feature to toggle")
            .setRequired(true)
            .addChoices(
              { name: "Pet System", value: "pet" },
              { name: "Battle System", value: "battle" },
              { name: "NFT Verification", value: "nft" },
              { name: "Ticket System", value: "ticket" },
              { name: "Welcome Messages", value: "welcome" },
              { name: "AI Chat", value: "ai" }
            )
        )
        .addBooleanOption(option =>
          option
            .setName("enabled")
            .setDescription("Enable or disable this feature")
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("welcome")
        .setDescription("Configure welcome message settings")
        .addStringOption(option =>
          option
            .setName("message")
            .setDescription("Custom welcome message (leave empty for AI-generated)")
            .setRequired(false)
            .setMaxLength(1000)
        )
        .addBooleanOption(option =>
          option
            .setName("ai_generated")
            .setDescription("Enable AI-generated welcome messages")
            .setRequired(false)
        )
        .addBooleanOption(option =>
          option
            .setName("show_buttons")
            .setDescription("Show interactive buttons in welcome messages")
            .setRequired(false)
        )
        .addBooleanOption(option =>
          option
            .setName("enabled")
            .setDescription("Enable or disable welcome messages")
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("buttons")
        .setDescription("Place interactive buttons in configured channels")
        .addStringOption(option =>
          option
            .setName("type")
            .setDescription("Type of button to place")
            .setRequired(true)
            .addChoices(
              { name: "NFT Verification", value: "nft_verify" },
              { name: "Support Ticket", value: "ticket" },
              { name: "Pet System", value: "pet" },
              { name: "Battle System", value: "battle" },
              { name: "Welcome Message", value: "welcome" }
            )
        )
        .addChannelOption(option =>
          option
            .setName("channel")
            .setDescription("Channel to place buttons in (uses configured channel if not specified)")
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("view")
        .setDescription("View current bot configuration")
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const subcommand = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;
      const guildName = interaction.guild.name;

      // Get or create bot config
      let botConfig = await BotConfig.findOne({ guildId });
      if (!botConfig) {
        botConfig = new BotConfig({
          guildId,
          guildName,
        });
        await botConfig.save();
      }

      switch (subcommand) {
        case "channels":
          await this.handleChannelConfig(interaction, botConfig);
          break;
        case "roles":
          await this.handleRoleConfig(interaction, botConfig);
          break;
        case "features":
          await this.handleFeatureToggle(interaction, botConfig);
          break;
        case "welcome":
          await this.handleWelcomeConfig(interaction, botConfig);
          break;
        case "buttons":
          await this.handleButtonPlacement(interaction, botConfig);
          break;
        case "view":
          await this.handleViewConfig(interaction, botConfig);
          break;
      }
    } catch (error) {
      logger.error("Error in config command:", error);
      await interaction.editReply({
        content: "❌ An error occurred while updating the configuration.",
      });
    }
  },

  async handleChannelConfig(interaction, botConfig) {
    const feature = interaction.options.getString("feature");
    const channel = interaction.options.getChannel("channel");

    const channelMappings = {
      pet: "petChannelId",
      battle: "battleChannelId", 
      nft: "verificationChannelId",
      ticket: "ticketChannelId",
      welcome: "welcomeChannelId",
      modlog: "logChannelId"
    };

    const fieldName = channelMappings[feature];
    if (!fieldName) {
      return await interaction.editReply({
        content: "❌ Invalid feature specified.",
      });
    }

    botConfig[fieldName] = channel.id;
    await botConfig.save();

    const embed = new EmbedBuilder()
      .setColor("#00FF00")
      .setTitle("✅ Channel Configuration Updated")
      .setDescription(`${feature.charAt(0).toUpperCase() + feature.slice(1)} system channel set to ${channel}`)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    logger.info(`Channel config updated for ${interaction.guild.name}: ${feature} -> ${channel.name}`);
  },

  async handleRoleConfig(interaction, botConfig) {
    const nftCount = interaction.options.getInteger("nft_count");
    const role = interaction.options.getRole("role");

    if (!botConfig.nftVerification) {
      botConfig.nftVerification = {};
    }
    if (!botConfig.nftVerification.roleTiers) {
      botConfig.nftVerification.roleTiers = [];
    }

    // Remove existing tier with same NFT count
    botConfig.nftVerification.roleTiers = botConfig.nftVerification.roleTiers.filter(
      tier => tier.nftCount !== nftCount
    );

    // Add new tier
    botConfig.nftVerification.roleTiers.push({
      nftCount,
      roleId: role.id,
      roleName: role.name
    });

    // Sort tiers by NFT count
    botConfig.nftVerification.roleTiers.sort((a, b) => a.nftCount - b.nftCount);

    await botConfig.save();

    const embed = new EmbedBuilder()
      .setColor("#00FF00")
      .setTitle("✅ Role Tier Configuration Updated")
      .setDescription(`Users with ${nftCount}+ NFTs will receive the ${role} role`)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    logger.info(`Role tier config updated for ${interaction.guild.name}: ${nftCount} NFTs -> ${role.name}`);
  },

  async handleFeatureToggle(interaction, botConfig) {
    const feature = interaction.options.getString("feature");
    const enabled = interaction.options.getBoolean("enabled");

    const featureMappings = {
      pet: "petSystem.enabled",
      battle: "battleSystem.enabled",
      nft: "nftVerification.enabled",
      ticket: "ticketSystem.enabled",
      welcome: "behavior.welcomeMessage.enabled",
      ai: "aiChat.enabled"
    };

    const featurePath = featureMappings[feature];
    if (!featurePath) {
      return await interaction.editReply({
        content: "❌ Invalid feature specified.",
      });
    }

    // Set nested property
    const pathParts = featurePath.split('.');
    let current = botConfig;
    for (let i = 0; i < pathParts.length - 1; i++) {
      if (!current[pathParts[i]]) {
        current[pathParts[i]] = {};
      }
      current = current[pathParts[i]];
    }
    current[pathParts[pathParts.length - 1]] = enabled;

    await botConfig.save();

    const embed = new EmbedBuilder()
      .setColor(enabled ? "#00FF00" : "#FF6B35")
      .setTitle(`${enabled ? "✅" : "⚠️"} Feature ${enabled ? "Enabled" : "Disabled"}`)
      .setDescription(`${feature.charAt(0).toUpperCase() + feature.slice(1)} system is now ${enabled ? "enabled" : "disabled"}`)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    logger.info(`Feature toggle for ${interaction.guild.name}: ${feature} -> ${enabled}`);
  },

  async handleWelcomeConfig(interaction, botConfig) {
    const customMessage = interaction.options.getString("message");
    const aiGenerated = interaction.options.getBoolean("ai_generated");
    const showButtons = interaction.options.getBoolean("show_buttons");
    const enabled = interaction.options.getBoolean("enabled");

    if (!botConfig.behavior) {
      botConfig.behavior = {};
    }
    if (!botConfig.behavior.welcomeMessage) {
      botConfig.behavior.welcomeMessage = {};
    }

    if (customMessage) {
      botConfig.behavior.welcomeMessage.message = customMessage;
      botConfig.behavior.welcomeMessage.useAI = false;
    } else if (aiGenerated) {
      botConfig.behavior.welcomeMessage.useAI = true;
    } else {
      botConfig.behavior.welcomeMessage.useAI = false; // Default to false if no message and no AI
    }

    botConfig.behavior.welcomeMessage.showButtons = showButtons;
    botConfig.behavior.welcomeMessage.enabled = enabled;

    await botConfig.save();

    const embed = new EmbedBuilder()
      .setColor("#00FF00")
      .setTitle("✅ Welcome Message Configuration Updated")
      .setDescription(customMessage ? 
        "Custom welcome message set" : 
        "Welcome messages will be AI-generated")
      .setTimestamp();

    if (customMessage) {
      embed.addFields({
        name: "Custom Message",
        value: customMessage,
        inline: false
      });
    }

    await interaction.editReply({ embeds: [embed] });
    logger.info(`Welcome config updated for ${interaction.guild.name}`);
  },

  async handleButtonPlacement(interaction, botConfig) {
    const buttonType = interaction.options.getString("type");
    const channel = interaction.options.getChannel("channel");
    
    try {
      let targetChannel = channel;
      
      // If no channel specified, use the configured channel for this feature
      if (!targetChannel) {
        const channelMappings = {
          nft_verify: botConfig.verificationChannelId,
          ticket: botConfig.ticketChannelId,
          pet: botConfig.petChannelId,
          battle: botConfig.battleChannelId,
          welcome: botConfig.welcomeChannelId
        };
        
        const channelId = channelMappings[buttonType];
        if (channelId) {
          targetChannel = interaction.guild.channels.cache.get(channelId);
        }
      }
      
      if (!targetChannel) {
        return await interaction.editReply({
          content: `❌ No channel configured for ${buttonType}. Please configure a channel first or specify one.`
        });
      }
      
      // Import embed builder
      const EmbedBuilder = require("../utils/embedBuilder");
      
      let embed, buttons;
      
      switch (buttonType) {
        case "nft_verify":
          embed = EmbedBuilder.createVerificationEmbed();
          buttons = EmbedBuilder.getVerificationButtons();
          break;
          
        case "ticket":
          embed = EmbedBuilder.createMatricaStyleEmbed({
            title: "🎫 Support Tickets",
            description: "Need help? Create a support ticket and our staff will assist you.",
            color: "#FF6B35",
            fields: [
              {
                name: "📋 How it works",
                value: "Click the button below to create a private ticket channel where you can discuss your issue with staff members.",
                inline: false
              },
              {
                name: "⏰ Response Time",
                value: "Staff typically respond within 24 hours. Please be patient and provide clear information about your issue.",
                inline: false
              }
            ]
          });
          buttons = EmbedBuilder.getTicketButtons();
          break;
          
        case "pet":
          embed = EmbedBuilder.createMatricaStyleEmbed({
            title: "🐲 Lil Gargs Pet System",
            description: "Adopt, train, and battle with your own Lil Garg companion!",
            color: "#FF6B35",
            fields: [
              {
                name: "🐾 Getting Started",
                value: "Use `/pet adopt [name]` to adopt your first Lil Garg companion.",
                inline: false
              },
              {
                name: "🎯 Pet Actions",
                value: "Feed, train, play, and check your pet's status with the buttons below.",
                inline: false
              }
            ]
          });
          buttons = EmbedBuilder.getPetButtons();
          break;
          
        case "battle":
          embed = EmbedBuilder.createMatricaStyleEmbed({
            title: "⚔️ Battle Arena",
            description: "Challenge other members to epic battles with your Lil Garg pets!",
            color: "#FF0000",
            fields: [
              {
                name: "🎮 How to Battle",
                value: "Use `/battle start @user` to challenge someone, or accept pending challenges.",
                inline: false
              },
              {
                name: "🏆 Battle Actions",
                value: "Use the buttons below to perform actions during battles.",
                inline: false
              }
            ]
          });
          buttons = EmbedBuilder.getBattleButtons();
          break;
          
        case "welcome":
          embed = EmbedBuilder.createMatricaStyleEmbed({
            title: "🌟 Welcome to Lil Gargs!",
            description: "Welcome to our amazing community! Here's how to get started:",
            color: "#00FF00",
            fields: [
              {
                name: "🚀 Quick Start",
                value: "Use the buttons below to jump right into the action!",
                inline: false
              },
              {
                name: "💎 NFT Benefits",
                value: "Connect your wallet to unlock exclusive channels and features.",
                inline: false
              }
            ]
          });
          buttons = EmbedBuilder.createButtonRow([
            {
              customId: 'welcome_pet_adopt',
              label: 'Adopt Pet',
              style: require('discord.js').ButtonStyle.Primary,
              emoji: '🐲'
            },
            {
              customId: 'welcome_nft_verify',
              label: 'Verify NFT',
              style: require('discord.js').ButtonStyle.Success,
              emoji: '💎'
            },
            {
              customId: 'welcome_battle_start',
              label: 'Start Battle',
              style: require('discord.js').ButtonStyle.Secondary,
              emoji: '⚔️'
            }
          ]);
          break;
          
        default:
          return await interaction.editReply({
            content: "❌ Invalid button type specified."
          });
      }
      
      // Send the embed with buttons
      await targetChannel.send({
        embeds: [embed],
        components: [buttons]
      });
      
      await interaction.editReply({
        content: `✅ Successfully placed ${buttonType} buttons in ${targetChannel}!`
      });
      
    } catch (error) {
      logger.error(`Error placing ${buttonType} buttons:`, error);
      await interaction.editReply({
        content: `❌ An error occurred while placing the buttons.`
      });
    }
  },

  async handleViewConfig(interaction, botConfig) {
    const embed = new EmbedBuilder()
      .setColor("#FF6B35")
      .setTitle("⚙️ Bot Configuration")
      .setDescription(`Configuration for **${interaction.guild.name}**`)
      .setTimestamp();

    // Channel configurations
    let channelConfig = "";
    if (botConfig.petChannelId) channelConfig += `🐾 Pet System: <#${botConfig.petChannelId}>\n`;
    if (botConfig.battleChannelId) channelConfig += `⚔️ Battle System: <#${botConfig.battleChannelId}>\n`;
    if (botConfig.verificationChannelId) channelConfig += `🔐 NFT Verification: <#${botConfig.verificationChannelId}>\n`;
    if (botConfig.ticketChannelId) channelConfig += `🎫 Ticket System: <#${botConfig.ticketChannelId}>\n`;
    if (botConfig.welcomeChannelId) channelConfig += `👋 Welcome Messages: <#${botConfig.welcomeChannelId}>\n`;
    if (botConfig.logChannelId) channelConfig += `📝 Mod Log: <#${botConfig.logChannelId}>\n`;

    if (channelConfig) {
      embed.addFields({
        name: "📍 Configured Channels",
        value: channelConfig,
        inline: false
      });
    }

    // Feature status
    let featureStatus = "";
    featureStatus += `🐾 Pet System: ${botConfig.petSystem?.enabled ? "✅" : "❌"}\n`;
    featureStatus += `⚔️ Battle System: ${botConfig.battleSystem?.enabled ? "✅" : "❌"}\n`;
    featureStatus += `🔐 NFT Verification: ${botConfig.nftVerification?.enabled ? "✅" : "❌"}\n`;
    featureStatus += `🎫 Ticket System: ${botConfig.ticketSystem?.enabled ? "✅" : "❌"}\n`;
    featureStatus += `👋 Welcome Messages: ${botConfig.behavior?.welcomeMessage?.enabled ? "✅" : "❌"}\n`;
    featureStatus += `🤖 AI Chat: ${botConfig.aiChat?.enabled ? "✅" : "❌"}\n`;

    embed.addFields({
      name: "🔧 Feature Status",
      value: featureStatus,
      inline: false
    });

    // Role tiers
    if (botConfig.nftVerification?.roleTiers?.length > 0) {
      let roleTiers = "";
      botConfig.nftVerification.roleTiers.forEach(tier => {
        roleTiers += `${tier.nftCount}+ NFTs: <@&${tier.roleId}>\n`;
      });
      
      embed.addFields({
        name: "🏆 NFT Role Tiers",
        value: roleTiers,
        inline: false
      });
    }

    await interaction.editReply({ embeds: [embed] });
  }
};
