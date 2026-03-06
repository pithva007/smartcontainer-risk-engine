/**
 * Database configuration - MongoDB connection via Mongoose
 */
const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/smartcontainer_db';
    const conn = await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 8000,
    });
    logger.info(`MongoDB connected to: ${mongoUri.replace(/:([^:@]{1,})@/, ':****@')}`);
    logger.info(`MongoDB host: ${conn.connection.host}`);
  } catch (error) {
    logger.error(`MongoDB connection error: ${error.message}`);
    // Throw instead of process.exit so serverless handlers can catch it
    throw error;
  }
};

// Graceful disconnect
const disconnectDB = async () => {
  await mongoose.connection.close();
  logger.info('MongoDB disconnected');
};

module.exports = { connectDB, disconnectDB };
