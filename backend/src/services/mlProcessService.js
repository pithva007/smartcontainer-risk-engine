/**
 * ML Process Service
 * ──────────────────
 * Spawns and manages the Python FastAPI ML microservice as a child process
 * of the Node.js backend.  The ML service lives at backend/ml-service/ and
 * is started automatically when the Node.js server boots.
 *
 * Lifecycle
 * ---------
 *  start()    – spawn uvicorn, wait until /health returns 200, resolve
 *  stop()     – send SIGTERM, wait for graceful exit
 *  isReady()  – returns true once the service passed the health check
 *
 * Behaviour
 * ---------
 *  • Skipped automatically when ML_SERVICE_EXTERNAL=true (Docker / cloud).
 *  • Respects ML_SERVICE_PORT (default 8000) and ML_SERVICE_HOST (default 127.0.0.1).
 *  • Pipes stdout/stderr to the Winston logger.
 *  • Restarts the process up to MAX_RESTARTS times on unexpected exit.
 *  • Health-check polls every 1 s for up to HEALTH_TIMEOUT_S seconds.
 */

const { spawn } = require('child_process');
const path      = require('path');
const axios     = require('axios');
const logger    = require('../utils/logger');

// ── Config ────────────────────────────────────────────────────────────────────
const ML_SERVICE_DIR  = path.join(__dirname, '..', '..', 'ml-service');
const ML_HOST         = process.env.ML_SERVICE_HOST || '127.0.0.1';
const ML_PORT         = parseInt(process.env.ML_SERVICE_PORT) || 8000;
const ML_URL          = process.env.ML_SERVICE_URL || `http://${ML_HOST}:${ML_PORT}`;
const HEALTH_TIMEOUT_S = parseInt(process.env.ML_HEALTH_TIMEOUT_S) || 60;
const MAX_RESTARTS    = 3;
const RESTART_DELAY_MS = 3000;

// ── State ─────────────────────────────────────────────────────────────────────
let _process    = null;   // child_process.ChildProcess
let _ready      = false;
let _restarts   = 0;
let _stopping   = false;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Detect the Python executable available in PATH.
 */
function _pythonBin() {
  // Prefer python3, fall back to python
  const candidates = ['python3', 'python'];
  for (const bin of candidates) {
    try {
      require('child_process').execSync(`${bin} --version`, { stdio: 'ignore' });
      return bin;
    } catch { /* try next */ }
  }
  throw new Error('No Python interpreter found. Install Python 3.9+');
}

/**
 * Poll GET /health until it returns status 200, or time out.
 */
async function _waitForHealth() {
  const deadline = Date.now() + HEALTH_TIMEOUT_S * 1000;
  while (Date.now() < deadline) {
    try {
      const res = await axios.get(`${ML_URL}/health`, { timeout: 2000 });
      if (res.status === 200) return true;
    } catch { /* not ready yet */ }
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

/**
 * Spawn uvicorn and wire up logging.
 */
function _spawn(python) {
  logger.info(`[ML] Spawning ML service: uvicorn main:app --host ${ML_HOST} --port ${ML_PORT}`);

  const proc = spawn(
    python,
    ['-m', 'uvicorn', 'main:app',
      '--host', ML_HOST,
      '--port', String(ML_PORT),
      '--log-level', 'warning'],
    {
      cwd: ML_SERVICE_DIR,
      env: { ...process.env, ML_SERVICE_PORT: String(ML_PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  proc.stdout.on('data', d =>
    String(d).trim().split('\n').forEach(l => logger.info(`[ML] ${l}`))
  );
  proc.stderr.on('data', d =>
    String(d).trim().split('\n').forEach(l => logger.warn(`[ML] ${l}`))
  );

  proc.on('error', err => logger.error(`[ML] Process error: ${err.message}`));

  proc.on('exit', (code, signal) => {
    _ready = false;
    if (_stopping) {
      logger.info(`[ML] Service stopped (code=${code})`);
      return;
    }
    logger.warn(`[ML] Service exited unexpectedly (code=${code}, signal=${signal})`);
    if (_restarts < MAX_RESTARTS) {
      _restarts++;
      logger.info(`[ML] Restarting in ${RESTART_DELAY_MS}ms (attempt ${_restarts}/${MAX_RESTARTS})…`);
      setTimeout(() => _spawn(python), RESTART_DELAY_MS);
    } else {
      logger.error('[ML] Max restarts reached. ML service is offline — heuristic fallback active.');
    }
  });

  _process = proc;
  return proc;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start the ML microservice and wait until it is healthy.
 *
 * Resolves immediately (with a warning) if:
 *   - ML_SERVICE_EXTERNAL=true  (managed externally, e.g. Docker)
 *   - The service is already running on the target port
 *
 * @returns {Promise<void>}
 */
async function start() {
  // External / Docker mode — skip process management
  if (process.env.ML_SERVICE_EXTERNAL === 'true') {
    logger.info('[ML] ML_SERVICE_EXTERNAL=true — skipping local process start');
    // Still wait for external service to become healthy
    const healthy = await _waitForHealth();
    _ready = healthy;
    if (!healthy) {
      logger.warn(`[ML] External ML service at ${ML_URL} did not become healthy within ${HEALTH_TIMEOUT_S}s`);
    }
    return;
  }

  // Check if something is already listening on the ML port
  try {
    const res = await axios.get(`${ML_URL}/health`, { timeout: 1500 });
    if (res.status === 200) {
      logger.info(`[ML] ML service already running at ${ML_URL} — skipping spawn`);
      _ready = true;
      return;
    }
  } catch { /* not running — we will start it */ }

  const python = _pythonBin();
  _stopping  = false;
  _restarts  = 0;

  _spawn(python);

  logger.info(`[ML] Waiting for ML service to become healthy (timeout: ${HEALTH_TIMEOUT_S}s)…`);
  const healthy = await _waitForHealth();
  if (healthy) {
    _ready = true;
    logger.info(`[ML] ML microservice is ready at ${ML_URL}`);
  } else {
    logger.warn(`[ML] ML service did not become healthy within ${HEALTH_TIMEOUT_S}s — heuristic fallback active`);
  }
}

/**
 * Gracefully stop the ML service subprocess.
 *
 * @returns {Promise<void>}
 */
async function stop() {
  _stopping = true;
  _ready    = false;

  if (!_process || _process.exitCode !== null) {
    return;
  }

  logger.info('[ML] Stopping ML service…');
  _process.kill('SIGTERM');

  await new Promise(resolve => {
    const t = setTimeout(() => {
      if (_process) _process.kill('SIGKILL');
      resolve();
    }, 5000);
    _process.on('exit', () => { clearTimeout(t); resolve(); });
  });

  logger.info('[ML] ML service stopped');
}

/**
 * True once the ML service passed its health check.
 */
function isReady() {
  return _ready;
}

/**
 * The base URL used by predictionService to call the ML service.
 */
function serviceUrl() {
  return ML_URL;
}

module.exports = { start, stop, isReady, serviceUrl };
