/**
 * ML Bulk Reprocessing Service
 * Fetches all containers from MongoDB and runs them through the ML prediction
 * pipeline in chunks, updating risk_level, risk_score, and anomaly fields.
 * Designed to be called once on server startup to backfill unscored records,
 * and also exposed as an admin API endpoint for on-demand reprocessing.
 */
const Container = require('../models/containerModel');
const { predictBatch } = require('./predictionService');
const { deleteCache } = require('../config/redis');
const logger = require('../utils/logger');

const CHUNK_SIZE = 200;

/** Shared state so the caller can check progress without polling the DB */
let _running = false;
let _progress = { processed: 0, total: 0, failed: 0, startedAt: null, finishedAt: null };

/**
 * Run the bulk reprocessing pipeline.
 *
 * @param {Object} [opts]
 * @param {boolean} [opts.forceAll=false]  - Reprocess every record, not just unscored ones
 * @param {Function} [opts.onProgress]     - Optional callback(processed, total)
 * @returns {Promise<{ processed, failed, total }>}
 */
const reprocessAll = async ({ forceAll = false, onProgress } = {}) => {
  if (_running) {
    throw new Error('Bulk reprocessing is already in progress.');
  }

  _running = true;
  _progress = { processed: 0, total: 0, failed: 0, startedAt: new Date(), finishedAt: null };

  try {
    // Count target records
    const filter = forceAll ? {} : { processed_at: { $exists: false } };
    const total = await Container.countDocuments(filter);
    _progress.total = total;

    if (total === 0) {
      logger.info('[mlBulkService] No containers require reprocessing.');
      return { processed: 0, failed: 0, total: 0 };
    }

    logger.info(`[mlBulkService] Starting bulk reprocess of ${total} containers (forceAll=${forceAll})`);

    let skip = 0;
    let processed = 0;
    let failed = 0;

    while (skip < total) {
      const chunk = await Container.find(filter)
        .select(
          'container_id origin_country destination_country importer_id exporter_id ' +
          'declared_value declared_weight measured_weight dwell_time_hours ' +
          'declaration_date hs_code trade_regime shipping_line clearance_status upload_batch_id'
        )
        .skip(skip)
        .limit(CHUNK_SIZE)
        .lean();

      if (chunk.length === 0) break;

      try {
        await predictBatch(chunk);
        processed += chunk.length;
      } catch (err) {
        logger.warn(`[mlBulkService] Chunk at skip=${skip} failed: ${err.message}`);
        failed += chunk.length;
        processed += chunk.length; // still count as processed (attempted)
      }

      skip += CHUNK_SIZE;
      _progress.processed = processed;
      _progress.failed = failed;

      if (typeof onProgress === 'function') {
        onProgress(processed, total);
      }

      logger.debug(`[mlBulkService] Progress: ${processed}/${total}`);
    }

    // Invalidate all dashboard-related Redis caches
    await Promise.allSettled([
      deleteCache('dashboard:summary'),
      deleteCache('dashboard:risk_dist'),
      deleteCache('dashboard:anomalies'),
      deleteCache('dashboard:high_risk'),
    ]);

    _progress.finishedAt = new Date();
    logger.info(`[mlBulkService] Completed. processed=${processed}, failed=${failed}, total=${total}`);

    return { processed, failed, total };
  } finally {
    _running = false;
  }
};

/** Returns a snapshot of the current (or last) reprocessing run state */
const getProgress = () => ({ ..._progress, running: _running });

module.exports = { reprocessAll, getProgress };
