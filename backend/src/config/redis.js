/**
 * Redis cache configuration
 * Optional - system degrades gracefully if Redis is unavailable
 */
const { createClient } = require('redis');
const logger = require('../utils/logger');

let redisClient = null;
let isConnected = false;

const connectRedis = async () => {
  try {
    redisClient = createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        reconnectStrategy: (retries) => {
          if (retries > 3) {
            logger.warn('Redis unavailable - caching disabled');
            return false; // stop retrying
          }
          return Math.min(retries * 100, 3000);
        },
      },
      password: process.env.REDIS_PASSWORD || undefined,
    });

    redisClient.on('error', (err) => {
      isConnected = false;
      logger.warn(`Redis error: ${err.message} - running without cache`);
    });

    redisClient.on('connect', () => {
      isConnected = true;
      logger.info('Redis connected');
    });

    await redisClient.connect();
  } catch (error) {
    logger.warn(`Redis connection failed: ${error.message} - caching disabled`);
    isConnected = false;
  }
};

/**
 * Get value from cache
 */
const getCache = async (key) => {
  if (!isConnected || !redisClient) return null;
  try {
    const value = await redisClient.get(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

/**
 * Set value in cache with TTL (seconds)
 */
const setCache = async (key, value, ttlSeconds = 300) => {
  if (!isConnected || !redisClient) return;
  try {
    await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch {
    // silently fail
  }
};

/**
 * Delete cache key
 */
const deleteCache = async (key) => {
  if (!isConnected || !redisClient) return;
  try {
    await redisClient.del(key);
  } catch {
    // silently fail
  }
};

/**
 * Flush all cache (use cautiously)
 */
const flushCache = async () => {
  if (!isConnected || !redisClient) return;
  try {
    await redisClient.flushAll();
  } catch {
    // silently fail
  }
};

module.exports = { connectRedis, getCache, setCache, deleteCache, flushCache };
