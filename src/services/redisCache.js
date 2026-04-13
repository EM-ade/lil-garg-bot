const Redis = require('ioredis');
const logger = require('../utils/logger');

class NFTCache {
  constructor(redisUrl) {
    this.prefix = 'nft:';
    this.defaultTTL = 15 * 60; // 15 minutes in seconds

    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) {
          return null; // Stop retrying
        }
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    this.client.on('error', (err) => {
      logger.error(`Redis error: ${err.message}`);
    });

    this.client.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    this.client.on('reconnecting', () => {
      logger.warn('Redis reconnecting...');
    });

    this.isConnected = false;
  }

  async connect() {
    try {
      await this.client.connect();
      this.isConnected = true;
    } catch (error) {
      logger.error(`Failed to connect to Redis: ${error.message}`);
      this.isConnected = false;
    }
  }

  async disconnect() {
    try {
      await this.client.quit();
      this.isConnected = false;
      logger.info('Redis disconnected');
    } catch (error) {
      logger.error(`Error disconnecting Redis: ${error.message}`);
    }
  }

  /**
   * Build a cache key for NFT verification results.
   * Key format: nft:{guildId}:{walletAddress}:{contractAddress}
   */
  _buildKey(guildId, walletAddress, contractAddress) {
    return `${this.prefix}${guildId}:${walletAddress}:${contractAddress}`;
  }

  /**
   * Get cached NFT verification result.
   * Returns null if not found or Redis is unavailable.
   */
  async get(guildId, walletAddress, contractAddress) {
    if (!this.isConnected) return null;

    try {
      const key = this._buildKey(guildId, walletAddress, contractAddress);
      const cached = await this.client.get(key);
      if (cached) {
        logger.debug(`Cache hit for ${key}`);
        return JSON.parse(cached);
      }
      return null;
    } catch (error) {
      logger.error(`Redis GET error: ${error.message}`);
      return null;
    }
  }

  /**
   * Store NFT verification result with TTL.
   */
  async set(guildId, walletAddress, contractAddress, data, ttl = this.defaultTTL) {
    if (!this.isConnected) return;

    try {
      const key = this._buildKey(guildId, walletAddress, contractAddress);
      await this.client.set(key, JSON.stringify(data), 'EX', ttl);
      logger.debug(`Cache set for ${key} (TTL: ${ttl}s)`);
    } catch (error) {
      logger.error(`Redis SET error: ${error.message}`);
    }
  }

  /**
   * Invalidate cached results for a specific wallet in a guild.
   * Uses SCAN to find all matching keys (safe for production).
   */
  async invalidate(guildId, walletAddress) {
    if (!this.isConnected) return;

    try {
      const pattern = `${this.prefix}${guildId}:${walletAddress}:*`;
      const keys = await this.scanKeys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
        logger.info(`Invalidated ${keys.length} cache entries for guild ${guildId}, wallet ${walletAddress}`);
      }
    } catch (error) {
      logger.error(`Redis invalidate error: ${error.message}`);
    }
  }

  /**
   * Invalidate all cached results for a guild.
   */
  async invalidateGuild(guildId) {
    if (!this.isConnected) return;

    try {
      const pattern = `${this.prefix}${guildId}:*`;
      const keys = await this.scanKeys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
        logger.info(`Invalidated ${keys.length} cache entries for guild ${guildId}`);
      }
    } catch (error) {
      logger.error(`Redis guild invalidate error: ${error.message}`);
    }
  }

  /**
   * SCAN-based key deletion (avoids KEYS command which blocks Redis).
   */
  async scanKeys(pattern) {
    const keys = [];
    let cursor = 0;

    do {
      const result = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = parseInt(result[0], 10);
      keys.push(...result[1]);
    } while (cursor !== 0);

    return keys;
  }

  /**
   * Get cache statistics (for monitoring).
   */
  async getInfo() {
    if (!this.isConnected) return { connected: false };

    try {
      const info = await this.client.info('memory');
      const keysCount = await this.client.dbsize();
      return {
        connected: true,
        keysCount,
        info: info.split('\n').slice(0, 5).join('\n'),
      };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }
}

module.exports = NFTCache;
