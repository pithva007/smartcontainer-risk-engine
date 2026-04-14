/**
 * Streaming Upload Controller
 *
 * POST /api/upload/stream
 *
 * Accepts a CSV/XLSX file upload and processes it row-by-row in the background.
 * Each predicted row is persisted immediately, then exposed to clients via
 * polling endpoints.
 *
 * Flow:
 *   1. Parse entire file into an array of raw records (fast, pure I/O)
 *   2. Respond 202 right away so the HTTP upload is confirmed
 *   3. In the background:
 *      a. Engineer features for ALL records in one CPU pass
 *      b. Process rows in chunks of CHUNK_SIZE
 *      c. For each chunk — call ML microservice (falls back to heuristic)
 *      d. Persist each result row immediately
 *      e. Flush chunk to MongoDB via bulkWrite
 *      f. Persist job progress after each chunk
 *   4. Mark job completed when finished
 */
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

const Container = require('../models/containerModel');
const Job = require('../models/jobModel');
const { parseFile } = require('../utils/fileParser');
const { engineerBatchFeatures } = require('../utils/featureEngineering');
const { computeHeuristicRisk } = require('../services/predictionService');
const { classifyAndExplain } = require('../utils/riskClassifier');
const { deleteCache } = require('../config/redis');
const {
  broadcastPredictionRow,
  broadcastProgress,
  broadcastDone,
  broadcastError,
} = require('../services/socketService');
const { audit } = require('../services/auditService');
const logger = require('../utils/logger');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

/** Rows sent to the ML microservice in a single batch call */
const CHUNK_SIZE = 25;

/** Maximum rows flushed to MongoDB in one bulkWrite call */
const DB_FLUSH_SIZE = 200;

/**
 * Call the ML microservice for a chunk of enriched records.
 * Returns an array of `{ risk_score, anomaly_flag, anomaly_score }` objects
 * in the same order. Falls back to heuristic scoring on any error.
 *
 * @param {Object[]} enrichedChunk
 * @returns {Promise<Object[]>}
 */
const callMLBatch = async (enrichedChunk) => {
  try {
    const response = await axios.post(
      `${ML_SERVICE_URL}/predict-batch`,
      { records: enrichedChunk },
      { timeout: 30000 }
    );
    const predictions = response.data?.predictions;
    if (Array.isArray(predictions) && predictions.length === enrichedChunk.length) {
      return predictions;
    }
    throw new Error('ML service returned unexpected shape');
  } catch (err) {
    logger.warn(`[StreamUpload] ML batch failed (${err.message}) — using heuristic fallback`);
    return enrichedChunk.map(computeHeuristicRisk);
  }
};

/**
 * POST /api/upload/stream
 *
 * Responds with 202 immediately and begins processing asynchronously.
 */
const streamUpload = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded. Please attach a CSV or Excel file.' });
  }

  const filePath = req.file.path;
  const originalFilename = req.file.originalname;
  const userId = req.user?._id ?? null;
  const jobId = uuidv4();
  const batchId = uuidv4();

  // Respond immediately — the browser's upload is complete, processing is async
  res.status(202).json({
    success: true,
    job_id: jobId,
    batch_id: batchId,
    message: 'File received. Prediction stream starting — watch the live feed on your dashboard.',
  });

  // ── Async background processing ───────────────────────────────────────────
  setImmediate(async () => {
    let total = 0;
    let processed = 0;
    let failed = 0;

    try {
      // Create job record
      await Job.create({
        job_id: jobId,
        type: 'UPLOAD_DATASET',
        status: 'active',
        created_by: userId || undefined,
        metadata: { original_filename: originalFilename, batch_id: batchId },
        started_at: new Date(),
      });

      // Parse file
      const records = await parseFile(filePath);
      if (!records || records.length === 0) {
        throw new Error('File contains no valid records.');
      }

      total = records.length;
      logger.info(`[StreamUpload job=${jobId}] Starting stream of ${total} records`);

      // Stamp metadata
      const stamped = records.map((r) => ({
        ...r,
        upload_batch_id: batchId,
        declaration_date: r.declaration_date ? new Date(r.declaration_date) : undefined,
        inspection_status: r.inspection_status || 'NEW',
      }));

      // Engineer ALL features in one synchronous pass (fast, no I/O)
      const enrichedAll = engineerBatchFeatures(stamped);

      const bulkBuffer = [];

      for (let i = 0; i < enrichedAll.length; i += CHUNK_SIZE) {
        const chunk = enrichedAll.slice(i, i + CHUNK_SIZE);

        // Call ML microservice (or heuristic fallback)
        const mlResults = await callMLBatch(chunk);

        const now = new Date();

        for (let j = 0; j < chunk.length; j++) {
          const enriched = chunk[j];
          const ml = mlResults[j] || computeHeuristicRisk(enriched);
          const { risk_level, explanation } = classifyAndExplain(ml.risk_score ?? 0, enriched);

          // Broadcast individual row immediately
          broadcastPredictionRow({
            job_id: jobId,
            batch_id: batchId,
            container_id: enriched.container_id,
            risk_score: ml.risk_score ?? 0,
            risk_level,
            anomaly_flag: ml.anomaly_flag ?? false,
            anomaly_score: ml.anomaly_score ?? 0,
            explanation,
            origin_country: enriched.origin_country || '',
            destination_country: enriched.destination_country || '',
            declared_value: enriched.declared_value || 0,
            declared_weight: enriched.declared_weight || 0,
            processed_at: now.toISOString(),
          });

          // Accumulate for bulk DB write
          bulkBuffer.push({
            updateOne: {
              filter: { container_id: enriched.container_id },
              update: {
                $set: {
                  ...enriched,
                  risk_score: ml.risk_score ?? 0,
                  risk_level,
                  anomaly_flag: ml.anomaly_flag ?? false,
                  anomaly_score: ml.anomaly_score ?? 0,
                  explanation,
                  processed_at: now,
                },
              },
              upsert: true,
            },
          });

          processed++;
        }

        // Flush buffer to DB whenever it reaches the threshold
        if (bulkBuffer.length >= DB_FLUSH_SIZE) {
          const toWrite = bulkBuffer.splice(0, bulkBuffer.length);
          await Container.bulkWrite(toWrite, { ordered: false }).catch((err) => {
            failed += toWrite.length;
            logger.warn(`[StreamUpload job=${jobId}] DB flush error: ${err.message}`);
          });
        }

        // Persist job progress after each chunk so clients can poll it.
        const currentPercent = Math.round((processed / total) * 100);
        await Job.updateOne(
          { job_id: jobId },
          {
            status: 'active',
            progress: currentPercent,
            'metadata.total_records': total,
            'metadata.processed_records': processed,
            'metadata.failed_records': failed,
          }
        );

        // Backward-compatible no-op broadcast shim.
        broadcastProgress({
          job_id: jobId,
          processed,
          total,
          percent: currentPercent,
        });

        // Yield to event loop between chunks.
        await new Promise((resolve) => setImmediate(resolve));
      }

      // Final DB flush
      if (bulkBuffer.length > 0) {
        await Container.bulkWrite(bulkBuffer, { ordered: false }).catch((err) => {
          failed += bulkBuffer.length;
          logger.warn(`[StreamUpload job=${jobId}] Final DB flush error: ${err.message}`);
        });
      }

      // Invalidate all relevant Redis caches
      await Promise.allSettled([
        deleteCache('dashboard:summary'),
        deleteCache('dashboard:risk_dist'),
        deleteCache('dashboard:recent_high_risk:500'),
        deleteCache('dashboard:recent_high_risk:1000'),
        deleteCache('dashboard:top_routes:10'),
        deleteCache('dashboard:top_routes:50'),
      ]);

      // Broadcast completion
      broadcastDone({ job_id: jobId, batch_id: batchId, total, processed, failed });

      // Update job record
      await Job.updateOne(
        { job_id: jobId },
        {
          status: failed === total ? 'failed' : 'completed',
          progress: 100,
          completed_at: new Date(),
          'metadata.total_records': total,
          'metadata.processed_records': processed,
          'metadata.failed_records': failed,
          $push: {
            logs: {
              level: 'info',
              message: `Streamed ${processed}/${total} records (${failed} failed).`,
            },
          },
        }
      );

      // Audit log
      await audit({
        action: 'UPLOAD_DATASET',
        entityType: 'Job',
        entityId: jobId,
        metadata: { filename: originalFilename, total, processed, failed },
      }).catch(() => {});

      logger.info(`[StreamUpload job=${jobId}] Complete — ${processed}/${total} rows, ${failed} failed`);
    } catch (err) {
      logger.error(`[StreamUpload job=${jobId}] Fatal error: ${err.message}`);
      broadcastError({ job_id: jobId, message: err.message });

      await Job.updateOne(
        { job_id: jobId },
        {
          status: 'failed',
          error: err.message,
          completed_at: new Date(),
          $push: { logs: { level: 'error', message: err.message } },
        }
      ).catch(() => {});
    } finally {
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }
    }
  });
};

module.exports = { streamUpload };
