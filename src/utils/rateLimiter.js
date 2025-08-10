const logger = require('./logger');

class RateLimiter {
    constructor() {
        this.userLimits = new Map();
        this.commandLimits = new Map();
        this.cleanupInterval = setInterval(() => this.cleanup(), 60000); // Cleanup every minute
    }

    /**
     * Check if user is rate limited for a specific command
     */
    isRateLimited(userId, commandName, limit = 5, windowMs = 60000) {
        const key = `${userId}:${commandName}`;
        const now = Date.now();
        
        if (!this.userLimits.has(key)) {
            this.userLimits.set(key, {
                count: 1,
                resetTime: now + windowMs
            });
            return false;
        }

        const userLimit = this.userLimits.get(key);
        
        // Reset if window has passed
        if (now > userLimit.resetTime) {
            this.userLimits.set(key, {
                count: 1,
                resetTime: now + windowMs
            });
            return false;
        }

        // Check if limit exceeded
        if (userLimit.count >= limit) {
            return true;
        }

        // Increment count
        userLimit.count++;
        return false;
    }

    /**
     * Get remaining time until rate limit resets
     */
    getResetTime(userId, commandName) {
        const key = `${userId}:${commandName}`;
        const userLimit = this.userLimits.get(key);
        
        if (!userLimit) {
            return 0;
        }

        const now = Date.now();
        return Math.max(0, userLimit.resetTime - now);
    }

    /**
     * Check global command rate limit
     */
    isCommandRateLimited(commandName, limit = 100, windowMs = 60000) {
        const now = Date.now();
        
        if (!this.commandLimits.has(commandName)) {
            this.commandLimits.set(commandName, {
                count: 1,
                resetTime: now + windowMs
            });
            return false;
        }

        const commandLimit = this.commandLimits.get(commandName);
        
        // Reset if window has passed
        if (now > commandLimit.resetTime) {
            this.commandLimits.set(commandName, {
                count: 1,
                resetTime: now + windowMs
            });
            return false;
        }

        // Check if limit exceeded
        if (commandLimit.count >= limit) {
            return true;
        }

        // Increment count
        commandLimit.count++;
        return false;
    }

    /**
     * Apply rate limiting to a command
     */
    async applyRateLimit(interaction, commandName, userLimit = 5, userWindowMs = 60000, globalLimit = 100, globalWindowMs = 60000) {
        const userId = interaction.user.id;
        const username = interaction.user.username;

        // Check global command rate limit
        if (this.isCommandRateLimited(commandName, globalLimit, globalWindowMs)) {
            logger.warn(`Global rate limit exceeded for command ${commandName}`);
            await interaction.reply({
                content: '⚠️ This command is currently experiencing high usage. Please try again in a moment.',
                ephemeral: true
            });
            return false;
        }

        // Check user-specific rate limit
        if (this.isRateLimited(userId, commandName, userLimit, userWindowMs)) {
            const resetTime = this.getResetTime(userId, commandName);
            const resetSeconds = Math.ceil(resetTime / 1000);
            
            logger.warn(`Rate limit exceeded for user ${username} (${userId}) on command ${commandName}`);
            
            await interaction.reply({
                content: `⏰ You're using this command too frequently. Please wait ${resetSeconds} seconds before trying again.`,
                ephemeral: true
            });
            return false;
        }

        return true;
    }

    /**
     * Clean up expired rate limit entries
     */
    cleanup() {
        const now = Date.now();
        let cleanedUser = 0;
        let cleanedCommand = 0;

        // Clean user limits
        for (const [key, limit] of this.userLimits.entries()) {
            if (now > limit.resetTime) {
                this.userLimits.delete(key);
                cleanedUser++;
            }
        }

        // Clean command limits
        for (const [key, limit] of this.commandLimits.entries()) {
            if (now > limit.resetTime) {
                this.commandLimits.delete(key);
                cleanedCommand++;
            }
        }

        if (cleanedUser > 0 || cleanedCommand > 0) {
            logger.debug(`Rate limiter cleanup: removed ${cleanedUser} user limits and ${cleanedCommand} command limits`);
        }
    }

    /**
     * Get rate limit statistics
     */
    getStats() {
        return {
            userLimits: this.userLimits.size,
            commandLimits: this.commandLimits.size,
            totalEntries: this.userLimits.size + this.commandLimits.size
        };
    }

    /**
     * Clear all rate limits for a user
     */
    clearUserLimits(userId) {
        let cleared = 0;
        for (const key of this.userLimits.keys()) {
            if (key.startsWith(`${userId}:`)) {
                this.userLimits.delete(key);
                cleared++;
            }
        }
        return cleared;
    }

    /**
     * Clear all rate limits for a command
     */
    clearCommandLimits(commandName) {
        let cleared = 0;
        
        // Clear user-specific limits for this command
        for (const key of this.userLimits.keys()) {
            if (key.endsWith(`:${commandName}`)) {
                this.userLimits.delete(key);
                cleared++;
            }
        }
        
        // Clear global command limit
        if (this.commandLimits.has(commandName)) {
            this.commandLimits.delete(commandName);
            cleared++;
        }
        
        return cleared;
    }

    /**
     * Destroy the rate limiter and clean up resources
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.userLimits.clear();
        this.commandLimits.clear();
    }
}

// Create a singleton instance
const rateLimiter = new RateLimiter();

module.exports = rateLimiter;
