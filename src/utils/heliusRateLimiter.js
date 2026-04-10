const logger = require('./logger');

/**
 * Token bucket rate limiter for Helius API calls.
 * Each API key gets its own independent bucket, so one busy server
 * cannot starve another server's requests.
 */
class HeliusRateLimiter {
  constructor(requestsPerSecond = 1, burst = 5) {
    this.requestsPerSecond = requestsPerSecond;
    this.burst = burst;
    this.buckets = new Map(); // key -> { tokens, lastRefill }
    this.defaultKey = '_global_';
  }

  /**
   * Get or create a token bucket for the given API key.
   */
  _getBucket(apiKey) {
    const key = apiKey || this.defaultKey;
    if (!this.buckets.has(key)) {
      this.buckets.set(key, {
        tokens: this.burst,
        lastRefill: Date.now(),
      });
    }
    return this.buckets.get(key);
  }

  _refillTokens(bucket) {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const refillMs = 1000 / this.requestsPerSecond;
    if (elapsed > refillMs) {
      const newTokens = Math.floor(elapsed / refillMs);
      bucket.tokens = Math.min(this.burst, bucket.tokens + newTokens);
      bucket.lastRefill = now;
    }
  }

  /**
   * Acquire a token for the given API key.
   * Returns immediately if a token is available, otherwise waits.
   */
  async acquireToken(apiKey) {
    return new Promise((resolve) => {
      const bucket = this._getBucket(apiKey);
      this._refillTokens(bucket);

      if (bucket.tokens > 0) {
        bucket.tokens--;
        resolve();
        return;
      }

      // Calculate wait time until next token
      const refillMs = 1000 / this.requestsPerSecond;
      const delay = refillMs - (Date.now() - bucket.lastRefill);
      setTimeout(() => {
        this._refillTokens(bucket);
        bucket.tokens--;
        resolve();
      }, Math.max(delay, 0));
    });
  }

  /**
   * Execute a function after acquiring a rate-limit token.
   */
  async limit(fn, apiKey) {
    await this.acquireToken(apiKey);
    return fn();
  }

  /**
   * Get stats for debugging/monitoring.
   */
  getStats(apiKey) {
    const bucket = this._getBucket(apiKey);
    return {
      key: apiKey || this.defaultKey,
      tokens: bucket.tokens,
      maxTokens: this.burst,
      requestsPerSecond: this.requestsPerSecond,
    };
  }
}

// Singleton instance
const heliusRateLimiter = new HeliusRateLimiter(1, 5);

module.exports = heliusRateLimiter;
