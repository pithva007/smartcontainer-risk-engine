/**
 * Database configuration - MongoDB connection via Mongoose
 */
const { connectMongo, disconnectMongo } = require('../../lib/mongodb');

const connectDB = async () => {
  await connectMongo();
};

// Graceful disconnect
const disconnectDB = async () => {
  await disconnectMongo();
};

module.exports = { connectDB, disconnectDB };
