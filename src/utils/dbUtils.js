const mongoose = require('mongoose');
const { Document } = require('../database/models');
const logger = require('./logger');

/**
 * Database utility functions for debugging and maintenance
 */
class DatabaseUtils {
    /**
     * Check if text indexes exist and create them if needed
     */
    static async ensureTextIndexes() {
        try {
            const db = mongoose.connection.db;
            const documentsCollection = db.collection('documents');
            
            // Get all indexes
            const indexes = await documentsCollection.indexes();
            logger.info('Current indexes:', indexes.map(idx => ({ name: idx.name, key: idx.key })));
            
            // Check for text index
            const hasTextIndex = indexes.some(index => 
                index.key && (index.key._fts === 'text' || Object.values(index.key).includes('text'))
            );
            
            if (!hasTextIndex) {
                logger.info('Creating text index for documents collection...');
                await documentsCollection.createIndex(
                    { 
                        title: 'text', 
                        content: 'text', 
                        description: 'text' 
                    },
                    {
                        name: 'document_text_index',
                        weights: {
                            title: 10,
                            content: 5,
                            description: 3
                        }
                    }
                );
                logger.info('Text index created successfully');
                return true;
            } else {
                logger.info('Text index already exists');
                return false;
            }
        } catch (error) {
            logger.error('Error ensuring text indexes:', error);
            throw error;
        }
    }

    /**
     * Test document search functionality
     */
    static async testDocumentSearch(query = 'test') {
        try {
            logger.info(`Testing document search with query: "${query}"`);
            
            // Get total document count
            const totalDocs = await Document.countDocuments({ isActive: true });
            logger.info(`Total active documents: ${totalDocs}`);
            
            if (totalDocs === 0) {
                logger.warn('No active documents found in database');
                return;
            }
            
            // Test text search
            try {
                const textSearchResults = await Document.find({
                    $text: { $search: query },
                    isActive: true
                })
                .select('title filename description')
                .limit(5)
                .sort({ score: { $meta: 'textScore' } });
                
                logger.info(`Text search results: ${textSearchResults.length} documents found`);
                textSearchResults.forEach(doc => {
                    logger.info(`- ${doc.title} (${doc.filename})`);
                });
                
            } catch (textSearchError) {
                logger.warn('Text search failed:', textSearchError.message);
                
                // Try fallback regex search
                const regexResults = await Document.find({
                    $or: [
                        { title: new RegExp(query, 'i') },
                        { content: new RegExp(query, 'i') },
                        { description: new RegExp(query, 'i') }
                    ],
                    isActive: true
                })
                .select('title filename description')
                .limit(5);
                
                logger.info(`Regex search results: ${regexResults.length} documents found`);
                regexResults.forEach(doc => {
                    logger.info(`- ${doc.title} (${doc.filename})`);
                });
            }
            
        } catch (error) {
            logger.error('Error testing document search:', error);
            throw error;
        }
    }

    /**
     * List all documents in the database
     */
    static async listAllDocuments() {
        try {
            const documents = await Document.find({ isActive: true })
                .select('title filename description category processingStatus createdAt')
                .sort({ createdAt: -1 });
            
            logger.info(`Found ${documents.length} active documents:`);
            documents.forEach((doc, index) => {
                logger.info(`${index + 1}. ${doc.title} (${doc.filename}) - ${doc.category} - ${doc.processingStatus}`);
            });
            
            return documents;
        } catch (error) {
            logger.error('Error listing documents:', error);
            throw error;
        }
    }

    /**
     * Get database statistics
     */
    static async getDatabaseStats() {
        try {
            const stats = {
                totalDocuments: await Document.countDocuments(),
                activeDocuments: await Document.countDocuments({ isActive: true }),
                processedDocuments: await Document.countDocuments({ isProcessed: true }),
                pendingDocuments: await Document.countDocuments({ processingStatus: 'pending' }),
                failedDocuments: await Document.countDocuments({ processingStatus: 'failed' })
            };
            
            logger.info('Database Statistics:', stats);
            return stats;
        } catch (error) {
            logger.error('Error getting database stats:', error);
            throw error;
        }
    }

    /**
     * Drop and recreate text indexes (use with caution)
     */
    static async recreateTextIndexes() {
        try {
            const db = mongoose.connection.db;
            const documentsCollection = db.collection('documents');
            
            // Drop existing text index if it exists
            try {
                await documentsCollection.dropIndex('document_text_index');
                logger.info('Dropped existing text index');
            } catch (error) {
                logger.info('No existing text index to drop');
            }
            
            // Create new text index
            await documentsCollection.createIndex(
                { 
                    title: 'text', 
                    content: 'text', 
                    description: 'text' 
                },
                {
                    name: 'document_text_index',
                    weights: {
                        title: 10,
                        content: 5,
                        description: 3
                    }
                }
            );
            
            logger.info('Text index recreated successfully');
            return true;
        } catch (error) {
            logger.error('Error recreating text indexes:', error);
            throw error;
        }
    }
}

module.exports = DatabaseUtils;
