#!/usr/bin/env node

/**
 * Database debugging script
 * Usage: node scripts/debug-database.js [command]
 * 
 * Commands:
 *   indexes    - Check and create text indexes
 *   search     - Test document search functionality
 *   list       - List all documents
 *   stats      - Show database statistics
 *   recreate   - Recreate text indexes (use with caution)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../src/config/environment');
const DatabaseUtils = require('../src/utils/dbUtils');
const logger = require('../src/utils/logger');

async function main() {
    const command = process.argv[2] || 'help';
    const searchQuery = process.argv[3] || 'lil gargs';

    try {
        // Connect to database
        await mongoose.connect(config.database.url, {
            dbName: config.database.name,
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        
        logger.info('Connected to MongoDB successfully');

        switch (command.toLowerCase()) {
            case 'indexes':
                logger.info('Checking and ensuring text indexes...');
                const created = await DatabaseUtils.ensureTextIndexes();
                if (created) {
                    logger.info('✅ Text indexes created');
                } else {
                    logger.info('✅ Text indexes already exist');
                }
                break;

            case 'search':
                logger.info(`Testing search functionality with query: "${searchQuery}"`);
                await DatabaseUtils.testDocumentSearch(searchQuery);
                break;

            case 'list':
                logger.info('Listing all documents...');
                await DatabaseUtils.listAllDocuments();
                break;

            case 'stats':
                logger.info('Getting database statistics...');
                await DatabaseUtils.getDatabaseStats();
                break;

            case 'recreate':
                logger.info('⚠️  Recreating text indexes...');
                await DatabaseUtils.recreateTextIndexes();
                logger.info('✅ Text indexes recreated');
                break;

            case 'help':
            default:
                console.log(`
Database Debugging Script

Usage: node scripts/debug-database.js [command] [query]

Commands:
  indexes    - Check and create text indexes
  search     - Test document search functionality (optional query parameter)
  list       - List all documents in the database
  stats      - Show database statistics
  recreate   - Recreate text indexes (use with caution)
  help       - Show this help message

Examples:
  node scripts/debug-database.js indexes
  node scripts/debug-database.js search "lil gargs"
  node scripts/debug-database.js list
  node scripts/debug-database.js stats
                `);
                break;
        }

    } catch (error) {
        logger.error('Script error:', error);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        logger.info('Database connection closed');
        process.exit(0);
    }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

main();
