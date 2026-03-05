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

const init = () => {
  if (!initPromise) {
    initPromise = (async () => {
      await connectDB();
      await connectRedis();

      // Seed default admin on first boot
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
      }
    })();
  }
  return initPromise;
};

// Vercel calls this handler for every request
module.exports = async (req, res) => {
  await init();
  return app(req, res);
};
