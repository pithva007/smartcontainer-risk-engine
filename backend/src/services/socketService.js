/**
 * Legacy Socket service shim.
 *
 * Socket.IO was removed to support Vercel serverless deployment where
 * persistent websocket connections are not reliable. The upload pipeline
 * still calls these helpers, so they are kept as safe no-ops.
 */

const init = () => null;
const getIO = () => null;
const isReady = () => false;

const broadcastPredictionRow = () => {};
const broadcastProgress = () => {};
const broadcastDone = () => {};
const broadcastError = () => {};

module.exports = {
  init,
  getIO,
  isReady,
  broadcastPredictionRow,
  broadcastProgress,
  broadcastDone,
  broadcastError,
};
