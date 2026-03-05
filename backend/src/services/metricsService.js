/**
 * Metrics Service — Prometheus / prom-client
 * Exposes /metrics endpoint for scraping.
 * Tracks request latency, ML errors, fallback count, jobs, geocache hits.
 */
const client = require('prom-client');

// Collect default Node.js metrics (heap, event loop, GC, etc.)
const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'sce_' });

// ── Custom Metrics ─────────────────────────────────────────────────────────────

const httpRequestDuration = new client.Histogram({
  name: 'sce_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

const httpRequestsTotal = new client.Counter({
  name: 'sce_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const mlServiceErrorsTotal = new client.Counter({
  name: 'sce_ml_service_errors_total',
  help: 'Total ML service call failures',
  labelNames: ['endpoint'],
  registers: [register],
});

const mlFallbackTotal = new client.Counter({
  name: 'sce_ml_fallback_total',
  help: 'Total heuristic fallback invocations when ML service is unreachable',
  registers: [register],
});

const jobsProcessedTotal = new client.Counter({
  name: 'sce_jobs_processed_total',
  help: 'Total background jobs processed',
  labelNames: ['type', 'status'],
  registers: [register],
});

const geocachHitsTotal = new client.Counter({
  name: 'sce_geocache_hits_total',
  help: 'Geocoding cache hits (redis + mongodb)',
  labelNames: ['layer'],
  registers: [register],
});

const activeJobsGauge = new client.Gauge({
  name: 'sce_active_jobs',
  help: 'Currently active background jobs',
  registers: [register],
});

const containersTotal = new client.Gauge({
  name: 'sce_containers_total',
  help: 'Total containers in database',
  registers: [register],
});

const criticalContainersGauge = new client.Gauge({
  name: 'sce_critical_containers_total',
  help: 'Containers with Critical risk level',
  registers: [register],
});

// ── Express Middleware ─────────────────────────────────────────────────────────

/**
 * Middleware that times every request and records it in Prometheus histograms.
 */
const metricsMiddleware = (req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    // Normalise route: replace path params like /api/containers/C123 → /api/containers/:id
    const route = req.route?.path
      ? req.baseUrl + req.route.path
      : req.path.replace(/\/[0-9a-f-]{8,}/gi, '/:id');

    const labels = { method: req.method, route, status_code: res.statusCode };
    end(labels);
    httpRequestsTotal.inc(labels);
  });
  next();
};

// ── Helper Increment Functions ─────────────────────────────────────────────────

const incMLError = (endpoint = 'predict') => mlServiceErrorsTotal.labels(endpoint).inc();
const incMLFallback = () => mlFallbackTotal.inc();
const incJob = (type, status) => jobsProcessedTotal.labels(type, status).inc();
const incGeocacheHit = (layer = 'redis') => geocachHitsTotal.labels(layer).inc();
const setActiveJobs = (n) => activeJobsGauge.set(n);
const setContainersTotal = (n) => containersTotal.set(n);
const setCriticalContainers = (n) => criticalContainersGauge.set(n);

// ── Metrics Handler ────────────────────────────────────────────────────────────

const metricsHandler = async (req, res) => {
  res.setHeader('Content-Type', register.contentType);
  res.end(await register.metrics());
};

module.exports = {
  metricsMiddleware,
  metricsHandler,
  incMLError,
  incMLFallback,
  incJob,
  incGeocacheHit,
  setActiveJobs,
  setContainersTotal,
  setCriticalContainers,
  register,
};
