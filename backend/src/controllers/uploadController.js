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
const { engineerBatchFeatures } = require('../utils/featureEngineering');
const { computeHeuristicRisk } = require('../services/predictionService');
const { classifyAndExplain } = require('../utils/riskClassifier');
const { deleteCache } = require('../config/redis');
const logger = require('../utils/logger');
const Job = require('../models/jobModel');

/**
 * Process the uploaded file inline (used on Vercel where background jobs don't work).
 * Uses pure in-memory heuristic scoring — no HTTP calls, no chunked DB loops.
 * Total MongoDB round-trips: 3 (create job + one bulk upsert + update job).
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

  // Engineer features for all records in one pass (pure CPU, all in-memory)
  const enrichedRecords = engineerBatchFeatures(
    records.map((r) => ({
      ...r,
      upload_batch_id: batchId,
      declaration_date: r.declaration_date ? new Date(r.declaration_date) : undefined,
      inspection_status: 'NEW',
    }))
  );

  // Compute heuristic risk for every record (pure CPU, no HTTP, no per-chunk DB writes)
  const now = new Date();
  const bulkOps = enrichedRecords.map((enriched) => {
    const ml = computeHeuristicRisk(enriched);
    const { risk_level, explanation } = classifyAndExplain(ml.risk_score, enriched);
    return {
      updateOne: {
        filter: { container_id: enriched.container_id },
        update: {
          $set: {
            ...enriched,
            risk_score: ml.risk_score,
            risk_level,
            anomaly_flag: ml.anomaly_flag,
            anomaly_score: ml.anomaly_score,
            explanation,
            processed_at: now,
          },
        },
        upsert: true,
      },
    };
  });

  // ONE single bulkWrite — raw data + risk scores in a single round-trip
  await Container.bulkWrite(bulkOps, { ordered: false });
  logger.info(`[Inline] Upserted ${total} records with risk scores (batch: ${batchId})`);

  // Invalidate all dashboard caches so the UI refreshes immediately
  const cacheKeys = [
    'dashboard:summary',
    'dashboard:risk_dist',
    'dashboard:recent_high_risk:500',
    'dashboard:recent_high_risk:1000',
    'dashboard:top_routes:10',
    'dashboard:top_routes:50',
  ];
  await Promise.all(cacheKeys.map((k) => deleteCache(k).catch(() => {})));

  // Mark job completed
  await Job.updateOne(
    { job_id: jobId },
    {
      status: 'completed',
      progress: 100,
      completed_at: new Date(),
      'metadata.batch_id': batchId,
      'metadata.total_records': total,
      'metadata.processed_records': total,
      $push: { logs: { level: 'info', message: `Processed ${total}/${total} records inline.` } },
    }
  );

  // Clean up temp file
  try { fs.unlinkSync(filePath); } catch { /* ignore */ }

  return { jobId, batchId, total, processed: total, failed: 0 };
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
    // On any serverless platform (Vercel, AWS Lambda, etc.) the BullMQ Worker
    // runs in a DIFFERENT Lambda invocation where /tmp is empty — the uploaded
    // file is gone by the time the worker runs.  Always process inline on
    // serverless regardless of whether Redis is available.
    const isServerless = !!(process.env.VERCEL || process.env.VERCEL_URL ||
      process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME);
    const { isRedisAvailable } = require('../services/jobQueueService');
    const useInline = isServerless || !isRedisAvailable;

    if (useInline) {
      logger.info(`[Inline] Processing upload: ${originalFilename}`);
      let result;
      try {
        result = await processInline(filePath, originalFilename, userId);
      } catch (inlineErr) {
        // Mark the job as failed in MongoDB so the UI shows the correct status
        logger.error(`[Inline] Processing failed: ${inlineErr.message}`);
        try {
          const Job = require('../models/jobModel');
          await Job.updateOne(
            { 'metadata.original_filename': originalFilename, status: { $in: ['active', 'waiting'] } },
            { status: 'failed', error: inlineErr.message, completed_at: new Date(),
              $push: { logs: { level: 'error', message: inlineErr.message } } }
          );
        } catch { /* best-effort */ }
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
        return res.status(500).json({
          success: false,
          message: `Processing failed: ${inlineErr.message}`,
          request_id: req.requestId,
        });
      }

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
