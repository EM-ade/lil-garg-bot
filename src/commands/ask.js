const { SlashCommandBuilder } = require("discord.js");
const { processAskGarg } = require("../utils/askGargProcessor");
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
      const channelId = interaction.channel.id;
      const avatarURL = interaction.user.displayAvatarURL();

      await processAskGarg(
        question,
        userId,
        username,
        guildId,
        channelId,
        interaction.editReply.bind(interaction), // Use bind to maintain context
        avatarURL
      );
    } catch (error) {
      logger.error("Error in ask command:", error);
      await interaction.editReply({
        content: "❌ I encountered an error while processing your question. Please try again later.",
      });
    }
  },
};
