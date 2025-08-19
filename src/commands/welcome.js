const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } = require("discord.js");
const { BotConfig } = require("../database/models");
const logger = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Manage the welcome message system.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName("setup")
        .setDescription("Set up or update the welcome message.")
        .addChannelOption(option =>
          option
            .setName("channel")
            .setDescription("The channel where welcome messages will be sent.")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
        .addStringOption(option =>
          option
            .setName("message")
            .setDescription("The welcome message. Use {user} and {server}.")
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("disable")
        .setDescription("Disable the welcome message system.")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("test")
        .setDescription("Send a test welcome message.")
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    logger.info(`[WelcomeCommand] Executing subcommand: ${subcommand} for guild ${guildId}`);

    try {
      if (subcommand === "setup") {
        const channel = interaction.options.getChannel("channel");
        const message = interaction.options.getString("message");
        logger.info(`[WelcomeSetup] Channel: #${channel.name}, Message: "${message}"`);

        await interaction.deferReply({ ephemeral: true });

        let botConfig = await BotConfig.findOne({ guildId });
        if (!botConfig) {
            logger.info("[WelcomeSetup] BotConfig not found, creating new one...");
            botConfig = new BotConfig({ 
                guildId, 
                guildName: interaction.guild.name 
            });
        } else {
            logger.info("[WelcomeSetup] BotConfig found. Ensuring guildName is present.");
            // This is the fix: ensure guildName exists on existing documents before saving.
            botConfig.guildName = interaction.guild.name;
        }

        logger.info("[WelcomeSetup] Updating welcome configuration...");
        botConfig.welcomeChannelId = channel.id;
        botConfig.set('behavior.welcomeMessage', {
          enabled: true,
          message: message,
        });

        logger.info("[WelcomeSetup] Saving BotConfig to database...");
        await botConfig.save();
        logger.info("[WelcomeSetup] BotConfig saved successfully.");

        const embed = new EmbedBuilder()
          .setColor("#00FF00")
          .setTitle("✅ Welcome System Setup")
          .setDescription(`Welcome messages will now be sent to ${channel}.`)
          .addFields({ name: "Message", value: message })
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === "disable") {
        await interaction.deferReply({ ephemeral: true });
        
        const botConfig = await BotConfig.findOne({ guildId });
        if (botConfig) {
            botConfig.set('behavior.welcomeMessage.enabled', false);
            await botConfig.save();
            logger.info(`[WelcomeDisable] Welcome system disabled for guild ${guildId}.`);
        }

        const embed = new EmbedBuilder()
          .setColor("#FF0000")
          .setTitle("❌ Welcome System Disabled")
          .setDescription("Welcome messages will no longer be sent.")
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === "test") {
        await interaction.deferReply({ ephemeral: true });
        const botConfig = await BotConfig.findOne({ guildId });

        if (!botConfig || !botConfig.welcomeChannelId || !botConfig.behavior?.welcomeMessage?.enabled) {
          return interaction.editReply({ content: "The welcome system is not set up. Use `/welcome setup` to configure it." });
        }

        const channel = interaction.guild.channels.cache.get(botConfig.welcomeChannelId);
        if (!channel) {
          return interaction.editReply({ content: "The configured welcome channel could not be found." });
        }

        const testMessage = botConfig.behavior.welcomeMessage.message
          .replace(/{user}/g, interaction.user.toString())
          .replace(/{server}/g, interaction.guild.name);

        const embed = new EmbedBuilder()
          .setColor("#0099FF")
          .setTitle(`🎉 Welcome to ${interaction.guild.name}!`)
          .setDescription(testMessage)
          .setThumbnail(interaction.user.displayAvatarURL())
          .setTimestamp();

        await channel.send({ embeds: [embed] });
        await interaction.editReply({ content: `A test welcome message has been sent to ${channel}.` });
      }
    } catch (error) {
      logger.error(`[WelcomeCommand] Error on subcommand '${subcommand}':`, error);
      
      const errorEmbed = new EmbedBuilder()
        .setColor("#FF0000")
        .setTitle("❌ Command Failed")
        .setDescription("An unexpected error occurred.")
        .addFields({ name: "Error", value: `\`\`\`${error.message}\`\`\`` })
        .setTimestamp();

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  },
};