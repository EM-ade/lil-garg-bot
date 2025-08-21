const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const AIChatbot = require("../services/aiChatbot");
const { BotConfig } = require("../database/models");
const logger = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("askgarg")
    .setDescription(
      "Ask the AI assistant about Lil Gargs NFT project and community"
    )
    .addStringOption((option) =>
      option
        .setName("question")
        .setDescription("Your question about Lil Gargs")
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
              content: "❌ AI chat is not allowed in this channel.",
            });
          }
        }
      }

      // Validate the question
      if (!aiChatbot.isValidQuery(question)) {
        return await interaction.editReply({
          content: "❌ Please provide a valid question (3-500 characters).",
        });
      }

      // Process the question
      const result = await aiChatbot.processMessage(question, userId);

      // Remove knowledge base text from response
      const cleanedResponse = result.response.replace(/\(knowledge base: ".*?"\)/g, '');

      // Create response embed with Lil Gargs branding
      const embed = new EmbedBuilder()
        .setColor("#FF6B35") // Orange brand color
        .setTitle("🐲 Lil Gargs AI Assistant")
        .setDescription(cleanedResponse)
        .addFields({ name: "❓ Question", value: question, inline: false })
        .setFooter({
          text: `Asked by ${username}${
            result.documentsUsed > 0
              ? ` • Used ${result.documentsUsed} document(s)`
              : ""
          }`,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

      // Add document information if available
      if (result.documentTitles && result.documentTitles.length > 0) {
        embed.addFields({
          name: "Sources",
          value: result.documentTitles.map((title) => `• ${title}`).join("\n"),
          inline: false,
        });
      }

      // Change color based on whether context was found
      if (!result.hasContext) {
        embed.setColor("#ffaa00"); // Orange for no context
      }

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
        `AI question from ${username} (${userId}): "${question}" - Response length: ${result.response.length}`
      );
    } catch (error) {
      logger.error("Error in ask command:", error);

      const errorEmbed = new EmbedBuilder()
        .setColor("#ff0000")
        .setTitle("❌ AI Error")
        .setDescription(
          "I encountered an error while processing your question. Please try again later."
        )
        .addFields({
          name: "Question",
          value: interaction.options.getString("question"),
          inline: false,
        })
        .setFooter({
          text: `Asked by ${interaction.user.username}`,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};
