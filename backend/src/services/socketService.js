/**
 * Socket.IO Service
 * Initialises the Socket.IO server on top of the Node.js HTTP server and
 * provides broadcast helpers used by the streaming upload pipeline.
 */
const logger = require('../utils/logger');

let _io = null;

/**
 * Attach Socket.IO to the raw HTTP server created in server.js.
 * Must be called once before any broadcast helpers are used.
 *
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server}
 */
const init = (httpServer) => {
  const { Server } = require('socket.io');

  const allowedOrigins = (process.env.CORS_ORIGINS || [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'https://smartcontainerrrr.vercel.app',
    'https://smartcontainer-risk-engine-fwkw.vercel.app',
  ].join(',')).split(',').map((o) => o.trim()).filter(Boolean);

  _io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    path: '/socket.io',
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
  });

  _io.on('connection', (socket) => {
    logger.info(`[Socket] Client connected: ${socket.id}`);

    socket.on('disconnect', (reason) => {
      logger.info(`[Socket] Client disconnected: ${socket.id} (${reason})`);
    });
  });

  logger.info('[Socket] Socket.IO server initialised');
  return _io;
};

/** Returns the Socket.IO server instance (throws if not yet initialised). */
const getIO = () => {
  if (!_io) throw new Error('Socket.IO not initialised — call socketService.init(httpServer) first');
  return _io;
};

/** Returns true if Socket.IO has been initialised. */
const isReady = () => !!_io;

/* ──────────────────────────────────────────────────────────
   Broadcast helpers
   All helpers are safe to call even before init — they just
   no-op if the server has not been set up yet.
   ────────────────────────────────────────────────────────── */

/**
 * Broadcast a single predicted container row to ALL connected clients.
 *
 * @param {Object} data
 * @param {string} data.job_id
 * @param {string} data.batch_id
 * @param {string} data.container_id
 * @param {number} data.risk_score
 * @param {string} data.risk_level
 * @param {boolean} data.anomaly_flag
 * @param {number} data.anomaly_score
 * @param {string} data.explanation
 * @param {string} data.origin_country
 * @param {string} data.destination_country
 * @param {string} data.processed_at  ISO string
 */
const broadcastPredictionRow = (data) => {
  try {
    if (_io) _io.emit('prediction:row', data);
  } catch (err) {
    logger.warn(`[Socket] broadcastPredictionRow error: ${err.message}`);
  }
};

/**
 * Broadcast job-level progress update to ALL connected clients.
 *
 * @param {{ job_id: string, processed: number, total: number, percent: number }} data
 */
const broadcastProgress = (data) => {
  try {
    if (_io) _io.emit('prediction:progress', data);
  } catch (err) {
    logger.warn(`[Socket] broadcastProgress error: ${err.message}`);
  }
};

/**
 * Broadcast job completion to ALL connected clients.
 *
 * @param {{ job_id: string, batch_id: string, total: number, processed: number, failed: number }} data
 */
const broadcastDone = (data) => {
  try {
    if (_io) _io.emit('prediction:done', data);
  } catch (err) {
    logger.warn(`[Socket] broadcastDone error: ${err.message}`);
  }
};

/**
 * Broadcast a job-level error to ALL connected clients.
 *
 * @param {{ job_id: string, message: string }} data
 */
const broadcastError = (data) => {
  try {
    if (_io) _io.emit('prediction:error', data);
  } catch (err) {
    logger.warn(`[Socket] broadcastError error: ${err.message}`);
  }
};

module.exports = {
  init,
  getIO,
  isReady,
  broadcastPredictionRow,
  broadcastProgress,
  broadcastDone,
  broadcastError,
};
