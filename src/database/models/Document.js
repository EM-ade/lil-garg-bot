const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    // Document identification
    title: {
      type: String,
      required: true,
      trim: true,
    },
    filename: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Document content
    content: {
      type: String,
      required: true,
    },
    contentType: {
      type: String,
      enum: ["text", "markdown", "pdf", "docx", "txt"],
      default: "text",
    },

    // Document metadata
    description: {
      type: String,
      default: "",
    },
    tags: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],
    category: {
      type: String,
      default: "general",
      trim: true,
      lowercase: true,
    },

    // Vector embeddings for AI retrieval
    embeddings: [
      {
        chunk: String,
        vector: [Number],
        chunkIndex: Number,
      },
    ],

    // Document status
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isProcessed: {
      type: Boolean,
      default: false,
      index: true,
    },

    // File information
    fileSize: {
      type: Number,
      default: 0,
    },
    fileHash: {
      type: String,
      unique: true,
      sparse: true,
    },

    // User tracking
    uploadedBy: {
      discordId: String,
      username: String,
      uploadedAt: {
        type: Date,
        default: Date.now,
      },
    },

    // Usage statistics
    usageCount: {
      type: Number,
      default: 0,
    },
    lastUsed: {
      type: Date,
      default: null,
    },

    // Processing information
    processingStatus: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
    },
    processingError: {
      type: String,
      default: null,
    },
    processedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
documentSchema.index({ title: "text", content: "text", description: "text" });
documentSchema.index({ tags: 1, category: 1 });
documentSchema.index({ isActive: 1, isProcessed: 1 });
documentSchema.index({ "uploadedBy.discordId": 1 });

// Instance methods
documentSchema.methods.incrementUsage = function () {
  this.usageCount += 1;
  this.lastUsed = new Date();
  return this.save();
};

documentSchema.methods.updateProcessingStatus = function (
  status,
  error = null
) {
  this.processingStatus = status;
  this.processingError = error;
  if (status === "completed") {
    this.isProcessed = true;
    this.processedAt = new Date();
  }
  return this.save();
};

documentSchema.methods.addEmbedding = function (chunk, vector, chunkIndex) {
  this.embeddings.push({
    chunk,
    vector,
    chunkIndex,
  });
  return this.save();
};

documentSchema.methods.deactivate = function () {
  this.isActive = false;
  return this.save();
};

module.exports = mongoose.model("Document", documentSchema);
