const { EmbedBuilder } = require('discord.js');
const logger = require('./logger');

class ErrorHandler {
    static async handleCommandError(interaction, error, commandName) {
        logger.error(`Error in command ${commandName}:`, {
            error: error.message,
            stack: error.stack,
            userId: interaction.user.id,
            username: interaction.user.username,
            guildId: interaction.guild?.id,
            channelId: interaction.channel?.id
        });

        const errorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Command Error')
            .setDescription(this.getUserFriendlyErrorMessage(error))
            .addFields(
                { name: 'Command', value: commandName, inline: true },
                { name: 'Error Code', value: this.getErrorCode(error), inline: true }
            )
            .setFooter({ text: 'If this error persists, please contact an administrator.' })
            .setTimestamp();

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        } catch (replyError) {
            logger.error('Failed to send error message to user:', replyError);
        }
    }

    static getUserFriendlyErrorMessage(error) {
        const message = error.message.toLowerCase();

        // Network/API errors
        if (message.includes('network') || message.includes('timeout') || message.includes('econnreset')) {
            return 'Network connection error. Please try again in a moment.';
        }

        // Database errors
        if (message.includes('mongodb') || message.includes('database') || message.includes('connection')) {
            return 'Database connection error. Please try again later.';
        }

        // Discord API errors
        if (message.includes('missing permissions') || message.includes('forbidden')) {
            return 'The bot lacks the necessary permissions to perform this action.';
        }

        if (message.includes('unknown user') || message.includes('unknown member')) {
            return 'User not found. Please make sure you are a member of this server.';
        }

        if (message.includes('unknown role')) {
            return 'Required role not found. Please contact an administrator.';
        }

        // NFT verification errors
        if (message.includes('invalid solana') || message.includes('invalid wallet')) {
            return 'Invalid wallet address. Please provide a valid Solana wallet address.';
        }

        if (message.includes('helius') || message.includes('rpc')) {
            return 'NFT verification service is temporarily unavailable. Please try again later.';
        }

        // AI/Gemini errors
        if (message.includes('gemini') || message.includes('ai') || message.includes('model')) {
            return 'AI service is temporarily unavailable. Please try again later.';
        }

        // File/Document errors
        if (message.includes('file too large') || message.includes('file size')) {
            return 'File is too large. Please use a file smaller than 10MB.';
        }

        if (message.includes('file type') || message.includes('not supported')) {
            return 'File type not supported. Please use .txt, .md, .pdf, or .docx files.';
        }

        if (message.includes('already exists')) {
            return 'A document with this content or filename already exists.';
        }

        // Rate limiting
        if (message.includes('rate limit') || message.includes('too many requests')) {
            return 'Too many requests. Please wait a moment before trying again.';
        }

        // Generic errors
        if (message.includes('validation') || message.includes('invalid')) {
            return 'Invalid input provided. Please check your input and try again.';
        }

        // Default fallback
        return 'An unexpected error occurred. Please try again later.';
    }

    static getErrorCode(error) {
        const message = error.message.toLowerCase();
        
        if (message.includes('network') || message.includes('timeout')) return 'NET_001';
        if (message.includes('database') || message.includes('mongodb')) return 'DB_001';
        if (message.includes('permissions') || message.includes('forbidden')) return 'PERM_001';
        if (message.includes('wallet') || message.includes('solana')) return 'NFT_001';
        if (message.includes('gemini') || message.includes('ai')) return 'AI_001';
        if (message.includes('file')) return 'FILE_001';
        if (message.includes('rate limit')) return 'RATE_001';
        
        return 'GEN_001';
    }

    static async handleServiceError(serviceName, error, context = {}) {
        logger.error(`Error in ${serviceName} service:`, {
            error: error.message,
            stack: error.stack,
            context
        });

        // You could implement service-specific error handling here
        // For example, retry logic, circuit breakers, etc.
    }

    static async handleDatabaseError(operation, error, context = {}) {
        logger.error(`Database error during ${operation}:`, {
            error: error.message,
            stack: error.stack,
            context
        });

        // Implement database-specific error handling
        // For example, connection retry, transaction rollback, etc.
    }

    static async handleAPIError(apiName, error, context = {}) {
        logger.error(`API error for ${apiName}:`, {
            error: error.message,
            stack: error.stack,
            context,
            statusCode: error.response?.status,
            responseData: error.response?.data
        });

        // Implement API-specific error handling
        // For example, retry with exponential backoff, fallback to alternative APIs, etc.
    }

    static isRetryableError(error) {
        const message = error.message.toLowerCase();
        const retryableErrors = [
            'network',
            'timeout',
            'econnreset',
            'enotfound',
            'rate limit',
            'service unavailable',
            'internal server error'
        ];

        return retryableErrors.some(retryableError => message.includes(retryableError));
    }

    static async retryOperation(operation, maxRetries = 3, delay = 1000) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                
                if (!this.isRetryableError(error) || attempt === maxRetries) {
                    throw error;
                }
                
                logger.warn(`Operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms:`, error.message);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
            }
        }
        
        throw lastError;
    }

    static setupGlobalErrorHandlers() {
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught Exception:', error);
            // Gracefully shutdown the application
            process.exit(1);
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
            // Gracefully shutdown the application
            process.exit(1);
        });

        // Handle SIGTERM
        process.on('SIGTERM', () => {
            logger.info('SIGTERM received, shutting down gracefully');
            process.exit(0);
        });

        // Handle SIGINT (Ctrl+C)
        process.on('SIGINT', () => {
            logger.info('SIGINT received, shutting down gracefully');
            process.exit(0);
        });
    }
}

module.exports = ErrorHandler;
