const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Document } = require('../database/models');
const DocumentManager = require('./documentManager');
const config = require('../config/environment');
const logger = require('../utils/logger');

class AIChatbot {
    constructor() {
        this.genAI = new GoogleGenerativeAI(config.ai.geminiApiKey);
        this.model = this.genAI.getGenerativeModel({ model: config.ai.model });
        this.documentManager = new DocumentManager();
        this.maxContextLength = 4000; // Maximum characters for context
        this.systemPrompt = this.buildSystemPrompt();
    }

    /**
     * Build the system prompt for the AI
     */
    buildSystemPrompt() {
        return `You are an AI assistant for the Lil Gargs NFT community. Your role is to answer questions about Lil Gargs based ONLY on the provided knowledge base documents.

IMPORTANT RULES:
1. ONLY answer questions using information from the provided documents
2. If the information is not in the documents, say "I don't have information about that in my knowledge base"
3. Always be helpful, friendly, and community-focused
4. When referencing information, mention it comes from the knowledge base
5. Do not make up or hallucinate any information
6. Keep responses concise but informative
7. If asked about topics unrelated to Lil Gargs, politely redirect to Lil Gargs topics

You represent the Lil Gargs community, so maintain a positive and engaging tone while being accurate and truthful.`;
    }

    /**
     * Search for relevant documents based on the user's query
     */
    async findRelevantDocuments(query, maxDocuments = 5) {
        try {
            // Search documents using text search
            const searchResults = await this.documentManager.searchDocuments(query, {
                limit: maxDocuments,
                activeOnly: true
            });

            // If no results from text search, try to get recent documents
            if (searchResults.length === 0) {
                const recentDocs = await this.documentManager.getDocuments({
                    limit: 3,
                    activeOnly: true,
                    sortBy: 'lastUsed',
                    sortOrder: -1
                });
                return recentDocs.documents;
            }

            return searchResults;
        } catch (error) {
            logger.error('Error finding relevant documents:', error);
            return [];
        }
    }

    /**
     * Extract relevant content from documents for context
     */
    async extractRelevantContent(documents, query) {
        let context = '';
        let totalLength = 0;

        for (const doc of documents) {
            try {
                // Get full document content
                const fullDoc = await Document.findById(doc._id);
                if (!fullDoc || !fullDoc.content) continue;

                // For now, we'll use simple text matching to find relevant sections
                // In a more advanced implementation, you would use vector similarity
                const content = fullDoc.content;
                const queryWords = query.toLowerCase().split(' ');
                
                // Find paragraphs that contain query words
                const paragraphs = content.split('\n\n');
                const relevantParagraphs = paragraphs.filter(paragraph => {
                    const lowerParagraph = paragraph.toLowerCase();
                    return queryWords.some(word => lowerParagraph.includes(word));
                });

                // If no relevant paragraphs found, take the first few paragraphs
                const contentToAdd = relevantParagraphs.length > 0 
                    ? relevantParagraphs.slice(0, 3).join('\n\n')
                    : paragraphs.slice(0, 2).join('\n\n');

                const docContext = `\n--- From "${fullDoc.title}" ---\n${contentToAdd}\n`;
                
                if (totalLength + docContext.length <= this.maxContextLength) {
                    context += docContext;
                    totalLength += docContext.length;
                    
                    // Increment usage count
                    await fullDoc.incrementUsage();
                } else {
                    break;
                }
            } catch (error) {
                logger.error(`Error processing document ${doc._id}:`, error);
                continue;
            }
        }

        return context;
    }

    /**
     * Generate AI response based on user query and context
     */
    async generateResponse(userQuery, context) {
        try {
            const prompt = `${this.systemPrompt}

KNOWLEDGE BASE CONTEXT:
${context}

USER QUESTION: ${userQuery}

Please provide a helpful response based on the knowledge base context above. If the information needed to answer the question is not in the context, say so clearly.`;

            const result = await this.model.generateContent(prompt);
            const response = result.response;
            const text = response.text();

            return {
                response: text,
                hasContext: context.length > 0,
                contextLength: context.length
            };
        } catch (error) {
            logger.error('Error generating AI response:', error);
            throw new Error('Failed to generate AI response');
        }
    }

    /**
     * Process a user's chat message and return AI response
     */
    async processMessage(userQuery, userId = null) {
        try {
            logger.info(`Processing AI chat message: "${userQuery}" from user ${userId}`);

            // Find relevant documents
            const relevantDocs = await this.findRelevantDocuments(userQuery);
            
            if (relevantDocs.length === 0) {
                return {
                    response: "I don't have any information about that in my knowledge base. Please make sure documents about Lil Gargs have been added to help me answer your questions!",
                    hasContext: false,
                    documentsUsed: 0
                };
            }

            // Extract relevant content
            const context = await this.extractRelevantContent(relevantDocs, userQuery);

            // Generate AI response
            const aiResult = await this.generateResponse(userQuery, context);

            return {
                response: aiResult.response,
                hasContext: aiResult.hasContext,
                contextLength: aiResult.contextLength,
                documentsUsed: relevantDocs.length,
                documentTitles: relevantDocs.map(doc => doc.title)
            };

        } catch (error) {
            logger.error('Error processing chat message:', error);
            return {
                response: "I'm sorry, I encountered an error while processing your question. Please try again later.",
                hasContext: false,
                documentsUsed: 0,
                error: error.message
            };
        }
    }

    /**
     * Get a summary of available knowledge base topics
     */
    async getKnowledgeBaseSummary() {
        try {
            const docs = await this.documentManager.getDocuments({
                limit: 20,
                activeOnly: true
            });

            if (docs.documents.length === 0) {
                return "No documents are currently available in the knowledge base.";
            }

            const categories = [...new Set(docs.documents.map(doc => doc.category))];
            const totalDocs = docs.total;

            let summary = `I have access to ${totalDocs} document(s) in my knowledge base covering the following topics:\n\n`;
            
            for (const category of categories) {
                const categoryDocs = docs.documents.filter(doc => doc.category === category);
                summary += `**${category.charAt(0).toUpperCase() + category.slice(1)}:**\n`;
                categoryDocs.slice(0, 5).forEach(doc => {
                    summary += `- ${doc.title}\n`;
                });
                if (categoryDocs.length > 5) {
                    summary += `- ... and ${categoryDocs.length - 5} more\n`;
                }
                summary += '\n';
            }

            summary += "Feel free to ask me questions about any of these topics!";
            return summary;

        } catch (error) {
            logger.error('Error getting knowledge base summary:', error);
            return "I'm having trouble accessing my knowledge base right now. Please try again later.";
        }
    }

    /**
     * Validate if a query is appropriate for the AI
     */
    isValidQuery(query) {
        if (!query || typeof query !== 'string') {
            return false;
        }

        const trimmedQuery = query.trim();
        if (trimmedQuery.length < 3 || trimmedQuery.length > 1000) {
            return false;
        }

        // Check for potentially harmful content (basic filter)
        const harmfulPatterns = [
            /\b(hack|exploit|attack|spam|abuse)\b/i,
            /\b(password|token|key|secret)\b/i
        ];

        return !harmfulPatterns.some(pattern => pattern.test(trimmedQuery));
    }

    /**
     * Get AI chat statistics
     */
    async getChatStats() {
        try {
            const totalDocs = await Document.countDocuments({ isActive: true });
            const processedDocs = await Document.countDocuments({ 
                isActive: true, 
                isProcessed: true 
            });

            return {
                totalDocuments: totalDocs,
                processedDocuments: processedDocs,
                processingRate: totalDocs > 0 ? (processedDocs / totalDocs * 100).toFixed(1) : 0
            };
        } catch (error) {
            logger.error('Error getting chat stats:', error);
            return {
                totalDocuments: 0,
                processedDocuments: 0,
                processingRate: 0
            };
        }
    }
}

module.exports = AIChatbot;
