const mongoose = require("mongoose");
const config = require("../src/config/environment");
const logger = require("../src/utils/logger");

async function dropDocumentHashIndex() {
  try {
    logger.info("Connecting to MongoDB to drop index...");
    await mongoose.connect(config.database.url, {
      dbName: config.database.name,
    });
    logger.info("MongoDB connected successfully.");

    logger.info("Attempting to drop index 'document_hash_1' from 'documents' collection...");
    const result = await mongoose.connection.db.collection("documents").dropIndex("document_hash_1");
    logger.info(`Index drop result: ${JSON.stringify(result)}`);
    logger.info("Index 'document_hash_1' dropped successfully.");

  } catch (error) {
    if (error.code === 27) { // IndexNotFound error code
      logger.warn("Index 'document_hash_1' not found. It might have already been dropped or never existed.");
    } else {
      logger.error("Error dropping index 'document_hash_1':", error);
    }
  } finally {
    await mongoose.disconnect();
    logger.info("MongoDB disconnected.");
  }
}

dropDocumentHashIndex();