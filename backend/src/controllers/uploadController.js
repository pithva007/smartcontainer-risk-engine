/**
 * Upload Controller
 * Handles CSV/Excel file ingestion.
 * On Vercel: processes inline and returns results directly.
 * Elsewhere: enqueues an async background job for polling.
 */
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const Container = require('../models/containerModel');
const { enqueueJob } = require('../services/jobQueueService');
const { audit } = require('../services/auditService');
const { parseFile } = require('../utils/fileParser');
const { predictBatch } = require('../services/predictionService');
const { deleteCache } = require('../config/redis');
const logger = require('../utils/logger');
const Job = require('../models/jobModel');

/**
 * Process the uploaded file inline (used on Vercel where background jobs don't work).
 * Parses CSV, upserts to MongoDB, runs predictions, returns result.
 */
const processInline = async (filePath, originalFilename, userId) => {
  const records = await parseFile(filePath);
  if (!records || records.length === 0) {
    throw new Error('File contains no valid records.');
  }

  const total = records.length;
  const batchId = uuidv4();
  const jobId = uuidv4();

  // Create a job record for history
  await Job.create({
    job_id: jobId,
    type: 'UPLOAD_DATASET',
    status: 'active',
    created_by: userId || undefined,
    metadata: { original_filename: originalFilename },
    started_at: new Date(),
  });

  // Stamp batch ID and upsert
  const stamped = records.map((r) => ({
    ...r,
    upload_batch_id: batchId,
    declaration_date: r.declaration_date ? new Date(r.declaration_date) : undefined,
    inspection_status: 'NEW',
  }));

  const bulkOps = stamped.map((record) => ({
    updateOne: {
      filter: { container_id: record.container_id },
      update: { $set: record },
      upsert: true,
    },
  }));

  await Container.bulkWrite(bulkOps, { ordered: false });
  logger.info(`[Inline] Upserted ${total} records (batch: ${batchId})`);

  // Run ML predictions in chunks (has built-in heuristic fallback)
  const CHUNK = 200;
  let processed = 0;
  let failed = 0;
  for (let i = 0; i < stamped.length; i += CHUNK) {
    const chunk = stamped.slice(i, i + CHUNK);
    try {
      await predictBatch(chunk);
    } catch (err) {
      failed += chunk.length;
      logger.warn(`[Inline] Prediction chunk failed: ${err.message}`);
    }
    processed += chunk.length;
  }

  // Invalidate dashboard cache
  try { await deleteCache('dashboard:summary'); } catch { /* ignore */ }

  // Mark job completed
  await Job.updateOne(
    { job_id: jobId },
    {
      status: 'completed',
      progress: 100,
      completed_at: new Date(),
      'metadata.batch_id': batchId,
      'metadata.total_records': total,
      'metadata.processed_records': processed,
      $push: { logs: { level: 'info', message: `Processed ${processed}/${total} records inline.` } },
    }
  );

  // Clean up temp file
  try { fs.unlinkSync(filePath); } catch { /* ignore */ }

  return { jobId, batchId, total, processed, failed };
};

/**
 * POST /api/upload
 */
const uploadDataset = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'No file uploaded. Please attach a CSV or Excel file.',
      request_id: req.requestId,
    });
  }

  const filePath = req.file.path;
  const originalFilename = req.file.originalname;
  const userId = req.user ? req.user._id : null;

  try {
    // Detect serverless: VERCEL env var, VERCEL_URL, or AWS_LAMBDA
    const isServerless = !!(process.env.VERCEL || process.env.VERCEL_URL || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME);
    if (isServerless) {
      logger.info(`[Vercel] Processing upload inline: ${originalFilename}`);
      const result = await processInline(filePath, originalFilename, userId);

      await audit({
        user: req.user,
        action: 'UPLOAD_DATASET',
        entityType: 'Job',
        entityId: result.jobId,
        req,
        metadata: { filename: originalFilename },
      });

      return res.status(200).json({
        success: true,
        message: `Upload complete. ${result.processed} of ${result.total} records processed.`,
        job_id: result.jobId,
        batch_id: result.batchId,
        total_records: result.total,
        processed_records: result.processed,
        failed_records: result.failed,
      });
    }

    // Non-Vercel: use background job queue
    logger.info(`Queuing upload job for: ${originalFilename}`);
    const jobId = await enqueueJob(
      'UPLOAD_DATASET',
      {
        file_path: filePath,
        metadata: {
          filename: path.basename(filePath),
          original_filename: originalFilename,
        },
      },
      userId
    );

    await audit({
      user: req.user,
      action: 'UPLOAD_DATASET',
      entityType: 'Job',
      entityId: jobId,
      req,
      metadata: { filename: originalFilename },
    });

    return res.status(202).json({
      success: true,
      message: 'File accepted. Processing started in background.',
      job_id: jobId,
      poll_url: `/api/jobs/${jobId}`,
    });
  } catch (error) {
    logger.error(`Upload error: ${error.message}`);
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
    return res.status(500).json({
      success: false,
      message: `Upload failed: ${error.message}`,
      request_id: req.requestId,
    });
  }
};

/**
 * GET /api/upload/batches
 * List all upload batches with record counts.
 */
const listBatches = async (req, res) => {
  try {
    const batches = await Container.aggregate([
      { $match: { upload_batch_id: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: '$upload_batch_id',
          count: { $sum: 1 },
          uploaded_at: { $first: '$createdAt' },
        },
      },
      { $sort: { uploaded_at: -1 } },
      { $limit: 50 },
    ]);

    return res.status(200).json({
      success: true,
      batches: batches.map((b) => ({
        batch_id: b._id,
        record_count: b.count,
        uploaded_at: b.uploaded_at,
      })),
    });
  } catch (error) {
    logger.error(`List batches error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { uploadDataset, listBatches };
