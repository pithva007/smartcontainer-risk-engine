/**
 * Prediction Controller
 * Handles single prediction, batch prediction, and model training triggers.
 */
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { Parser } = require('json2csv');
const { predictSingle, predictBatch, triggerTraining } = require('../services/predictionService');
const { reprocessAll, getProgress } = require('../services/mlBulkService');
const { parseFile } = require('../utils/fileParser');
const { generatePredictionCSV, buildPredictionSummary } = require('../services/reportService');
const logger = require('../utils/logger');

/**
 * POST /api/predict
 * Predict risk for a single container shipment.
 *
 * Request body: container shipment fields (see dataset structure)
 * Response: { container_id, risk_score, risk_level, anomaly_flag, explanation }
 */
const predictContainer = async (req, res) => {
  const record = req.body;

  if (!record.container_id) {
    return res.status(400).json({
      success: false,
      message: 'container_id is required.',
    });
  }

  try {
    const result = await predictSingle(record);
    return res.status(200).json({
      success: true,
      prediction: result,
    });
  } catch (error) {
    logger.error(`Single prediction error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: `Prediction failed: ${error.message}`,
    });
  }
};

/**
 * POST /api/predict-batch
 * Batch predict from an uploaded CSV/Excel file.
 * Returns a downloadable CSV with predictions appended.
 *
 * Multipart form-data: file field = "dataset"
 */
const predictBatchFromFile = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'No file uploaded. Please attach a CSV or Excel file.',
    });
  }

  const filePath = req.file.path;
  const batchId = uuidv4();

  try {
    logger.info(`Batch prediction started (batchId: ${batchId}): ${req.file.originalname}`);

    const records = await parseFile(filePath);
    if (!records || records.length === 0) {
      return res.status(422).json({ success: false, message: 'No records found in file.' });
    }

    const predictions = await predictBatch(records, batchId);

    // Build merged output rows (original fields + prediction columns)
    const outputRows = records.map((r, i) => ({
      Container_ID: r.container_id || '',
      Origin_Country: r.origin_country || '',
      Destination_Country: r.destination_country || '',
      Declared_Weight: r.declared_weight || '',
      Measured_Weight: r.measured_weight || '',
      Declared_Value: r.declared_value || '',
      Dwell_Time_Hours: r.dwell_time_hours || '',
      Risk_Score: predictions[i]?.risk_score ?? '',
      Risk_Level: predictions[i]?.risk_level ?? '',
      Anomaly_Flag: predictions[i]?.anomaly_flag ?? '',
      Explanation: predictions[i]?.explanation ?? '',
    }));

    // Build focused prediction rows (Container_ID, Risk_Score, Risk_Level, Explanation_Summary)
    const predictionRows = predictions.map((p, i) => ({
      container_id: records[i]?.container_id || '',
      risk_score: p.risk_score,
      risk_level: p.risk_level,
      explanation: p.explanation,
    }));
    const summary = buildPredictionSummary(predictionRows);

    const parser = new Parser({ fields: Object.keys(outputRows[0]) });
    const csv = parser.parse(outputRows);

    // Stream CSV to client as download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="predictions_${batchId}.csv"`);
    // Include summary in custom headers so clients can read it
    res.setHeader('X-Prediction-Total',    String(summary.total));
    res.setHeader('X-Prediction-Critical', String(summary.critical));
    res.setHeader('X-Prediction-LowRisk',  String(summary.low_risk));
    res.setHeader('X-Prediction-Clear',    String(summary.clear));
    return res.status(200).send(csv);
  } catch (error) {
    logger.error(`Batch prediction error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // ignore
    }
  }
};

/**
 * POST /api/train
 * Trigger the ML training pipeline on the current dataset.
 */
const trainModel = async (req, res) => {
  try {
    logger.info('Training pipeline triggered');
    const result = await triggerTraining();
    return res.status(200).json({
      success: true,
      message: 'Model training completed successfully.',
      metrics: result,
    });
  } catch (error) {
    logger.error(`Training error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: `Training failed: ${error.message}`,
    });
  }
};

/**
 * POST /api/predict/reprocess-all
 * Bulk-run ML predictions over all containers that have not yet been scored.
 * Pass query param ?force=true to re-score every container regardless.
 */
const reprocessAllContainers = async (req, res) => {
  const forceAll = req.query.force === 'true';

  // Kick off in background so the HTTP response returns immediately
  reprocessAll({ forceAll }).catch((err) => {
    logger.error(`[reprocessAll] Background run failed: ${err.message}`);
  });

  return res.status(202).json({
    success: true,
    message: `Bulk reprocessing started (forceAll=${forceAll}). Check /api/predict/reprocess-progress for status.`,
  });
};

/**
 * GET /api/predict/reprocess-progress
 * Returns the status of the current or last bulk reprocessing run.
 */
const getReprocessProgress = (req, res) => {
  return res.status(200).json({ success: true, progress: getProgress() });
};

module.exports = { predictContainer, predictBatchFromFile, trainModel, reprocessAllContainers, getReprocessProgress };
