const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Document } = require('../database/models');
const DocumentManager = require('../services/documentManager');
const DatabaseUtils = require('../utils/dbUtils');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('debug-search')
        .setDescription('Debug document search functionality (Admin only)')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Search query to test')
                .setRequired(false)
                .setMaxLength(100))
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Debug action to perform')
                .setRequired(false)
                .addChoices(
                    { name: 'Test Search', value: 'search' },
                    { name: 'List Documents', value: 'list' },
                    { name: 'Database Stats', value: 'stats' },
                    { name: 'Check Indexes', value: 'indexes' }
                ))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const query = interaction.options.getString('query') || 'lil gargs';
            const action = interaction.options.getString('action') || 'search';
            const documentManager = new DocumentManager();

            let embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🔍 Search Debug Results')
                .setTimestamp();

            switch (action) {
                case 'search':
                    await debugSearch(embed, query, documentManager);
                    break;
                case 'list':
                    await debugList(embed);
                    break;
                case 'stats':
                    await debugStats(embed);
                    break;
                case 'indexes':
                    await debugIndexes(embed);
                    break;
                default:
                    embed.setDescription('Invalid action specified');
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            logger.error('Error in debug-search command:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Debug Error')
                .setDescription('An error occurred while running the debug command.')
                .addFields({
                    name: 'Error Details',
                    value: error.message || 'Unknown error',
                    inline: false
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },
};

async function debugSearch(embed, query, documentManager) {
    try {
        embed.setDescription(`Testing search functionality with query: "${query}"`);
        
        // Get total document count
        const totalDocs = await Document.countDocuments({ isActive: true });
        
        // Test the search
        const searchResults = await documentManager.searchDocuments(query, {
            limit: 5,
            activeOnly: true
        });

        embed.addFields(
            { name: 'Total Active Documents', value: totalDocs.toString(), inline: true },
            { name: 'Search Results Found', value: searchResults.length.toString(), inline: true },
            { name: 'Query Used', value: query, inline: true }
        );

        if (searchResults.length > 0) {
            const resultsList = searchResults.map((doc, index) => 
                `${index + 1}. **${doc.title}** (${doc.filename})`
            ).join('\n');
            
            embed.addFields({
                name: 'Found Documents',
                value: resultsList.length > 1024 ? resultsList.substring(0, 1021) + '...' : resultsList,
                inline: false
            });
        } else {
            embed.addFields({
                name: 'No Results',
                value: 'No documents found matching the search query. This might indicate an indexing issue.',
                inline: false
            });
        }

        // Test direct text search
        try {
            const directResults = await Document.find({
                $text: { $search: query },
                isActive: true
            }).limit(3);
            
            embed.addFields({
                name: 'Direct Text Search',
                value: `Found ${directResults.length} documents using MongoDB text search`,
                inline: true
            });
        } catch (textError) {
            embed.addFields({
                name: 'Direct Text Search',
                value: `❌ Failed: ${textError.message}`,
                inline: true
            });
        }

    } catch (error) {
        embed.addFields({
            name: 'Search Test Error',
            value: error.message,
            inline: false
        });
    }
}

async function debugList(embed) {
    try {
        const documents = await Document.find({ isActive: true })
            .select('title filename category processingStatus createdAt')
            .sort({ createdAt: -1 })
            .limit(10);

        embed.setDescription(`Listing recent documents (showing ${documents.length} of active documents)`);

        if (documents.length > 0) {
            const docList = documents.map((doc, index) => 
                `${index + 1}. **${doc.title}** (${doc.category}) - ${doc.processingStatus}`
            ).join('\n');
            
            embed.addFields({
                name: 'Recent Documents',
                value: docList.length > 1024 ? docList.substring(0, 1021) + '...' : docList,
                inline: false
            });
        } else {
            embed.addFields({
                name: 'No Documents',
                value: 'No active documents found in the database.',
                inline: false
            });
        }

    } catch (error) {
        embed.addFields({
            name: 'List Error',
            value: error.message,
            inline: false
        });
    }
}

async function debugStats(embed) {
    try {
        const stats = await DatabaseUtils.getDatabaseStats();
        
        embed.setDescription('Database statistics and health check');
        embed.addFields(
            { name: 'Total Documents', value: stats.totalDocuments.toString(), inline: true },
            { name: 'Active Documents', value: stats.activeDocuments.toString(), inline: true },
            { name: 'Processed Documents', value: stats.processedDocuments.toString(), inline: true },
            { name: 'Pending Processing', value: stats.pendingDocuments.toString(), inline: true },
            { name: 'Failed Processing', value: stats.failedDocuments.toString(), inline: true }
        );

        const processingRate = stats.totalDocuments > 0 
            ? ((stats.processedDocuments / stats.totalDocuments) * 100).toFixed(1)
            : '0';
        
        embed.addFields({
            name: 'Processing Rate',
            value: `${processingRate}%`,
            inline: true
        });

    } catch (error) {
        embed.addFields({
            name: 'Stats Error',
            value: error.message,
            inline: false
        });
    }
}

async function debugIndexes(embed) {
    try {
        const created = await DatabaseUtils.ensureTextIndexes();
        
        embed.setDescription('Text index status and creation');
        embed.addFields({
            name: 'Index Status',
            value: created ? '✅ Text indexes were created' : '✅ Text indexes already exist',
            inline: false
        });

        // Test if text search works now
        try {
            const testResult = await Document.find({
                $text: { $search: 'test' }
            }).limit(1);
            
            embed.addFields({
                name: 'Text Search Test',
                value: '✅ Text search is working correctly',
                inline: false
            });
        } catch (testError) {
            embed.addFields({
                name: 'Text Search Test',
                value: `❌ Text search still failing: ${testError.message}`,
                inline: false
            });
        }

    } catch (error) {
        embed.addFields({
            name: 'Index Error',
            value: error.message,
            inline: false
        });
    }
}
