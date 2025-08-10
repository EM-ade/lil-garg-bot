const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const { Document } = require("../database/models");
const logger = require("../utils/logger");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require("../config/environment");

class DocumentManager {
  constructor() {
    this.documentsDir = path.join(__dirname, "../../documents");
    this.maxFileSize = 10 * 1024 * 1024; // 10MB
    this.allowedExtensions = [".txt", ".md", ".pdf", ".docx", ".json"];
    this.chunkSize = 1000; // Characters per chunk for embeddings
    this.chunkOverlap = 200; // Overlap between chunks
    this.genAI = new GoogleGenerativeAI(config.ai.geminiApiKey);
    this.embeddingModel = this.genAI.getGenerativeModel({
      model: "embedding-001",
    });
  }

  /**
   * Initialize the document manager
   */
  async initialize() {
    try {
      await fs.mkdir(this.documentsDir, { recursive: true });
      logger.info("Document manager initialized");
    } catch (error) {
      logger.error("Failed to initialize document manager:", error);
      throw error;
    }
  }

  /**
   * Calculate file hash for duplicate detection
   */
  calculateFileHash(content) {
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  /**
   * Check if content is likely binary
   */
  isBinary(content) {
    // A simple check for null bytes is a good indicator
    return content.includes('\u0000');
  }

  /**
   * Validate file before processing
   */
  validateFile(filename, content) {
    const ext = path.extname(filename).toLowerCase();

    if (!this.allowedExtensions.includes(ext)) {
      throw new Error(
        `File type ${ext} is not allowed. Allowed types: ${this.allowedExtensions.join(
          ", "
        )}`
      );
    }

    if (content.length > this.maxFileSize) {
      throw new Error(
        `File size exceeds maximum limit of ${this.maxFileSize / 1024 / 1024}MB`
      );
    }

    if (content.length === 0) {
      throw new Error("File is empty");
    }

    if (this.isBinary(content)) {
      throw new Error("Binary files are not supported.");
    }
  }

  /**
   * Split text into chunks for embedding
   */
  splitTextIntoChunks(text) {
    const chunks = [];
    let start = 0;

    while (start < text.length) {
      let end = start + this.chunkSize;

      // If we're not at the end, try to break at a sentence or word boundary
      if (end < text.length) {
        const sentenceEnd = text.lastIndexOf(".", end);
        const paragraphEnd = text.lastIndexOf("\n", end);
        const wordEnd = text.lastIndexOf(" ", end);

        // Choose the best breaking point
        if (sentenceEnd > start + this.chunkSize * 0.7) {
          end = sentenceEnd + 1;
        } else if (paragraphEnd > start + this.chunkSize * 0.7) {
          end = paragraphEnd + 1;
        } else if (wordEnd > start + this.chunkSize * 0.7) {
          end = wordEnd + 1;
        }
      }

      const chunk = text.slice(start, end).trim();
      if (chunk.length > 0) {
        chunks.push(chunk);
      }

      start = end - this.chunkOverlap;
    }

    return chunks;
  }

  /**
   * Add a new document to the knowledge base
   */
  async addDocument(filename, content, metadata = {}) {
    try {
      // Validate the file
      this.validateFile(filename, content);

      // Calculate file hash
      const fileHash = this.calculateFileHash(content);

      // Check if document already exists
      const existingDoc = await Document.findOne({ fileHash });
      if (existingDoc) {
        throw new Error("Document with identical content already exists");
      }

      // Check if filename already exists
      const existingFilename = await Document.findOne({ filename });
      if (existingFilename) {
        throw new Error("Document with this filename already exists");
      }

      // Create document record
      const document = new Document({
        title: metadata.title || path.parse(filename).name,
        filename,
        content,
        contentType: this.getContentType(filename),
        description: metadata.description || "",
        tags: metadata.tags || [],
        category: metadata.category || "general",
        fileSize: content.length,
        fileHash,
        uploadedBy: metadata.uploadedBy,
        processingStatus: "pending",
      });

      await document.save();

      // Save file to disk
      const filePath = path.join(this.documentsDir, filename);
      await fs.writeFile(filePath, content, "utf8");

      // Process document for embeddings (async)
      this.processDocumentForEmbeddings(document._id).catch((error) => {
        logger.error(
          `Failed to process embeddings for document ${document._id}:`,
          error
        );
      });

      logger.info(`Document added: ${filename} (${document._id})`);
      return document;
    } catch (error) {
      logger.error("Error adding document:", error);
      throw error;
    }
  }

  /**
   * Remove a document from the knowledge base
   */
  async removeDocument(documentId) {
    try {
      const document = await Document.findById(documentId);
      if (!document) {
        throw new Error("Document not found");
      }

      // Remove file from disk
      const filePath = path.join(this.documentsDir, document.filename);
      try {
        await fs.unlink(filePath);
      } catch (error) {
        logger.warn(`Failed to delete file ${filePath}:`, error.message);
      }

      // Remove from database
      await Document.findByIdAndDelete(documentId);

      logger.info(`Document removed: ${document.filename} (${documentId})`);
      return true;
    } catch (error) {
      logger.error("Error removing document:", error);
      throw error;
    }
  }

  /**
   * Get document content type based on file extension
   */
  getContentType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const typeMap = {
      ".txt": "text",
      ".md": "markdown",
      ".pdf": "pdf",
      ".docx": "docx",
      ".json": "text",
    };
    return typeMap[ext] || "text";
  }

  /**
   * Generate embedding for a text chunk
   */
  async generateEmbedding(text) {
    try {
      const result = await this.embeddingModel.embedContent(text);
      const embedding = result.embedding;
      return embedding.values;
    } catch (error) {
      logger.error("Error generating embedding:", error);
      throw new Error("Failed to generate embedding");
    }
  }

  /**
   * Process document for embeddings
   */
  async processDocumentForEmbeddings(documentId) {
    try {
      const document = await Document.findById(documentId);
      if (!document) {
        throw new Error("Document not found");
      }

      await document.updateProcessingStatus("processing");

      // Split content into chunks
      const chunks = this.splitTextIntoChunks(document.content);

      // Generate embeddings for each chunk
      const embeddings = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const vector = await this.generateEmbedding(chunk);
        embeddings.push({
          chunk,
          vector,
          chunkIndex: i,
        });
      }

      document.embeddings = embeddings;
      await document.updateProcessingStatus("completed");

      logger.info(`Document processed for embeddings: ${document.filename}`);
    } catch (error) {
      const document = await Document.findById(documentId);
      if (document) {
        await document.updateProcessingStatus("failed", error.message);
      }
      throw error;
    }
  }

  /**
   * Search documents by vector similarity
   */
  async searchDocuments(query, options = {}) {
    try {
      const { limit = 5, minScore = 0.75 } = options;

      // First, try vector search
      const vectorResults = await this.searchDocumentsByVector(query, {
        ...options,
        limit,
      });

      // Filter by score and check if we have good results
      const highQualityResults = vectorResults.filter(
        (doc) => doc.score >= minScore
      );

      if (highQualityResults.length > 0) {
        logger.info(
          `Vector search returned ${highQualityResults.length} high-quality results.`
        );
        return highQualityResults;
      }

      // If vector search yields no high-quality results, try text search
      logger.info(
        "Vector search returned no high-quality results, falling back to text search."
      );
      const textResults = await this.searchDocumentsByText(query, options);

      // Combine and de-duplicate results
      const combinedResults = [...vectorResults, ...textResults];
      const uniqueResults = Array.from(
        new Map(combinedResults.map((doc) => [doc._id.toString(), doc])).values()
      );

      // Sort by score if available, otherwise, we can't sort reliably
      uniqueResults.sort((a, b) => (b.score || 0) - (a.score || 0));

      return uniqueResults.slice(0, limit);
    } catch (error) {
      logger.error("Error in hybrid search:", error);
      // If hybrid search fails, fall back to simple text search
      return this.searchDocumentsByText(query, options);
    }
  }

  /**
   * Perform a text-based search on documents
   */
  async searchDocumentsByText(query, options = {}) {
    try {
      const { limit = 10, category = null, tags = null, activeOnly = true } = options;
      const searchFilter = {
        $text: { $search: query },
        ...(activeOnly && { isActive: true }),
        ...(category && { category }),
        ...(tags && { tags: { $in: tags } }),
      };

      const documents = await Document.find(searchFilter, {
        score: { $meta: "textScore" },
      })
        .sort({ score: { $meta: "textScore" } })
        .limit(limit)
        .select("title filename description category tags usageCount lastUsed score");

      logger.info(`Text search found ${documents.length} documents for query: "${query}"`);
      return documents;
    } catch (error) {
      logger.error(`Text search failed for query "${query}":`, error);
      return [];
    }
  }

  /**
   * Search documents by vector similarity
   */
  async searchDocumentsByVector(query, options) {
    try {
      const { limit, category, tags, activeOnly } = options;

      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query);

      const pipeline = [
        {
          $search: {
            index: "vector_index",
            knn: {
              vector: queryEmbedding,
              path: "embeddings.vector",
              k: limit * 2, // Retrieve more candidates for filtering
            },
          },
        },
        {
          $project: {
            title: 1,
            filename: 1,
            description: 1,
            category: 1,
            tags: 1,
            usageCount: 1,
            lastUsed: 1,
            isActive: 1,
            isProcessed: 1,
            score: { $meta: "searchScore" },
          },
        },
      ];

      const filterStage = [];
      if (activeOnly) {
        filterStage.push({ $match: { isActive: true, isProcessed: true } });
      }
      if (category) {
        filterStage.push({ $match: { category: category } });
      }
      if (tags && tags.length > 0) {
        filterStage.push({ $match: { tags: { $in: tags } } });
      }

      if (filterStage.length > 0) {
        pipeline.push(...filterStage);
      }
      
      pipeline.push({ $limit: limit });

      const documents = await Document.aggregate(pipeline);

      logger.info(`Vector search found ${documents.length} documents`);
      return documents;
    } catch (error) {
      logger.error("Vector search failed:", error);
      // Fallback to text search if vector search fails
      logger.info("Falling back to text search due to vector search error.");
      return this.searchDocumentsByText(query, options);
    }
  }

  /**
   * Get all documents with optional filtering
   */
  async getDocuments(options = {}) {
    try {
      const {
        limit = 50,
        skip = 0,
        category = null,
        activeOnly = true,
        sortBy = "createdAt",
        sortOrder = -1,
      } = options;

      const filter = {};

      if (activeOnly) {
        filter.isActive = true;
      }

      if (category) {
        filter.category = category;
      }

      const documents = await Document.find(filter)
        .select(
          "title filename description category tags fileSize usageCount createdAt lastUsed uploadedBy"
        )
        .limit(limit)
        .skip(skip)
        .sort({ [sortBy]: sortOrder });

      const total = await Document.countDocuments(filter);

      return {
        documents,
        total,
        page: Math.floor(skip / limit) + 1,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.error("Error getting documents:", error);
      throw error;
    }
  }

  /**
   * Get document by ID
   */
  async getDocument(documentId) {
    try {
      const document = await Document.findById(documentId);
      if (!document) {
        throw new Error("Document not found");
      }

      await document.incrementUsage();
      return document;
    } catch (error) {
      logger.error("Error getting document:", error);
      throw error;
    }
  }

  /**
   * Update document metadata
   */
  async updateDocument(documentId, updates) {
    try {
      const allowedUpdates = ["title", "description", "tags", "category"];
      const filteredUpdates = {};

      for (const key of allowedUpdates) {
        if (updates[key] !== undefined) {
          filteredUpdates[key] = updates[key];
        }
      }

      const document = await Document.findByIdAndUpdate(
        documentId,
        filteredUpdates,
        { new: true, runValidators: true }
      );

      if (!document) {
        throw new Error("Document not found");
      }

      logger.info(`Document updated: ${document.filename} (${documentId})`);
      return document;
    } catch (error) {
      logger.error("Error updating document:", error);
      throw error;
    }
  }
}

module.exports = DocumentManager;