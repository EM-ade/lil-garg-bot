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

    // Find documents that have embeddings
    logger.info("\n--- Finding documents with 'embeddings' field ---");
    const docsWithEmbeddings = await Document.find({ "embeddings.0": { "$exists": true } }).limit(3).lean();

    if (docsWithEmbeddings.length > 0) {
      logger.info(`Found ${docsWithEmbeddings.length} documents with embeddings. Displaying first 3:`);
      docsWithEmbeddings.forEach((doc, index) => {
        console.log(`\n--- Document ${index + 1} (ID: ${doc._id}) ---`);
        console.log(`Title: ${doc.title}`);
        console.log(`Filename: ${doc.filename}`);
        console.log(`Number of embeddings chunks: ${doc.embeddings ? doc.embeddings.length : 0}`);
        if (doc.embeddings && doc.embeddings.length > 0) {
          console.log("First embedding chunk structure:");
          console.log(JSON.stringify(doc.embeddings[0], null, 2));
        } else {
          console.log("No embeddings found in this document.");
        }
      });
    } else {
      logger.info("No documents found with embeddings.");
    }

  } catch (error) {
    logger.error("Error during debug checks:", error);
  } finally {
    await mongoose.disconnect();
    logger.info("MongoDB disconnected.");
  }
}

runDebugChecks();