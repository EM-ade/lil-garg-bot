const logger = require('./logger');

/**
 * Token bucket rate limiter for Helius API calls.
 * Default configuration: 1 request per second, burst up to 5 requests.
 * This helps avoid hitting Helius API rate limits (429 errors).
 * Adjust the parameters based on your Helius plan limits.
 */
class HeliusRateLimiter {
    constructor(requestsPerSecond = 1, burst = 5) {
        this.requestsPerSecond = requestsPerSecond;
        this.tokens = burst;
        this.maxTokens = burst;
        this.lastRefill = Date.now();
        this.refillInterval = 1000 / requestsPerSecond; // ms per token
        this.queue = [];
        this.processing = false;
    }

    refillTokens() {
        const now = Date.now();
        const elapsed = now - this.lastRefill;
        if (elapsed > this.refillInterval) {
            const newTokens = Math.floor(elapsed / this.refillInterval);
            this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
            this.lastRefill = now;
        }
    }

    async acquireToken() {
        return new Promise((resolve) => {
            this.refillTokens();
            if (this.tokens > 0) {
                this.tokens--;
                resolve();
                return;
            }
            // No tokens available, calculate delay until next token
            const delay = this.refillInterval - (Date.now() - this.lastRefill);
            setTimeout(() => {
                this.refillTokens();
                this.tokens--;
                resolve();
            }, delay);
        });
    }

    async limit(fn) {
        await this.acquireToken();
        return fn();
    }
}

// Singleton instance
const heliusRateLimiter = new HeliusRateLimiter(1, 5); // 1 request per second, burst of 5

module.exports = heliusRateLimiter;