/**
 * Server Entry Point
 * Bootstraps the application: loads environment, connects to DB/Redis,
 * initialises job queue, seeds default admin, starts HTTP server, and
 * launches the background tracking refresh cron.
 */
require('dotenv').config();

const app = require('./src/app');
const { connectDB } = require('./src/config/database');
const { connectRedis } = require('./src/config/redis');
const jobQueueService = require('./src/services/jobQueueService');
const { processUploadJob } = require('./src/services/uploadJobProcessor');
const { refreshAllActiveTracks } = require('./src/services/trackingService');
const logger = require('./src/utils/logger');

const PORT = parseInt(process.env.PORT) || 3000;
const TRACKING_INTERVAL_MINS = parseInt(process.env.TRACKING_UPDATE_MINS) || 10;

// Seed a default admin user if no users exist yet
const seedAdminUser = async () => {
  try {
    const User = require('./src/models/userModel');
    const count = await User.countDocuments();
    if (count === 0) {
      await User.create({
        username: 'admin',
        email: 'admin@smartcontainer.local',
        password_hash: process.env.ADMIN_DEFAULT_PASSWORD || 'Admin@12345',
        role: 'admin',
        full_name: 'System Administrator',
      });
      logger.info('Default admin user created (username: admin)');
    }
  } catch (err) {
    logger.warn(`Admin seed skipped: ${err.message}`);
  }
};

const start = async () => {
  try {
    // Connect to MongoDB (required)
    await connectDB();

    // Connect to Redis (optional - fails gracefully)
    await connectRedis();

    // Initialise job queue (BullMQ when Redis available, in-process fallback otherwise)
    await jobQueueService.initialize();

    // Register job processors
    jobQueueService.registerProcessor('UPLOAD_DATASET', processUploadJob);
    logger.info('Job processors registered: UPLOAD_DATASET');

    // Seed default admin
    await seedAdminUser();

    const server = app.listen(PORT, () => {
      logger.info(`SmartContainer Risk Engine API v2 running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Health check:  http://localhost:${PORT}/health`);
      logger.info(`Swagger docs:  http://localhost:${PORT}/docs`);
      logger.info(`Metrics:       http://localhost:${PORT}/metrics`);
    });

    // Background tracking refresh cron
    const trackingIntervalMs = TRACKING_INTERVAL_MINS * 60 * 1000;
    const trackingTimer = setInterval(async () => {
      try {
        await refreshAllActiveTracks();
        logger.debug('Tracking positions refreshed');
      } catch (err) {
        logger.warn(`Tracking refresh error: ${err.message}`);
      }
    }, trackingIntervalMs);
    logger.info(`Tracking refresh cron started (every ${TRACKING_INTERVAL_MINS} min)`);

    // Graceful shutdown handlers
    const shutdown = async (signal) => {
      logger.info(`${signal} received — shutting down gracefully`);
      clearInterval(trackingTimer);
      await jobQueueService.shutdown();
      server.close(async () => {
        const { disconnectDB } = require('./src/config/database');
        await disconnectDB();
        logger.info('Server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Unhandled promise rejections
    process.on('unhandledRejection', (reason) => {
      logger.error(`Unhandled rejection: ${reason}`);
    });
  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

start();
