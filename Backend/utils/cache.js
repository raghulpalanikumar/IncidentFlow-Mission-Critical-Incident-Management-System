/**
 * Caching Layer for Performance Optimization
 * Implements in-memory and Redis-based caching
 */

class CacheManager {
  constructor(redisClient, config = {}) {
    this.redis = redisClient;
    this.ttl = config.ttl || 300; // 5 minutes default
    this.localCache = new Map();
    this.maxLocalSize = config.maxLocalSize || 1000;
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
    };
  }

  /**
   * Get cached value
   */
  async get(key) {
    // Try local cache first (faster)
    if (this.localCache.has(key)) {
      this.stats.hits++;
      return this.localCache.get(key);
    }

    // Try Redis
    try {
      if (this.redis) {
        const cached = await this.redis.get(key);
        if (cached) {
          const value = JSON.parse(cached);
          // Populate local cache
          this._setLocal(key, value);
          this.stats.hits++;
          return value;
        }
      }
    } catch (err) {
      console.warn("❌ Redis get error:", err.message);
    }

    this.stats.misses++;
    return null;
  }

  /**
   * Set cache value
   */
  async set(key, value, ttl = this.ttl) {
    this.stats.sets++;

    // Set in local cache
    this._setLocal(key, value);

    // Set in Redis
    if (this.redis) {
      try {
        await this.redis.setEx(key, ttl, JSON.stringify(value));
      } catch (err) {
        console.warn("❌ Redis set error:", err.message);
      }
    }
  }

  /**
   * Delete cache entry
   */
  async delete(key) {
    this.localCache.delete(key);

    if (this.redis) {
      try {
        await this.redis.del(key);
      } catch (err) {
        console.warn("❌ Redis delete error:", err.message);
      }
    }
  }

  /**
   * Clear all cache
   */
  async clear() {
    this.localCache.clear();

    if (this.redis) {
      try {
        // Clear only IMS keys
        const keys = await this.redis.keys("ims:*");
        if (keys.length > 0) {
          await this.redis.del(keys);
        }
      } catch (err) {
        console.warn("❌ Redis clear error:", err.message);
      }
    }
  }

  /**
   * Set in local cache with LRU eviction
   */
  _setLocal(key, value) {
    if (this.localCache.size >= this.maxLocalSize) {
      // Remove oldest entry (FIFO-like, not true LRU)
      const firstKey = this.localCache.keys().next().value;
      this.localCache.delete(firstKey);
    }
    this.localCache.set(key, value);
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;

    return {
      ...this.stats,
      hitRate: hitRate.toFixed(2) + "%",
      localSize: this.localCache.size,
      maxLocalSize: this.maxLocalSize,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = { hits: 0, misses: 0, sets: 0 };
  }
}

module.exports = { CacheManager };
