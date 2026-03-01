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
    global.mongodbConnected = true;
  } catch (error) {
    const errorTime = new Date();
    console.warn(
      `[${errorTime.toISOString()}] [DB Connection] MongoDB connection failed (non-fatal). Continuing without MongoDB. Error:`,
      error.message
    );
    console.warn(
      `[${errorTime.toISOString()}] [DB Connection] Detailed error:`,
      error.message
    );
    logger.warn("MongoDB connection failed. Continuing without MongoDB.", error);
    global.mongodbConnected = false;
    // Do not exit process; allow bot to start without MongoDB
  }
};

module.exports = connectDB;
