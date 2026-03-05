/**
 * Express Application Factory
 * Sets up middleware stack, mounts all routes, and configures error handling.
 */
require('express-async-errors');
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const swaggerUi = require('swagger-ui-express');

const logger = require('./utils/logger');
const { metricsMiddleware, metricsHandler } = require('./services/metricsService');
const requestId = require('./middleware/requestId');
const swaggerSpec = require('./config/swagger');

// Route modules — original
const uploadRoutes = require('./routes/uploadRoutes');
const predictionRoutes = require('./routes/predictionRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const mapRoutes = require('./routes/mapRoutes');

// Route modules — v2
const authRoutes = require('./routes/authRoutes');
const jobRoutes = require('./routes/jobRoutes');
const trackingRoutes = require('./routes/trackingRoutes');
const reportRoutes = require('./routes/reportRoutes');
const workflowRoutes = require('./routes/workflowRoutes');

// Ensure upload directory exists
const uploadDir = process.env.UPLOAD_DIR || './data/uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const app = express();

// ── Request ID (must be first) ─────────────────────────────────────────────────
app.use(requestId);

// ── Prometheus metrics middleware ──────────────────────────────────────────────
app.use(metricsMiddleware);

// ── Security Middleware ────────────────────────────────────────────────────────
app.use(helmet());

// CORS — restrict origins in production via environment variable
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174').split(',');
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. curl, Postman)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS policy: origin ${origin} not allowed`));
      }
    },
    credentials: true,
  })
);

// Rate limiting — prevents brute-force and DoS
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please retry later.' },
});
app.use('/api/', limiter);

// ── General Middleware ─────────────────────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// HTTP request logging
app.use((req, res, next) => {
  logger.info(`INCOMING: ${req.method} ${req.url}`);
  next();
});

app.use(
  morgan('combined', {
    stream: { write: (message) => logger.info(message.trim()) },
    skip: (req) => req.url === '/health',
  })
);

// ── Health Check ───────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const mongoose = require('mongoose');
  const dbState = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  res.status(200).json({
    status: 'ok',
    service: 'smartcontainer-risk-engine',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: dbState[mongoose.connection.readyState] || 'unknown',
    request_id: req.requestId,
  });
});

// ── Prometheus Metrics ──────────────────────────────────────────────────────────
app.get('/metrics', metricsHandler);

// ── Swagger UI ─────────────────────────────────────────────────────────────────
app.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'SmartContainer Risk Engine API',
    swaggerOptions: { persistAuthorization: true },
  })
);
app.get('/docs.json', (req, res) => res.json(swaggerSpec));

// ── API Routes ─────────────────────────────────────────────────────────────────
// v1 — original
app.use('/api', uploadRoutes);
app.use('/api', predictionRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', mapRoutes);

// v2 — new
app.use('/api', authRoutes);
app.use('/api', jobRoutes);
app.use('/api', trackingRoutes);
app.use('/api', reportRoutes);
app.use('/api', workflowRoutes);

// ── 404 Handler ────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.url} not found.`,
  });
});

// ── Global Error Handler ───────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      message: `File too large. Maximum allowed size is ${process.env.MAX_FILE_SIZE_MB || 50}MB.`,
      request_id: req.requestId,
    });
  }

  // CORS error
  if (err.message && err.message.startsWith('CORS policy')) {
    return res.status(403).json({ success: false, message: err.message, request_id: req.requestId });
  }

  // JWT / auth errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.', request_id: req.requestId });
  }

  logger.error(`Unhandled error [${req.requestId}]: ${err.stack || err.message}`);
  return res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error.' : err.message,
    request_id: req.requestId,
  });
});

module.exports = app;
