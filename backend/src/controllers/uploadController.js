/**
 * Upload Controller
 * Handles CSV/Excel file ingestion, parses records, stores raw data in MongoDB.
 */
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { parseFile } = require('../utils/fileParser');
const Container = require('../models/containerModel');
const { deleteCache } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * POST /api/upload
 * Upload a CSV or Excel shipment dataset.
 * Validates file, parses records, bulk-inserts into MongoDB.
 */
const uploadDataset = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'No file uploaded. Please attach a CSV or Excel file.',
    });
  }

  const filePath = req.file.path;
  const batchId = uuidv4();

  try {
    logger.info(`Processing upload: ${req.file.originalname} (batchId: ${batchId})`);

    const records = await parseFile(filePath);

    if (!records || records.length === 0) {
      return res.status(422).json({
        success: false,
        message: 'File parsed but contains no valid records.',
      });
    }

    // Attach batch ID to each record
    const stamped = records.map((r) => ({
      ...r,
      upload_batch_id: batchId,
      declaration_date: r.declaration_date ? new Date(r.declaration_date) : undefined,
    }));

    // Bulk insert — upsert by container_id to prevent duplicates
    const bulkOps = stamped.map((record) => ({
      updateOne: {
        filter: { container_id: record.container_id },
        update: { $set: record },
        upsert: true,
      },
    }));

    const bulkResult = await Container.bulkWrite(bulkOps, { ordered: false });

    // Invalidate dashboard cache
    await deleteCache('dashboard:summary');

    logger.info(`Upload complete: ${records.length} records processed (batchId: ${batchId})`);

    return res.status(200).json({
      success: true,
      message: 'Dataset uploaded successfully.',
      batch_id: batchId,
      total_records: records.length,
      inserted: bulkResult.upsertedCount,
      updated: bulkResult.modifiedCount,
    });
  } catch (error) {
    logger.error(`Upload error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: `Upload failed: ${error.message}`,
    });
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(filePath);
    } catch {
      // ignore cleanup failures
    }
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
