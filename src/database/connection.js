const mongoose = require('mongoose');
const config = require('../config/environment');
const logger = require('../utils/logger');

const connectDB = async () => {
  console.log('[DB Connection] Attempting to connect to MongoDB...');
  console.log(`[DB Connection] URL: ${config.database.url}`);
  console.log(`[DB Connection] DB Name: ${config.database.name}`);
  try {
    await mongoose.connect(config.database.url, {
      dbName: config.database.name,
    });
    logger.info('MongoDB connected successfully!');
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    console.error('Detailed MongoDB connection error:', error);
    process.exit(1); // Exit process with failure
  }
};

module.exports = connectDB;
