const mongoose = require("mongoose");
const config = require("../config/environment");
const logger = require("../utils/logger");

async function setupDatabase() {
  try {
    await mongoose.connect(config.database.url, {
      dbName: config.database.name,
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    logger.info("Connected to MongoDB successfully");

    // Ensure text indexes are created for document search
    await ensureTextIndexes();

    // Handle connection events
    mongoose.connection.on("error", (error) => {
      logger.error("MongoDB connection error:", error);
    });

    mongoose.connection.on("disconnected", () => {
      logger.warn("MongoDB disconnected");
    });

    mongoose.connection.on("reconnected", () => {
      logger.info("MongoDB reconnected");
    });
  } catch (error) {
    logger.error("Failed to connect to MongoDB:", error);
    throw error;
  }
}

async function ensureTextIndexes() {
  try {
    const db = mongoose.connection.db;
    const documentsCollection = db.collection("documents");

    // Check if text index already exists
    const indexes = await documentsCollection.indexes();
    const hasTextIndex = indexes.some(
      (index) =>
        index.key &&
        (index.key._fts === "text" || Object.values(index.key).includes("text"))
    );

    if (!hasTextIndex) {
      logger.info("Creating text index for documents collection...");
      await documentsCollection.createIndex(
        {
          title: "text",
          content: "text",
          description: "text",
        },
        {
          name: "document_text_index",
          weights: {
            title: 10, // Higher weight for title matches
            content: 5, // Medium weight for content matches
            description: 3, // Lower weight for description matches
          },
        }
      );
      logger.info("Text index created successfully for documents collection");
    } else {
      logger.info("Text index already exists for documents collection");
    }
  } catch (error) {
    logger.error("Error ensuring text indexes:", error);
    // Don't throw error here as it shouldn't prevent the bot from starting
  }
}

async function closeDatabase() {
  try {
    await mongoose.connection.close();
    logger.info("MongoDB connection closed");
  } catch (error) {
    logger.error("Error closing MongoDB connection:", error);
    throw error;
  }
}

module.exports = {
  setupDatabase,
  closeDatabase,
};
