/**
 * Request ID Middleware
 * Attaches a unique correlation ID to every request for tracing.
 */
const { v4: uuidv4 } = require('uuid');

const requestId = (req, res, next) => {
  req.requestId = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-Id', req.requestId);
  next();
};

module.exports = requestId;
