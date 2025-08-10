const mongoose = require('mongoose');
const config = require('../config/environment');
const logger = require('../utils/logger');

async function setupDatabase() {
    try {
        await mongoose.connect(config.database.url, {
            dbName: config.database.name,
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        
        logger.info('Connected to MongoDB successfully');
        
        // Handle connection events
        mongoose.connection.on('error', (error) => {
            logger.error('MongoDB connection error:', error);
        });
        
        mongoose.connection.on('disconnected', () => {
            logger.warn('MongoDB disconnected');
        });
        
        mongoose.connection.on('reconnected', () => {
            logger.info('MongoDB reconnected');
        });
        
    } catch (error) {
        logger.error('Failed to connect to MongoDB:', error);
        throw error;
    }
}

async function closeDatabase() {
    try {
        await mongoose.connection.close();
        logger.info('MongoDB connection closed');
    } catch (error) {
        logger.error('Error closing MongoDB connection:', error);
        throw error;
    }
}

module.exports = {
    setupDatabase,
    closeDatabase
};
