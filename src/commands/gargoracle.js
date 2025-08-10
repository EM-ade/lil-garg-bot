const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const AIChatbot = require("../services/aiChatbot");
const { BotConfig } = require("../database/models");
const logger = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("gargoracle")
    .setDescription("Consult the mystical Garg Oracle for fortune-telling and guidance")
    .addStringOption((option) =>
      option
        .setName("question")
        .setDescription("Ask the oracle about your future or seek mystical guidance")
        .setRequired(true)
        .setMaxLength(500)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const question = interaction.options.getString("question");
      const userId = interaction.user.id;
      const username = interaction.user.username;
      const guildId = interaction.guild?.id;

      // Initialize AI chatbot
      const aiChatbot = new AIChatbot();

      // Check if AI chat is enabled for this guild
      if (guildId) {
        const botConfig = await BotConfig.findOne({ guildId });
        if (botConfig && !botConfig.aiChat.enabled) {
          return await interaction.editReply({
            content: "❌ AI chat is currently disabled in this server.",
          });
        }

        // Check if channel is allowed (if restrictions are set)
        if (botConfig?.aiChat.allowedChannels.length > 0) {
          const channelId = interaction.channel.id;
          if (!botConfig.aiChat.allowedChannels.includes(channelId)) {
            return await interaction.editReply({
              content: "❌ The oracle cannot speak in this channel.",
            });
          }
        }
      }

      // Validate the question
      if (!aiChatbot.isValidQuery(question)) {
        return await interaction.editReply({
          content: "❌ Please provide a valid question for the oracle (3-500 characters).",
        });
      }

      // Process the question with oracle mode
      const result = await aiChatbot.generateOracleResponse(question);

      // Create mystical oracle embed with Lil Gargs branding
      const embed = new EmbedBuilder()
        .setColor("#9B59B6") // Purple mystical color
        .setTitle("🔮 The Garg Oracle Speaks")
        .setDescription(`*The ancient Garg Oracle peers into the mystical realm...*\n\n${result.response}`)
        .addFields({ name: "🌟 Your Question", value: question, inline: false })
        .setFooter({
          text: `Oracle consulted by ${username} • The future is ever-changing`,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

      // Add mystical elements
      const mysticalElements = [
        "✨ The stars align in your favor",
        "🌙 The moon whispers secrets",
        "⭐ Ancient wisdom flows through the oracle",
        "🔮 The crystal ball reveals all",
        "🌟 Destiny calls to you",
        "💫 The cosmos dance with possibility"
      ];
      
      const randomElement = mysticalElements[Math.floor(Math.random() * mysticalElements.length)];
      embed.addFields({
        name: "🌌 Mystical Insight",
        value: randomElement,
        inline: false
      });

      await interaction.editReply({ embeds: [embed] });

      // Update bot config stats
      if (guildId) {
        await BotConfig.findOneAndUpdate(
          { guildId },
          { $inc: { "stats.totalAIQueries": 1 } },
          { upsert: true }
        );
      }

      // Log the interaction
      logger.info(
        `Oracle consultation from ${username} (${userId}): "${question}" - Response length: ${result.response.length}`
      );
    } catch (error) {
      logger.error("Error in gargoracle command:", error);

      const errorEmbed = new EmbedBuilder()
        .setColor("#ff0000")
        .setTitle("🔮 Oracle Error")
        .setDescription(
          "The mystical energies are disrupted. The oracle cannot see clearly at this moment. Please try again later."
        )
        .addFields({
          name: "Your Question",
          value: interaction.options.getString("question"),
          inline: false,
        })
        .setFooter({
          text: `Oracle consulted by ${interaction.user.username}`,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};
