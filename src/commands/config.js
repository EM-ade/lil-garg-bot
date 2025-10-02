const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const { BotConfig } = require("../database/models");
const logger = require("../utils/logger");
const EmbedBuilderUtil = require("../utils/embedBuilder");

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
        .setName("whitelist")
        .setDescription("Manage the link whitelist")
        .addStringOption(option =>
          option
            .setName("action")
            .setDescription("The action to perform")
            .setRequired(true)
            .addChoices(
              { name: "Add user", value: "add" },
              { name: "Remove user", value: "remove" },
              { name: "List users", value: "list" }
            )
        )
        .addUserOption(option =>
          option
            .setName("user")
            .setDescription("The user to add or remove")
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

      let botConfig = await BotConfig.findOne({ guildId });
      if (!botConfig) {
        botConfig = new BotConfig({ guildId, guildName: interaction.guild.name });
        await botConfig.save();
      }

      if (!botConfig.guildName) {
        botConfig.guildName = interaction.guild.name;
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
        case "whitelist":
          await this.handleWhitelistConfig(interaction, botConfig);
          break;
        case "view":
          await this.handleViewConfig(interaction, botConfig);
          break;
        default:
            await interaction.editReply({ content: "❌ Unknown subcommand."});
      }
    } catch (error) {
      logger.error(`Error in config command for guild ${interaction.guild.id} (${interaction.guild.name}):`, error);
      await interaction.editReply({
        content: `❌ An error occurred while updating the configuration. Error: ${error.message || 'Unknown error'}`,
      });
    }
  },

  async handleWhitelistConfig(interaction, botConfig) {
    const action = interaction.options.getString("action");
    const targetUser = interaction.options.getUser("user");

    if ((action === "add" || action === "remove") && !targetUser) {
        const errorEmbed = EmbedBuilderUtil.createMatricaStyleEmbed({
            title: "❌ Invalid Input",
            description: "You must specify a user to add or remove.",
            color: '#FF0000'
        });
        return await interaction.editReply({ embeds: [errorEmbed] });
    }
  
    let updateResult;
    switch (action) {
      case "add":
        updateResult = await BotConfig.updateOne(
          { _id: botConfig._id },
          { $addToSet: { "behavior.autoModeration.linkWhitelist": targetUser.id } }
        );
        if (updateResult.modifiedCount > 0) {
            const addEmbed = EmbedBuilderUtil.createMatricaStyleEmbed({
                title: "✅ User Whitelisted",
                description: `${targetUser.tag} has been added to the link whitelist.`,
                color: '#00FF00'
            });
            await interaction.editReply({ embeds: [addEmbed] });
        } else {
            const infoEmbed = EmbedBuilderUtil.createMatricaStyleEmbed({
                title: "ℹ️ No Changes",
                description: `${targetUser.tag} is already on the whitelist.`,
            });
            await interaction.editReply({ embeds: [infoEmbed] });
        }
        break;
  
      case "remove":
        updateResult = await BotConfig.updateOne(
          { _id: botConfig._id },
          { $pull: { "behavior.autoModeration.linkWhitelist": targetUser.id } }
        );
        if (updateResult.modifiedCount > 0) {
            const removeEmbed = EmbedBuilderUtil.createMatricaStyleEmbed({
                title: "✅ User Removed",
                description: `${targetUser.tag} has been removed from the link whitelist.`,
                color: '#00FF00'
            });
            await interaction.editReply({ embeds: [removeEmbed] });
        } else {
            const errorEmbed = EmbedBuilderUtil.createMatricaStyleEmbed({
                title: "❌ Action Failed",
                description: "This user is not currently on the whitelist.",
                color: '#FF0000'
            });
            await interaction.editReply({ embeds: [errorEmbed] });
        }
        break;
  
      case "list":
        const whitelist = botConfig.behavior?.autoModeration?.linkWhitelist || [];
        const description = whitelist.length > 0
          ? 'The following users are allowed to post links:\n' + whitelist.map(userId => `<@${userId}>`).join('\n')
          : 'No users are currently whitelisted.';
        
        const listEmbed = EmbedBuilderUtil.createMatricaStyleEmbed({
            title: "📋 Whitelisted Users",
            description: description
        });
        await interaction.editReply({ embeds: [listEmbed] });
        break;
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
      return await interaction.editReply({ content: "❌ Invalid feature specified." });
    }

    botConfig[fieldName] = channel.id;
    await botConfig.save();

    const embed = EmbedBuilderUtil.createMatricaStyleEmbed({
        title: "✅ Channel Configuration Updated",
        description: `${feature.charAt(0).toUpperCase() + feature.slice(1)} system channel set to ${channel}`,
        color: '#00FF00'
    });
    await interaction.editReply({ embeds: [embed] });
  },

  async handleRoleConfig(interaction, botConfig) {
    const nftCount = interaction.options.getInteger("nft_count");
    const role = interaction.options.getRole("role");

    if (!botConfig.nftVerification) botConfig.nftVerification = {};
    if (!botConfig.nftVerification.roleTiers) botConfig.nftVerification.roleTiers = [];

    botConfig.nftVerification.roleTiers = botConfig.nftVerification.roleTiers.filter(
      tier => tier.nftCount !== nftCount
    );
    botConfig.nftVerification.roleTiers.push({ nftCount, roleId: role.id, roleName: role.name });
    botConfig.nftVerification.roleTiers.sort((a, b) => a.nftCount - b.nftCount);

    await botConfig.save();

    const embed = EmbedBuilderUtil.createMatricaStyleEmbed({
        title: "✅ Role Tier Configuration Updated",
        description: `Users with ${nftCount}+ NFTs will receive the ${role} role.`,
        color: '#00FF00'
    });
    await interaction.editReply({ embeds: [embed] });
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
    
    // Set nested property
    const pathParts = featurePath.split('.');
    let current = botConfig;
    for (let i = 0; i < pathParts.length - 1; i++) {
      if (!current[pathParts[i]]) current[pathParts[i]] = {};
      current = current[pathParts[i]];
    }
    current[pathParts[pathParts.length - 1]] = enabled;

    await botConfig.save();

    const embed = EmbedBuilderUtil.createMatricaStyleEmbed({
        title: `✅ Feature ${enabled ? "Enabled" : "Disabled"}`,
        description: `${feature.charAt(0).toUpperCase() + feature.slice(1)} system is now ${enabled ? "enabled" : "disabled"}.`,
        color: enabled ? '#00FF00' : '#FF6B35'
    });
    await interaction.editReply({ embeds: [embed] });
  },

  async handleViewConfig(interaction, botConfig) {
    let fields = [];
    
    // Channel configurations
    let channelConfig = "";
    if (botConfig.petChannelId) channelConfig += `🐾 Pet System: <#${botConfig.petChannelId}>\n`;
    if (bot.battleChannelId) channelConfig += `⚔️ Battle System: <#${botConfig.battleChannelId}>\n`;
    if (botConfig.verificationChannelId) channelConfig += `🔐 NFT Verification: <#${botConfig.verificationChannelId}>\n`;
    if (botConfig.ticketChannelId) channelConfig += `🎫 Ticket System: <#${botConfig.ticketChannelId}>\n`;
    if (botConfig.welcomeChannelId) channelConfig += `👋 Welcome: <#${botConfig.welcomeChannelId}>\n`;
    if (botConfig.logChannelId) channelConfig += `📝 Mod Log: <#${botConfig.logChannelId}>\n`;
    if (channelConfig) fields.push({ name: "📍 Configured Channels", value: channelConfig, inline: false });

    // Feature status
    let featureStatus = `🐾 Pet System: ${botConfig.petSystem?.enabled ? "✅" : "❌"}\n`
    + `⚔️ Battle System: ${botConfig.battleSystem?.enabled ? "✅" : "❌"}\n`
    + `🔐 NFT Verification: ${botConfig.nftVerification?.enabled ? "✅" : "❌"}\n`
    + `🎫 Ticket System: ${botConfig.ticketSystem?.enabled ? "✅" : "❌"}\n`
    + `👋 Welcome Messages: ${botConfig.behavior?.welcomeMessage?.enabled ? "✅" : "❌"}\n`
    + `🤖 AI Chat: ${botConfig.aiChat?.enabled ? "✅" : "❌"}\n`;
    fields.push({ name: "🔧 Feature Status", value: featureStatus, inline: false });

    // Role tiers
    if (botConfig.nftVerification?.roleTiers?.length > 0) {
      let roleTiers = botConfig.nftVerification.roleTiers.map(tier => `${tier.nftCount}+ NFTs: <@&${tier.roleId}>`).join('\n');
      fields.push({ name: "🏆 NFT Role Tiers", value: roleTiers, inline: false });
    }

    const embed = EmbedBuilderUtil.createMatricaStyleEmbed({
        title: "⚙️ Bot Configuration",
        description: `Current settings for **${interaction.guild.name}**`,
        fields: fields
    });
    await interaction.editReply({ embeds: [embed] });
  }
};
