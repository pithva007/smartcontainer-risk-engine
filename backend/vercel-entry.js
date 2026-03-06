/**
 * Vercel Serverless Entry Point
 * Exports the Express app after initialising DB/Redis.
 * Connection is cached across warm invocations.
 */
require('dotenv').config();

const app = require('./src/app');
const { connectDB } = require('./src/config/database');
const { connectRedis } = require('./src/config/redis');

let initPromise = null;
let initError = null;

const init = () => {
  if (initError) {
    return Promise.reject(initError);
  }
  if (!initPromise) {
    initPromise = (async () => {
      console.log('Starting initialization...');
      console.log('MONGODB_URI set:', !!process.env.MONGODB_URI);
      console.log('NODE_ENV:', process.env.NODE_ENV);
      
      try {
        await connectDB();
        console.log('MongoDB connected successfully');
      } catch (dbErr) {
        console.error('MongoDB connection failed:', dbErr.message);
        throw dbErr;
      }
      
      try {
        await connectRedis();
        console.log('Redis connected (or skipped)');
      } catch (redisErr) {
        console.warn('Redis connection failed (non-fatal):', redisErr.message);
      }

      // Seed default admin on first boot
      try {
        const User = require('./src/models/userModel');
        const count = await User.countDocuments();
        if (count === 0) {
          await User.create({
            username: process.env.ADMIN_USERNAME || 'admin',
            email: process.env.ADMIN_EMAIL || 'admin@smartcontainer.local',
            password_hash: process.env.ADMIN_PASSWORD || 'Admin@12345',
            role: 'admin',
            full_name: 'System Administrator',
          });
          console.log('Default admin user seeded');
        } else {
          console.log(`Found ${count} existing users, skipping seed`);
        }
      } catch (seedErr) {
        console.warn('Admin seed error (non-fatal):', seedErr.message);
      }
      
      console.log('Initialization complete');
    })().catch(err => {
      initError = err;
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
};

// Allowed origins — mirror what app.js uses; CORS_ORIGINS env var overrides
const getAllowedOrigins = () =>
  (process.env.CORS_ORIGINS || [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'https://smartcontainerrrr.vercel.app',
    'https://smartcontainer-risk-engine-fwkw.vercel.app',
  ].join(','))
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

// Vercel calls this handler for every request
module.exports = async (req, res) => {
  // Always inject CORS headers FIRST so they are present on error responses too
  const origin = req.headers.origin;
  const allowed = getAllowedOrigins();
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Request-ID');

  // Handle CORS preflight immediately — no DB needed
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    await init();
    return app(req, res);
  } catch (err) {
    console.error('Init error:', err.message);
    res.status(500).json({
      error: 'Server initialization failed',
      message: err.message,
      hint: 'Check MONGODB_URI environment variable in Vercel dashboard'
    });
  }
};
