/**
 * Server Entry Point
 * Bootstraps the application: loads environment, connects to DB/Redis,
 * initialises job queue, seeds default admin, starts HTTP server, and
 * launches the background tracking refresh cron.
 */
require('dotenv').config();

const http = require('http');
const { execSync } = require('child_process');
const app = require('./src/app');
const { connectDB } = require('./src/config/database');
const { connectRedis } = require('./src/config/redis');
const jobQueueService = require('./src/services/jobQueueService');
const { processUploadJob } = require('./src/services/uploadJobProcessor');
const { refreshAllActiveTracks } = require('./src/services/trackingService');
const mlProcessService = require('./src/services/mlProcessService');
const { reprocessAll } = require('./src/services/mlBulkService');
const socketService = require('./src/services/socketService');
const logger = require('./src/utils/logger');

const PORT = parseInt(process.env.PORT) || 3000;
const TRACKING_INTERVAL_MINS = parseInt(process.env.TRACKING_UPDATE_MINS) || 10;

// Seed a default admin user if no users exist yet
const seedAdminUser = async () => {
  try {
    const User = require('./src/models/userModel');
    const adminUser = await User.findOne({ username: 'admin' });

    if (!adminUser) {
      logger.info('Admin user not found. Seeding default admin...');
      await User.create({
        username: process.env.ADMIN_USERNAME || 'admin',
        email: process.env.ADMIN_EMAIL || 'admin@smartcontainer.local',
        password_hash: process.env.ADMIN_PASSWORD || 'Admin@12345',
        role: 'admin',
        full_name: 'System Administrator',
      });
      logger.info(`Default admin user created (username: ${process.env.ADMIN_USERNAME || 'admin'})`);
    } else {
      logger.info('Admin user already exists. Seeding skipped.');
    }
  } catch (err) {
    logger.error(`Admin seed failed: ${err.message}`);
    logger.error(err.stack);
  }
};

const start = async () => {
  try {
    // Free the port if something is already holding it (e.g. a zombie nodemon restart)
    try {
      const pids = execSync(`lsof -ti :${PORT}`, { stdio: ['pipe', 'pipe', 'ignore'] })
        .toString().trim();
      if (pids) {
        pids.split('\n').forEach(pid => {
          try { process.kill(Number(pid), 'SIGKILL'); } catch { /* ignore */ }
        });
        // Give the OS a moment to release the port
        await new Promise(r => setTimeout(r, 300));
      }
    } catch { /* lsof found nothing — port is free */ }

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

    // Start the Python ML microservice (non-blocking — backend starts even if ML is slow)
    mlProcessService.start().then(async () => {
      // Once ML service is ready, backfill containers that were never ML-scored.
      // Force a full reprocess when the distribution looks wrong (critical_count == 0)
      // which signals the heuristic fallback ran instead of the real ML model.
      try {
        const Container = require('./src/models/containerModel');
        const [total, critical, unscored] = await Promise.all([
          Container.countDocuments({}),
          Container.countDocuments({ risk_level: 'Critical' }),
          Container.countDocuments({ processed_at: { $exists: false } }),
        ]);
        const needsBackfill = unscored > 0 || (total > 0 && critical === 0);
        if (needsBackfill) {
          const forceAll = total > 0 && critical === 0; // re-score everything when ML was bypassed
          logger.info(`[Startup] Backfill needed (total=${total}, critical=${critical}, unscored=${unscored}, forceAll=${forceAll})`);
          const result = await reprocessAll({ forceAll });
          logger.info(`[Startup] Backfill complete: ${result.processed} processed, ${result.failed} failed`);
        } else {
          logger.info('[Startup] ML predictions look healthy — backfill skipped.');
        }
      } catch (err) {
        logger.warn(`[Startup] Backfill failed: ${err.message}`);
      }
    }).catch(err =>
      logger.warn(`ML service startup error: ${err.message} — prediction fallback active`)
    );
    logger.info(`ML microservice starting at ${mlProcessService.serviceUrl()} (async)`);

    // Create raw HTTP server and attach Socket.IO before listening
    const httpServer = http.createServer(app);
    socketService.init(httpServer);

    httpServer.listen(PORT, () => {
      logger.info(`SmartContainer Risk Engine API v2 running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Health check:  http://localhost:${PORT}/health`);
      logger.info(`Swagger docs:  http://localhost:${PORT}/docs`);
      logger.info(`Metrics:       http://localhost:${PORT}/metrics`);
    });

    const server = httpServer;

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is still in use. Retrying in 1s…`);
        setTimeout(() => {
          server.close();
          server.listen(PORT);
        }, 1000);
      } else {
        logger.error(`Server error: ${err.message}`);
        process.exit(1);
      }
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
      await mlProcessService.stop();
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
