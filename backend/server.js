/**
 * Server Entry Point
 * Bootstraps the application: loads environment, connects to DB/Redis, starts HTTP server.
 */
require('dotenv').config();

const app = require('./src/app');
const { connectDB } = require('./src/config/database');
const { connectRedis } = require('./src/config/redis');
const logger = require('./src/utils/logger');

const PORT = parseInt(process.env.PORT) || 3000;

const start = async () => {
  try {
    // Connect to MongoDB (required)
    await connectDB();

    // Connect to Redis (optional - fails gracefully)
    await connectRedis();

    const server = app.listen(PORT, () => {
      logger.info(`SmartContainer Risk Engine API running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
    });

    // Graceful shutdown handlers
    const shutdown = async (signal) => {
      logger.info(`${signal} received — shutting down gracefully`);
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
