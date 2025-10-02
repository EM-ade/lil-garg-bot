const mongoose = require("mongoose");
const { Document } = require("../src/database/models");
const config = require("../src/config/environment");
const logger = require("../src/utils/logger");

async function runDebugChecks() {
  try {
    // Connect to MongoDB
    logger.info("Connecting to MongoDB for debug checks...");
    await mongoose.connect(config.database.url, {
      dbName: config.database.name,
    });
    logger.info("MongoDB connected successfully.");

    // 1. List indexes on the 'documents' collection
    logger.info("\n--- Listing indexes on 'documents' collection ---");
    const indexes = await Document.collection.getIndexes();
    console.log(JSON.stringify(indexes, null, 2));

    // 2. Find documents where fileHash is null
    logger.info("\n--- Finding documents with fileHash: null ---");
    const nullFileHashCount = await Document.countDocuments({ fileHash: null });
    logger.info(`Number of documents with fileHash: null: ${nullFileHashCount}`);

    if (nullFileHashCount > 0) {
      logger.info("First 5 documents with fileHash: null:");
      const nullFileHashDocs = await Document.find({ fileHash: null }).limit(5).lean();
      console.log(JSON.stringify(nullFileHashDocs, null, 2));
    } else {
      logger.info("No documents found with fileHash: null.");
    }

    // 3. Find documents where fileHash is an empty string
    logger.info("\n--- Finding documents with fileHash: '' (empty string) ---");
    const emptyFileHashCount = await Document.countDocuments({ fileHash: "" });
    logger.info(`Number of documents with fileHash: '': ${emptyFileHashCount}`);

    if (emptyFileHashCount > 0) {
      logger.info("First 5 documents with fileHash: '' (empty string):");
      const emptyFileHashDocs = await Document.find({ fileHash: "" }).limit(5).lean();
      console.log(JSON.stringify(emptyFileHashDocs, null, 2));
    } else {
      logger.info("No documents found with fileHash: '' (empty string).");
    }

  } catch (error) {
    logger.error("Error during debug checks:", error);
  } finally {
    await mongoose.disconnect();
    logger.info("MongoDB disconnected.");
  }
}

runDebugChecks();