const { SlashCommandBuilder } = require('discord.js');
const { createEmbed } = require('../utils/embedBuilder');
const { generateAskGargResponse } = require('../services/aiChatbot');
const { handleError } = require('../utils/errorHandler');
const { applyRateLimit } = require('../utils/rateLimiter');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('askgarg')
    .setDescription('Ask the AI about Lil\' Gargs NFTs and community')
    .addStringOption(option =>
      option.setName('question')
        .setDescription('Your question about Lil\' Gargs')
        .setRequired(true)
        .setMaxLength(500)),
  
  async execute(interaction, client) {
    try {
      const question = interaction.options.getString('question');
      
      // Defer reply since AI generation might take a moment
      await interaction.deferReply();
      
      // Generate AI response
      const response = await generateAskGargResponse(question, interaction.user.id);
      
      // Create embed for the response
      const responseEmbed = createEmbed({
        title: '🤖 Garg AI Assistant',
        description: response,
        color: 'primary',
        fields: [
          {
            name: 'Question',
            value: question,
            inline: false
          }
        ],
        footer: { 
          text: `Asked by ${interaction.user.username} • Powered by Gemini AI`,
          iconURL: interaction.user.displayAvatarURL({ dynamic: true })
        }
      });
      
      // Send the response
      await interaction.editReply({ embeds: [responseEmbed] });
      
    } catch (error) {
      await handleError(error, interaction);
    }
  }
};