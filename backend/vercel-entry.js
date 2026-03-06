/**
 * Vercel Serverless Entry Point
 * Exports the Express app after initialising DB/Redis.
 * Connection is cached across warm invocations.
 */

// Mark this as a Vercel/serverless environment before loading any modules.
// This ensures all downstream code (upload controller, job queue) can detect it.
process.env.VERCEL = '1';

require('dotenv').config();

const app = require('./src/app');
const { connectDB } = require('./src/config/database');
const { connectRedis } = require('./src/config/redis');
const jobQueueService = require('./src/services/jobQueueService');
const { processUploadJob } = require('./src/services/uploadJobProcessor');

// Hardcoded allowed origins — these are ALWAYS allowed regardless of CORS_ORIGINS env var.
// Env var CORS_ORIGINS can only ADD extra origins on top of these.
const BUILTIN_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'https://smartcontainerrrr.vercel.app',
  'https://smartcontainer-risk-engine-fwkw.vercel.app',
];
const EXTRA_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : [];
const ALLOWED_ORIGINS = [...new Set([...BUILTIN_ORIGINS, ...EXTRA_ORIGINS])];

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

      // Initialise job queue and register processors (mirrors server.js)
      await jobQueueService.initialize();
      jobQueueService.registerProcessor('UPLOAD_DATASET', processUploadJob);
      console.log('Job queue initialised, processors registered');

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

// Vercel calls this handler for every request
module.exports = async (req, res) => {
  // Always inject CORS headers FIRST so they are present on error responses too.
  // vercel.json 'headers' config also sets these as a safety net at infra level.
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
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
