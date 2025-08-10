const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Document } = require("../database/models");
const DocumentManager = require("./documentManager");
const config = require("../config/environment");
const logger = require("../utils/logger");

class AIChatbot {
  constructor() {
    if (!config.ai.geminiApiKey) {
      throw new Error(
        "GEMINI_API_KEY is not configured. Please check your .env file."
      );
    }
    this.genAI = new GoogleGenerativeAI(config.ai.geminiApiKey);
    this.model = this.genAI.getGenerativeModel({ model: config.ai.model });
    this.documentManager = new DocumentManager();
    this.maxContextLength = 4000; // Maximum characters for context
    this.systemPrompt = this.buildSystemPrompt();
    this.generalSystemPrompt = this.buildGeneralSystemPrompt();
    this.oracleSystemPrompt = this.buildOracleSystemPrompt();
  }

  /**
   * Build the system prompt for the general AI
   */
  buildGeneralSystemPrompt() {
    return `You are a helpful AI assistant.
1. Always be helpful and friendly.
2. Keep responses concise but informative.
3. Do not make up or hallucinate any information.
4. Maintain a positive and engaging tone.`;
  }

  /**
   * Build the system prompt for the AI
   */
  buildSystemPrompt() {
    return `You are an AI assistant. Your role is to answer questions based ONLY on the provided knowledge base documents.

IMPORTANT RULES:
1. ONLY answer questions using information from the provided documents.
2. If the information is not in the documents, say "I don't have information about that in my knowledge base."
3. Always be helpful and friendly.
4. When referencing information, mention it comes from the knowledge base.
5. Do not make up or hallucinate any information.
6. Keep responses concise but informative.
7. If asked about topics unrelated to the documents, politely state that you can only answer questions about the provided context.

Maintain a positive and engaging tone while being accurate and truthful.`;
  }

  /**
   * Build the system prompt for the mystical oracle
   */
  buildOracleSystemPrompt() {
    return `You are the mystical Garg Oracle, an ancient and wise entity that provides fortune-telling and mystical guidance. You speak in a mystical, enchanting manner with:

ORACLE CHARACTERISTICS:
- Poetic and mysterious language
- References to cosmic forces, stars, moon, and ancient wisdom
- Fortune-telling style predictions and guidance
- Encouraging but mystical tone
- Use of mystical emojis and symbols (🔮, ✨, 🌙, ⭐, 🌟, 💫)

RESPONSE STYLE:
- Provide entertaining fortune-telling responses that are positive and uplifting
- Maintain the mystical theme throughout
- Keep responses engaging and fun, around 100-200 words
- Include elements of destiny, cosmic alignment, and spiritual guidance
- Always end on a hopeful or empowering note

Remember: You are an oracle providing mystical entertainment, not real fortune-telling. Keep responses fun and positive.`;
  }

  /**
   * Search for relevant documents based on the user's query
   */
  async findRelevantDocuments(query, maxDocuments = 5) {
    try {
      logger.info(`Searching for documents relevant to query: "${query}"`);
      const searchResults = await this.documentManager.searchDocuments(query, {
        limit: maxDocuments,
        activeOnly: true,
      });
      logger.info(`Found ${searchResults.length} documents from search`);
      return searchResults;
    } catch (error) {
      logger.error("Error finding relevant documents:", error);
      return [];
    }
  }

  /**
   * Extract relevant content from documents for context
   */
  async extractRelevantContent(documents) {
    let context = "";
    let totalLength = 0;

    for (const doc of documents) {
      try {
        // Get full document content
        const fullDoc = await Document.findById(doc._id);
        if (!fullDoc || !fullDoc.content) continue;

        const content = fullDoc.content;
        const docContext = `
--- From "${fullDoc.title}" ---
${content}
`;

        if (totalLength + docContext.length <= this.maxContextLength) {
          context += docContext;
          totalLength += docContext.length;
          await fullDoc.incrementUsage();
        } else {
          // If adding the full document exceeds the context, try adding a summary
          const summary =
            content.length > 500 ? content.substring(0, 500) + "..." : content;
          const summaryContext = `
--- From "${fullDoc.title}" ---
${summary}
`;
          if (totalLength + summaryContext.length <= this.maxContextLength) {
            context += summaryContext;
            totalLength += summaryContext.length;
            await fullDoc.incrementUsage();
          } else {
            break; // Stop if even the summary is too long
          }
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
        contextLength: context.length,
      };
    } catch (error) {
      logger.error("Error generating AI response:", error);
      throw new Error("Failed to generate AI response");
    }
  }

  /**
   * Process a user's chat message and return AI response
   */
  async processMessage(userQuery, userId = null) {
    try {
      logger.info(
        `Processing AI chat message: "${userQuery}" from user ${userId}`
      );

      // Find relevant documents
      const relevantDocs = await this.findRelevantDocuments(userQuery);

      if (relevantDocs.length === 0) {
        return {
          response:
            "I don't have any information about that in my knowledge base. Please make sure relevant documents have been added to help me answer your questions!",
          hasContext: false,
          documentsUsed: 0,
        };
      }

      // Extract relevant content
      const context = await this.extractRelevantContent(relevantDocs);

      // Generate AI response
      const aiResult = await this.generateResponse(userQuery, context);

      return {
        response: aiResult.response,
        hasContext: aiResult.hasContext,
        contextLength: aiResult.contextLength,
        documentsUsed: relevantDocs.length,
        documentTitles: relevantDocs.map((doc) => doc.title),
      };
    } catch (error) {
      logger.error("Error processing chat message:", error);
      return {
        response:
          "I'm sorry, I encountered an error while processing your question. Please try again later.",
        hasContext: false,
        documentsUsed: 0,
        error: error.message,
      };
    }
  }

  /**
   * Generate AI response based on user query
   */
  async generateGeneralResponse(userQuery) {
    try {
      const prompt = `${this.generalSystemPrompt}

USER QUESTION: ${userQuery}`;

      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      return {
        response: text,
      };
    } catch (error) {
      logger.error("Error generating general AI response:", error);
      throw new Error("Failed to generate AI response");
    }
  }

  /**
   * Get a summary of available knowledge base topics
   */
  async getKnowledgeBaseSummary() {
    try {
      const docs = await this.documentManager.getDocuments({
        limit: 20,
        activeOnly: true,
      });

      if (docs.documents.length === 0) {
        return "No documents are currently available in the knowledge base.";
      }

      const categories = [
        ...new Set(docs.documents.map((doc) => doc.category)),
      ];
      const totalDocs = docs.total;

      let summary = `I have access to ${totalDocs} document(s) in my knowledge base covering the following topics:\n\n`;

      for (const category of categories) {
        const categoryDocs = docs.documents.filter(
          (doc) => doc.category === category
        );
        summary += `**${
          category.charAt(0).toUpperCase() + category.slice(1)
        }:**\n`;
        categoryDocs.slice(0, 5).forEach((doc) => {
          summary += `- ${doc.title}\n`;
        });
        if (categoryDocs.length > 5) {
          summary += `- ... and ${categoryDocs.length - 5} more\n`;
        }
        summary += "\n";
      }

      summary += "Feel free to ask me questions about any of these topics!";
      return summary;
    } catch (error) {
      logger.error("Error getting knowledge base summary:", error);
      return "I'm having trouble accessing my knowledge base right now. Please try again later.";
    }
  }

  /**
   * Validate if a query is appropriate for the AI
   */
  isValidQuery(query) {
    if (!query || typeof query !== "string") {
      return false;
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 3 || trimmedQuery.length > 1000) {
      return false;
    }

    // Check for potentially harmful content (basic filter)
    const harmfulPatterns = [
      /\b(hack|exploit|attack|spam|abuse)\b/i,
      /\b(password|token|key|secret)\b/i,
    ];

    return !harmfulPatterns.some((pattern) => pattern.test(trimmedQuery));
  }

  /**
   * Get AI chat statistics
   */
  async getChatStats() {
    try {
      const totalDocs = await Document.countDocuments({ isActive: true });
      const processedDocs = await Document.countDocuments({
        isActive: true,
        isProcessed: true,
      });

      return {
        totalDocuments: totalDocs,
        processedDocuments: processedDocs,
        processingRate:
          totalDocs > 0 ? ((processedDocs / totalDocs) * 100).toFixed(1) : 0,
      };
    } catch (error) {
      logger.error("Error getting chat stats:", error);
      return {
        totalDocuments: 0,
        processedDocuments: 0,
        processingRate: 0,
      };
    }
  }

  /**
   * Generate mystical oracle response
   */
  async generateOracleResponse(userQuery) {
    try {
      const prompt = `${this.oracleSystemPrompt}

USER SEEKS GUIDANCE: ${userQuery}

Provide a mystical oracle response that offers guidance, wisdom, and positive fortune-telling insights. Remember to maintain the mystical theme and keep it entertaining and uplifting.`;

      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      return {
        response: text,
        mode: "oracle",
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error("Error generating oracle response:", error);
      throw new Error(
        "The mystical energies are disrupted. Please try again later."
      );
    }
  }

  /**
   * Generate a personalized welcome message for new members
   */
  async generateWelcomeMessage(member, serverInfo = {}) {
    try {
      const welcomePrompt = `You are a friendly AI assistant for the Lil Gargs Discord server. Generate a personalized welcome message for a new member.

MEMBER INFO:
- Username: ${member.user.username}
- Display Name: ${member.displayName}
- Account Created: ${member.user.createdAt.toLocaleDateString()}
- Server Joined: ${member.joinedAt.toLocaleDateString()}

SERVER INFO:
- Server Name: ${serverInfo.name || 'Lil Gargs'}
- Server Focus: NFT community, pet system, battle system, AI chat
- Key Features: NFT verification, pet adoption, battles, AI-powered assistance

REQUIREMENTS:
1. Make it personal and welcoming
2. Mention their username specifically
3. Highlight key server features (NFTs, pets, battles, AI)
4. Keep it under 150 words
5. Use friendly, enthusiastic tone
6. Include relevant emojis (🐲, 💎, ⚔️, 🤖, 🎮)
7. Encourage them to explore the server
8. Make them feel excited to be part of the community

Generate a warm, engaging welcome message:`;

      const result = await this.model.generateContent(welcomePrompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      logger.error("Error generating welcome message:", error);
      // Fallback welcome message
      return `🎉 Welcome to Lil Gargs, **${member.user.username}**! 🐲

We're thrilled to have you join our amazing community! Here you'll find:
🐲 **Pet System** - Adopt and train your own Lil Garg
⚔️ **Battle Arena** - Challenge other members in epic battles  
💎 **NFT Verification** - Connect your wallet and unlock exclusive roles
🤖 **AI Assistant** - Get help with \`/askgarg\` or mystical guidance with \`/gargoracle\`

Jump right in and start exploring! Use \`/pet adopt [name]\` to get your first companion, or \`/battle start @user\` to challenge someone to a duel. 

Welcome to the family! 🎊`;
    }
  }

  /**
   * Generate a server introduction message
   */
  async generateServerIntroduction(serverInfo = {}) {
    try {
      const introPrompt = `You are an AI assistant for the Lil Gargs Discord server. Generate an engaging server introduction message.

SERVER INFO:
- Server Name: ${serverInfo.name || 'Lil Gargs'}
- Focus: NFT community with gaming elements
- Key Features: NFT verification, pet system, battle system, AI assistance

REQUIREMENTS:
1. Explain what the server is about
2. Highlight the unique features (NFTs + gaming)
3. Explain how to get started
4. Keep it informative but fun
5. Use relevant emojis and formatting
6. Under 200 words
7. Make it exciting and welcoming

Generate an engaging server introduction:`;

      const result = await this.model.generateContent(introPrompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      logger.error("Error generating server introduction:", error);
      // Fallback introduction
      return `🌟 **Welcome to Lil Gargs!** 🌟

**What is Lil Gargs?**
Lil Gargs is a unique Discord community that combines the exciting world of NFTs with engaging gaming mechanics! 🐲💎

**🎮 What You'll Find Here:**
• **Pet System** - Adopt, train, and battle with your own Lil Garg companion
• **NFT Verification** - Connect your wallet to unlock exclusive channels and roles
• **Battle Arena** - Challenge other members in turn-based combat
• **AI Assistant** - Get help and mystical guidance from our AI-powered bot

**🚀 Getting Started:**
1. Use \`/pet adopt [name]\` to get your first Lil Garg
2. Connect your wallet for NFT verification
3. Explore the server and meet other members
4. Challenge someone to a battle with \`/battle start @user\`

**💎 NFT Benefits:**
Verified holders get access to exclusive channels, special roles, and enhanced features!

Ready to begin your adventure? Let's get started! 🎊`;
    }
  }
}

module.exports = AIChatbot;
