/**
 * Upload Job Processor
 * Registered with jobQueueService for type UPLOAD_DATASET.
 * Parses the uploaded file, runs ML predictions, upserts containers,
 * creates shipment tracks, and writes a result CSV.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { Parser } = require('json2csv');

const Container = require('../models/containerModel');
const { parseFile } = require('../utils/fileParser');
const { predictBatch } = require('../services/predictionService');
const { getOrCreateTrack } = require('../services/trackingService');
const { deleteCache } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Upload Dataset Job Handler
 *
 * @param {Object} data - { file_path, metadata: { filename, original_filename } }
 * @param {Function} progressFn - async (pct, message) => void
 * @param {string} jobId
 */
const processUploadJob = async (data, progressFn, jobId) => {
  const { file_path, metadata = {} } = data;

  await progressFn(2, `Starting upload job for file: ${metadata.original_filename}`);

  if (!file_path || !fs.existsSync(file_path)) {
    throw new Error(`File not found at path: ${file_path}`);
  }

  // Parse CSV/Excel
  await progressFn(5, 'Parsing file records...');
  const records = await parseFile(file_path);

  if (!records || records.length === 0) {
    throw new Error('File contains no valid records.');
  }

  const total = records.length;
  const batchId = uuidv4();
  await progressFn(10, `Parsed ${total} records. Batch ID: ${batchId}`);

  // Stamp batch ID
  const stamped = records.map((r) => ({
    ...r,
    upload_batch_id: batchId,
    declaration_date: r.declaration_date ? new Date(r.declaration_date) : undefined,
    inspection_status: 'NEW',
  }));

  // Bulk upsert raw records first (fast)
  const bulkOps = stamped.map((record) => ({
    updateOne: {
      filter: { container_id: record.container_id },
      update: { $set: record },
      upsert: true,
    },
  }));

  await Container.bulkWrite(bulkOps, { ordered: false });
  await progressFn(25, `Upserted ${total} records to MongoDB.`);

  // Run ML predictions in chunks
  const CHUNK_SIZE = 100;
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < stamped.length; i += CHUNK_SIZE) {
    const chunk = stamped.slice(i, i + CHUNK_SIZE);
    try {
      await predictBatch(chunk);
    } catch (err) {
      failed += chunk.length;
      logger.warn(`[Job ${jobId}] Prediction chunk failed: ${err.message}`);
    }
    processed += chunk.length;
    const pct = 25 + Math.round((processed / total) * 55);
    await progressFn(pct, `ML predictions: ${processed}/${total} processed`);
  }

  await progressFn(82, 'Building shipment tracking records...');

  // Create tracking records for a sample (first 500 or all if small)
  const containersForTracking = await Container.find({ upload_batch_id: batchId })
    .limit(500)
    .lean();

  let trackCount = 0;
  for (const c of containersForTracking) {
    try {
      await getOrCreateTrack(c);
      trackCount++;
    } catch {
      // non-critical
    }
  }

  await progressFn(90, `Created ${trackCount} tracking records.`);

  // Invalidate dashboard cache
  await deleteCache('dashboard:summary');

  // Write result CSV for download
  const resultFile = path.join(os.tmpdir(), `job-${jobId}-result.csv`);
  try {
    const results = await Container.find({ upload_batch_id: batchId })
      .select('container_id origin_country destination_country risk_score risk_level anomaly_flag explanation inspection_status')
      .limit(10000)
      .lean();

    const parser = new Parser({
      fields: ['container_id', 'origin_country', 'destination_country', 'risk_score', 'risk_level', 'anomaly_flag', 'explanation', 'inspection_status'],
      withBOM: true,
    });
    fs.writeFileSync(resultFile, parser.parse(results));
  } catch (csvErr) {
    logger.warn(`[Job ${jobId}] Result CSV generation failed: ${csvErr.message}`);
  }

  await progressFn(100, `Job complete. ${processed} records processed, ${failed} failed.`);

  // Clean up uploaded temp file
  try { fs.unlinkSync(file_path); } catch { /* ignore */ }

  return {
    batch_id: batchId,
    total_records: total,
    processed_records: processed,
    failed_records: failed,
    result_file: fs.existsSync(resultFile) ? resultFile : null,
  };
};

module.exports = { processUploadJob };
