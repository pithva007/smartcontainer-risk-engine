require('dotenv').config();

const { connectDB } = require('../../src/config/database');
const { connectRedis } = require('../../src/config/redis');

let initPromise = null;

const initServerless = async () => {
  process.env.VERCEL = process.env.VERCEL || '1';

  if (!initPromise) {
    initPromise = (async () => {
      await connectDB();
      try {
        await connectRedis();
      } catch {
        // Redis is optional; continue without caching.
      }
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }

  return initPromise;
};

module.exports = { initServerless };
