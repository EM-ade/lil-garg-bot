const winston = require('winston');
const path = require('path');

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

const logger = winston.createLogger({
    level: 'debug', // Changed from 'info' to 'debug'
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'lil-gargs-bot' },
    transports: [
        // Write all logs with importance level of `error` or less to `error.log`
        new winston.transports.File({ 
            filename: path.join(logsDir, 'error.log'), 
            level: 'error' 
        }),
        // Write all logs with importance level of `debug` or less to `combined.log`
        new winston.transports.File({
            filename: path.join(logsDir, 'combined.log'),
            level: 'debug' // Ensure debug messages are written to combined.log
        }),
    ],
});

// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
// Always log to the console with debug level for development/debugging
logger.add(new winston.transports.Console({
    level: 'debug', // Ensure debug messages are shown in console
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
    )
}));

module.exports = logger;
