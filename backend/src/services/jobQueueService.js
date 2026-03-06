/**
 * Job Queue Service
 * Primary: BullMQ backed by Redis
 * Fallback: In-process async execution with MongoDB job tracking
 *
 * Usage:
 *   await jobQueueService.enqueueJob('UPLOAD_DATASET', data, userId);
 *   jobQueueService.registerProcessor('UPLOAD_DATASET', handlerFn);
 */
const { v4: uuidv4 } = require('uuid');
const Job = require('../models/jobModel');
const logger = require('../utils/logger');

let Queue, Worker;
let bullQueue = null;
let bullWorker = null;
let isRedisAvailable = false;

// Registered processor functions by job type
const processors = new Map();

// ── Initialisation ─────────────────────────────────────────────────────────────

const initialize = async () => {
  try {
    const IORedis = require('ioredis');
    const bullmq = require('bullmq');
    Queue = bullmq.Queue;
    Worker = bullmq.Worker;

    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT) || 6379;
    const password = process.env.REDIS_PASSWORD || undefined;

    // Use lazyConnect so we can test the connection before creating Queue/Worker
    const testClient = new IORedis({
      host,
      port,
      ...(password ? { password } : {}),
      lazyConnect: true,
      connectTimeout: 3000,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
    });
    testClient.on('error', () => {}); // suppress async error events

    await testClient.connect(); // throws immediately if Redis is down
    await testClient.ping();
    await testClient.quit();

    const connection = {
      host,
      port,
      ...(password ? { password } : {}),
      maxRetriesPerRequest: null, // BullMQ requirement
      enableOfflineQueue: false,
    };

    bullQueue = new Queue('container-jobs', {
      connection,
      defaultJobOptions: {
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
        attempts: 2,
        backoff: { type: 'exponential', delay: 2000 },
      },
    });

    // Start BullMQ worker
    bullWorker = new Worker(
      'container-jobs',
      async (bullJob) => {
        await _runProcessor(bullJob.data.job_id, bullJob.name, bullJob.data);
      },
      { connection, concurrency: 3 }
    );

    bullWorker.on('failed', (bullJob, err) => {
      logger.error(`BullMQ job ${bullJob?.id} failed: ${err.message}`);
    });

    isRedisAvailable = true;
    logger.info('BullMQ job queue initialised (Redis)');
  } catch (err) {
    logger.warn(`BullMQ/Redis unavailable (${err.message}) — using in-process queue fallback`);
    if (bullQueue) { try { await bullQueue.close(); } catch { /* ignore */ } }
    if (bullWorker) { try { await bullWorker.close(); } catch { /* ignore */ } }
    bullQueue = null;
    bullWorker = null;
    isRedisAvailable = false;
  }
};

// ── Processor Registration ─────────────────────────────────────────────────────

/**
 * Register a handler for a specific job type.
 * Handler signature: async (data, progressFn, jobId) => result
 *   progressFn(pct: 0-100, message?: string) — updates progress in DB
 */
const registerProcessor = (type, handlerFn) => {
  processors.set(type, handlerFn);
};

// ── Job Enqueue ────────────────────────────────────────────────────────────────

/**
 * Create a Job record in MongoDB and insert it into the queue.
 * Returns the job_id immediately (non-blocking).
 */
const enqueueJob = async (type, data, userId = null) => {
  const jobId = uuidv4();

  await Job.create({
    job_id: jobId,
    type,
    status: 'waiting',
    created_by: userId || undefined,
    metadata: data.metadata || {},
  });

  if (isRedisAvailable && bullQueue) {
    await bullQueue.add(type, { job_id: jobId, ...data }, { jobId });
    logger.info(`Job ${jobId} (${type}) queued via BullMQ`);
  } else if (process.env.VERCEL) {
    // On Vercel serverless, setImmediate won't survive after the response is sent.
    // Run the processor synchronously (blocks the response until done).
    logger.info(`Job ${jobId} (${type}) running synchronously (Vercel)`);
    await _runProcessor(jobId, type, data);
  } else {
    // Non-blocking in-process execution
    setImmediate(() => _runProcessor(jobId, type, data));
    logger.info(`Job ${jobId} (${type}) queued in-process`);
  }

  return jobId;
};

// ── Internal Processor Runner ──────────────────────────────────────────────────

const _runProcessor = async (jobId, type, data) => {
  const handler = processors.get(type);

  if (!handler) {
    await Job.updateOne(
      { job_id: jobId },
      { status: 'failed', error: `No handler registered for job type: ${type}` }
    );
    logger.error(`No handler for job type: ${type}`);
    return;
  }

  try {
    await Job.updateOne({ job_id: jobId }, { status: 'active', started_at: new Date() });
    logger.info(`Job ${jobId} (${type}) started`);

    // Progress callback that updates the DB record
    const progressFn = async (pct, message) => {
      const update = { progress: Math.min(Math.round(pct), 100) };
      if (message) {
        await Job.updateOne(
          { job_id: jobId },
          { ...update, $push: { logs: { level: 'info', message } } }
        );
      } else {
        await Job.updateOne({ job_id: jobId }, update);
      }
    };

    const result = await handler(data, progressFn, jobId);

    const metaUpdate = {};
    if (result) {
      if (result.batch_id) metaUpdate['metadata.batch_id'] = result.batch_id;
      if (result.result_file) metaUpdate['metadata.result_file'] = result.result_file;
      if (result.total_records !== undefined) metaUpdate['metadata.total_records'] = result.total_records;
      if (result.processed_records !== undefined) metaUpdate['metadata.processed_records'] = result.processed_records;
    }

    await Job.updateOne(
      { job_id: jobId },
      {
        status: 'completed',
        progress: 100,
        completed_at: new Date(),
        ...metaUpdate,
        $push: { logs: { level: 'info', message: 'Job completed successfully.' } },
      }
    );
    logger.info(`Job ${jobId} (${type}) completed`);
  } catch (err) {
    logger.error(`Job ${jobId} (${type}) failed: ${err.message}`);
    await Job.updateOne(
      { job_id: jobId },
      {
        status: 'failed',
        error: err.message,
        completed_at: new Date(),
        $push: { logs: { level: 'error', message: `Failed: ${err.message}` } },
      }
    );
  }
};

// ── Helper: append log line ────────────────────────────────────────────────────

const appendLog = async (jobId, level, message) => {
  await Job.updateOne(
    { job_id: jobId },
    { $push: { logs: { level, message, timestamp: new Date() } } }
  );
};

// ── Graceful Shutdown ──────────────────────────────────────────────────────────

const shutdown = async () => {
  if (bullWorker) await bullWorker.close();
  if (bullQueue) await bullQueue.close();
};

module.exports = {
  initialize,
  registerProcessor,
  enqueueJob,
  appendLog,
  shutdown,
  get isRedisAvailable() {
    return isRedisAvailable;
  },
};
