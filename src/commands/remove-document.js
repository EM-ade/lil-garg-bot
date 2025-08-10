const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const DocumentManager = require('../services/documentManager');
const RoleManager = require('../utils/roleManager');
const { BotConfig } = require('../database/models');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remove-document')
        .setDescription('Remove a document from the AI knowledge base')
        .addStringOption(option =>
            option.setName('document_id')
                .setDescription('ID of the document to remove')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const userId = interaction.user.id;
            const username = interaction.user.username;
            const guild = interaction.guild;
            const guildId = guild?.id;
            const documentId = interaction.options.getString('document_id');

            // Check permissions
            const roleManager = new RoleManager(interaction.client);
            const hasPermission = await roleManager.hasAdminPermissions(guild, userId) ||
                                await roleManager.hasModeratorPermissions(guild, userId);

            if (!hasPermission) {
                return await interaction.editReply({
                    content: '❌ You do not have permission to remove documents. Only administrators and moderators can remove documents.',
                });
            }

            // Initialize document manager
            const documentManager = new DocumentManager();
            await documentManager.initialize();

            // Get document details before removal
            let documentInfo;
            try {
                documentInfo = await documentManager.getDocument(documentId);
            } catch (error) {
                return await interaction.editReply({
                    content: '❌ Document not found. Please check the document ID.',
                });
            }

            // Remove the document
            await documentManager.removeDocument(documentId);

            // Create success embed
            const embed = new EmbedBuilder()
                .setColor('#ff6600')
                .setTitle('🗑️ Document Removed')
                .setDescription(`The document has been removed from the AI knowledge base.`)
                .addFields(
                    { name: 'Title', value: documentInfo.title, inline: true },
                    { name: 'Category', value: documentInfo.category, inline: true },
                    { name: 'Document ID', value: documentId, inline: false }
                )
                .setFooter({ 
                    text: `Removed by ${username}`,
                    iconURL: interaction.user.displayAvatarURL()
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // Update bot config stats
            if (guildId) {
                await BotConfig.findOneAndUpdate(
                    { guildId },
                    { $inc: { 'stats.totalDocuments': -1 } },
                    { upsert: true }
                );
            }

            // Log the action
            logger.info(`Document removed by ${username} (${userId}): ${documentInfo.title} (${documentId})`);

        } catch (error) {
            logger.error('Error in remove-document command:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Error Removing Document')
                .setDescription('An error occurred while removing the document.')
                .addFields(
                    { name: 'Error Details', value: error.message || 'Unknown error', inline: false }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },
};
