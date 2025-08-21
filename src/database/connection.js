const mongoose = require("mongoose");
const config = require("../config/environment");
const logger = require("../utils/logger");

const connectDB = async () => {
  const startTime = new Date();
  console.log(
    `[${startTime.toISOString()}] [DB Connection] Attempting to connect to MongoDB...`
  );
  console.log(
    `[${startTime.toISOString()}] [DB Connection] URL: ${config.database.url}`
  );
  console.log(
    `[${startTime.toISOString()}] [DB Connection] DB Name: ${
      config.database.name
    }`
  );

  try {
    console.log(
      `[${new Date().toISOString()}] [DB Connection] Starting connection attempt...`
    );
    await mongoose.connect(config.database.url, {
      dbName: config.database.name,
    });
    const endTime = new Date();
    const duration = (endTime - startTime) / 1000;
    console.log(
      `[${endTime.toISOString()}] [DB Connection] MongoDB connected successfully! (took ${duration.toFixed(
        2
      )}s)`
    );
    logger.info("MongoDB connected successfully!");
  } catch (error) {
    const errorTime = new Date();
    console.error(
      `[${errorTime.toISOString()}] [DB Connection] MongoDB connection error:`,
      error
    );
    console.error(
      `[${errorTime.toISOString()}] [DB Connection] Detailed error:`,
      error.message
    );
    console.error(
      `[${errorTime.toISOString()}] [DB Connection] Error stack:`,
      error.stack
    );
    logger.error("MongoDB connection error:", error);
    process.exit(1); // Exit process with failure
  }
};

module.exports = connectDB;
