const mongoose = require('mongoose');
const logger = require('../src/utils/logger');

const DEFAULT_URI = 'mongodb://localhost:27017/smartcontainer_db';
const MONGO_URI = process.env.MONGODB_URI || DEFAULT_URI;

const MONGO_OPTIONS = {
  maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE || '5', 10),
  minPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE || '0', 10),
  serverSelectionTimeoutMS: parseInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || '8000', 10),
  maxIdleTimeMS: parseInt(process.env.MONGODB_MAX_IDLE_TIME_MS || '30000', 10),
  socketTimeoutMS: parseInt(process.env.MONGODB_SOCKET_TIMEOUT_MS || '45000', 10),
  bufferCommands: false,
  autoIndex: false,
};

// Persist across warm invocations in serverless runtimes.
const globalCache = global;
if (!globalCache.__smartcontainerMongo) {
  globalCache.__smartcontainerMongo = {
    conn: null,
    promise: null,
    loggedConnected: false,
  };
}

const cache = globalCache.__smartcontainerMongo;

const getConnectionState = () => mongoose.connection.readyState;

const connectMongo = async () => {
  const state = getConnectionState();

  // 1 = connected, 2 = connecting
  if (state === 1 && cache.conn) {
    return cache.conn;
  }

  if (state === 2 && cache.promise) {
    return cache.promise;
  }

  if (!cache.promise) {
    cache.promise = mongoose
      .connect(MONGO_URI, MONGO_OPTIONS)
      .then((conn) => {
        cache.conn = conn;
        if (!cache.loggedConnected) {
          logger.info(
            `MongoDB connected (pool max=${MONGO_OPTIONS.maxPoolSize}) to ${MONGO_URI.replace(/:([^:@]{1,})@/, ':****@')}`
          );
          cache.loggedConnected = true;
        }
        return conn;
      })
      .catch((err) => {
        cache.promise = null;
        logger.error(`MongoDB connection error: ${err.message}`);
        throw err;
      });
  }

  return cache.promise;
};

const disconnectMongo = async () => {
  if (getConnectionState() === 0) return;
  await mongoose.connection.close();
  cache.conn = null;
  cache.promise = null;
  cache.loggedConnected = false;
  logger.info('MongoDB disconnected');
};

module.exports = {
  connectMongo,
  disconnectMongo,
  getConnectionState,
};
