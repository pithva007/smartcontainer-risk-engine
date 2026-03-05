/**
 * Upload Controller
 * Handles CSV/Excel file ingestion — enqueues an async background job and
 * returns a job_id immediately so the caller can poll /api/jobs/:job_id.
 */
const path = require('path');
const fs = require('fs');
const Container = require('../models/containerModel');
const { enqueueJob } = require('../services/jobQueueService');
const { audit } = require('../services/auditService');
const logger = require('../utils/logger');

/**
 * POST /api/upload
 * Upload a CSV or Excel shipment dataset.
 * Returns 202 Accepted with a job_id for progress polling.
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

  try {
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
      req.user ? req.user._id : null
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
    logger.error(`Upload enqueue error: ${error.message}`);
    // Clean up on enqueue failure
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
