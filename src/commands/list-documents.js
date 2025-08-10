const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const DocumentManager = require('../services/documentManager');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('list-documents')
        .setDescription('List all documents in the AI knowledge base')
        .addStringOption(option =>
            option.setName('category')
                .setDescription('Filter by category')
                .setRequired(false)
                .addChoices(
                    { name: 'General', value: 'general' },
                    { name: 'FAQ', value: 'faq' },
                    { name: 'Guide', value: 'guide' },
                    { name: 'Rules', value: 'rules' },
                    { name: 'Lore', value: 'lore' },
                    { name: 'Technical', value: 'technical' }
                ))
        .addIntegerOption(option =>
            option.setName('page')
                .setDescription('Page number (default: 1)')
                .setRequired(false)
                .setMinValue(1)),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const category = interaction.options.getString('category');
            const page = interaction.options.getInteger('page') || 1;
            const limit = 10;
            const skip = (page - 1) * limit;

            // Initialize document manager
            const documentManager = new DocumentManager();
            await documentManager.initialize();

            // Get documents
            const result = await documentManager.getDocuments({
                limit,
                skip,
                category,
                activeOnly: true,
                sortBy: 'createdAt',
                sortOrder: -1
            });

            if (result.documents.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#ffaa00')
                    .setTitle('📚 Knowledge Base Documents')
                    .setDescription('No documents found in the knowledge base.')
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('📚 Knowledge Base Documents')
                .setDescription(`Showing ${result.documents.length} of ${result.total} documents${category ? ` in category "${category}"` : ''}`)
                .setFooter({ 
                    text: `Page ${page} of ${result.totalPages}` 
                })
                .setTimestamp();

            // Add document fields
            for (const doc of result.documents) {
                const uploadedBy = doc.uploadedBy?.username || 'Unknown';
                const uploadedAt = doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : 'Unknown';
                const usageCount = doc.usageCount || 0;
                
                let fieldValue = `**Category:** ${doc.category}\n`;
                fieldValue += `**Size:** ${(doc.fileSize / 1024).toFixed(1)} KB\n`;
                fieldValue += `**Uploaded by:** ${uploadedBy} on ${uploadedAt}\n`;
                fieldValue += `**Usage:** ${usageCount} times\n`;
                fieldValue += `**ID:** \`${doc._id}\``;

                if (doc.description) {
                    fieldValue += `\n**Description:** ${doc.description.substring(0, 100)}${doc.description.length > 100 ? '...' : ''}`;
                }

                embed.addFields({
                    name: `📄 ${doc.title}`,
                    value: fieldValue,
                    inline: false
                });
            }

            // Add navigation info if there are multiple pages
            if (result.totalPages > 1) {
                let navigationText = '';
                if (page > 1) {
                    navigationText += `Use \`/list-documents page:${page - 1}\` for previous page\n`;
                }
                if (page < result.totalPages) {
                    navigationText += `Use \`/list-documents page:${page + 1}\` for next page`;
                }
                
                if (navigationText) {
                    embed.addFields({
                        name: '📖 Navigation',
                        value: navigationText,
                        inline: false
                    });
                }
            }

            await interaction.editReply({ embeds: [embed] });

            // Log the action
            logger.info(`Documents listed by ${interaction.user.username} (${interaction.user.id}) - Page ${page}, Category: ${category || 'all'}`);

        } catch (error) {
            logger.error('Error in list-documents command:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Error Listing Documents')
                .setDescription('An error occurred while retrieving the documents.')
                .addFields(
                    { name: 'Error Details', value: error.message || 'Unknown error', inline: false }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },
};
