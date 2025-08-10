require("dotenv").config({ path: "./.env" });
const { MongoClient } = require("mongodb");
const config = require("../src/config/environment");
const logger = require("../src/utils/logger");

async function createVectorIndex() {
  const client = new MongoClient(config.database.url);

  try {
    await client.connect();
    const db = client.db(config.database.name);
    const collection = db.collection("documents");

    const indexName = "vector_index";

    // Check if the index already exists using the new listSearchIndexes method
    const searchIndexes = await collection.listSearchIndexes(indexName).toArray();
    if (searchIndexes.length > 0) {
      logger.info(`Search index '${indexName}' already exists.`);
      // Optional: drop and recreate if you want to update the definition
      // logger.info(`Dropping existing search index '${indexName}'.`);
      // await collection.dropSearchIndex(indexName);
      // logger.info(`Dropped search index '${indexName}'.`);
    }


    logger.info(`Creating search index '${indexName}'...`);
    // Create the vector search index
    await collection.createSearchIndex({
      name: indexName,
      type: "vectorSearch",
      definition: {
        fields: [
          {
            type: "vector",
            path: "embeddings.vector",
            numDimensions: 1536, // Match the embedding model's dimensions, e.g., 1536 for OpenAI Ada v2
            similarity: "cosine",
          },
        ],
      },
    });

    logger.info(`Successfully created search index '${indexName}'`);

  } catch (error) {
    logger.error("Error creating vector search index:", error);
  } finally {
    await client.close();
  }
}

createVectorIndex();