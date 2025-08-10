const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const AIChatbot = require('../services/aiChatbot');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('chat')
        .setDescription('Chat with the AI')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Your message to the AI')
                .setRequired(true)
                .setMaxLength(2000)),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const question = interaction.options.getString('message');
            const userId = interaction.user.id;
            const username = interaction.user.username;

            // Initialize AI chatbot
            const aiChatbot = new AIChatbot();

            // Validate the question
            if (!aiChatbot.isValidQuery(question)) {
                return await interaction.editReply({
                    content: '❌ Please provide a valid message (3-2000 characters).',
                });
            }

            // Process the question
            const result = await aiChatbot.generateGeneralResponse(question);

            // Create response embed
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🤖 AI Chat')
                .setDescription(result.response)
                .addFields(
                    { name: 'Your Message', value: question, inline: false }
                )
                .setFooter({ 
                    text: `Asked by ${username}`,
                    iconURL: interaction.user.displayAvatarURL()
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // Log the interaction
            logger.info(`AI chat from ${username} (${userId}): "${question}" - Response length: ${result.response.length}`);

        } catch (error) {
            logger.error('Error in chat command:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ AI Error')
                .setDescription('I encountered an error while processing your message. Please try again later.')
                .addFields(
                    { name: 'Your Message', value: interaction.options.getString('message'), inline: false }
                )
                .setFooter({ 
                    text: `Asked by ${interaction.user.username}`,
                    iconURL: interaction.user.displayAvatarURL()
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },
};
