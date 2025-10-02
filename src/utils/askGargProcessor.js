const { EmbedBuilder } = require("discord.js");
const AIChatbot = require("../services/aiChatbot");
const { BotConfig } = require("../database/models");
const logger = require("../utils/logger");

async function processAskGarg(question, userId, username, guildId, channelId, replyFunction, avatarURL) {
  try {
    // Initialize AI chatbot
    const aiChatbot = new AIChatbot();

    // Check if AI chat is enabled for this guild
    if (guildId) {
      const botConfig = await BotConfig.findOne({ guildId });
      if (botConfig && !botConfig.aiChat.enabled) {
        return await replyFunction({
          content: "❌ AI chat is currently disabled in this server.",
        });
      }

      // Check if channel is allowed (if restrictions are set)
      if (botConfig?.aiChat.allowedChannels.length > 0) {
        if (!botConfig.aiChat.allowedChannels.includes(channelId)) {
          return await replyFunction({
            content: "❌ AI chat is not allowed in this channel.",
          });
        }
      }
    }

    // Validate the question
    if (!aiChatbot.isValidQuery(question)) {
      return await replyFunction({
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
        iconURL: avatarURL,
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

    await replyFunction({ embeds: [embed] });

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
    logger.error("Error in processAskGarg:", error);
    await replyFunction({
      content: "❌ I encountered an error while processing your question. Please try again later.",
    });
  }
}

module.exports = { processAskGarg };