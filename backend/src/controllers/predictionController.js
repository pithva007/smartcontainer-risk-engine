/**
 * Prediction Controller
 * Handles single prediction, batch prediction, and model training triggers.
 */
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { Parser } = require('json2csv');
const { predictSingle, predictBatch, triggerTraining, callMLService, computeHeuristicRisk } = require('../services/predictionService');
const { reprocessAll, getProgress } = require('../services/mlBulkService');
const { parseFile } = require('../utils/fileParser');
const { generatePredictionCSV, buildPredictionSummary } = require('../services/reportService');
const { engineerFeatures } = require('../utils/featureEngineering');
const { classifyAndExplain } = require('../utils/riskClassifier');
const Container = require('../models/containerModel');
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

    const { results: predictions, autoEscalatedCount } = await predictBatch(records, batchId);

    // Build merged output rows (original fields + prediction columns)
    const outputRows = records.map((r, i) => ({
      Container_ID: r.container_id || '',
      Origin_Country: r.origin_country || '',
      Destination_Country: r.destination_country || '',
      Declared_Weight: r.declared_weight || '',
      Measured_Weight: r.measured_weight || '',
      Declared_Value: r.declared_value || '',
      Dwell_Time_Hours: r.dwell_time_hours || '',
      Model_Risk_Score: predictions[i]?.model_risk_score ?? '',
      Model_Risk_Level: predictions[i]?.model_risk_level ?? '',
      Final_Risk_Score: predictions[i]?.final_risk_score ?? predictions[i]?.risk_score ?? '',
      Final_Risk_Level: predictions[i]?.final_risk_level ?? predictions[i]?.risk_level ?? '',
      Auto_Escalated: (predictions[i]?.auto_escalated_by_importer_history || predictions[i]?.auto_escalated_by_new_trader_rule) ? 'Yes' : 'No',
      Anomaly_Flag: predictions[i]?.anomaly_flag ?? '',
      Explanation: predictions[i]?.explanation ?? '',
    }));

    // Build focused prediction rows (Container_ID, Risk_Score, Risk_Level, Explanation_Summary)
    const predictionRows = predictions.map((p, i) => ({
      container_id: records[i]?.container_id || '',
      risk_score: p.final_risk_score ?? p.risk_score,
      risk_level: p.final_risk_level ?? p.risk_level,
      explanation: p.explanation,
    }));
    const summary = buildPredictionSummary(predictionRows);

    const parser = new Parser({ fields: Object.keys(outputRows[0]) });
    const csv = parser.parse(outputRows);

    // Stream CSV to client as download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="predictions_${batchId}.csv"`);
    // Include summary in custom headers so clients can read it
    res.setHeader('X-Prediction-Total',       String(summary.total));
    res.setHeader('X-Prediction-Critical',    String(summary.critical));
    res.setHeader('X-Prediction-LowRisk',     String(summary.low_risk));
    res.setHeader('X-Prediction-Clear',       String(summary.clear));
    res.setHeader('X-Prediction-AutoEscalated', String(autoEscalatedCount));
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

/**
 * POST /api/simulate-risk
 * Container Risk Simulator — evaluate hypothetical feature combinations.
 * Unlike /api/predict, this endpoint does NOT persist results to MongoDB.
 * Returns full enriched result: risk score, level, explanation, top_factors,
 * and inspection recommendation.
 *
 * Accepts any subset of container fields; all are optional.
 */
const simulateRisk = async (req, res) => {
  const record = {
    container_id: req.body.container_id || `SIM-${Date.now()}`,
    ...req.body,
  };

  try {
    // Build frequency maps from DB for contextual enrichment
    const [importerCount, exporterCount] = await Promise.all([
      Container.countDocuments({ importer_id: record.importer_id }),
      Container.countDocuments({ exporter_id: record.exporter_id }),
    ]);
    const importerFreqMap = new Map([[record.importer_id, importerCount || 1]]);
    const exporterFreqMap = new Map([[record.exporter_id, exporterCount || 1]]);

    const routeKey = `${record.origin_country}->${record.destination_country}`;
    const [routeTotal, routeCritical] = await Promise.all([
      Container.countDocuments({ origin_country: record.origin_country, destination_country: record.destination_country }),
      Container.countDocuments({ origin_country: record.origin_country, destination_country: record.destination_country, risk_level: 'Critical' }),
    ]);
    const tradeRouteRiskScore = routeTotal > 0 ? routeCritical / routeTotal : 0;
    const tradeRouteRiskMap = new Map([[routeKey, tradeRouteRiskScore]]);

    const enriched = engineerFeatures(record, importerFreqMap, exporterFreqMap, tradeRouteRiskMap);
    const mlResult = await callMLService(enriched).catch(() => computeHeuristicRisk(enriched));
    const { risk_level, explanation, inspection_recommendation } = classifyAndExplain(mlResult.risk_score, enriched);

    return res.status(200).json({
      success: true,
      simulation: {
        container_id: record.container_id,
        risk_score: mlResult.risk_score,
        risk_level,
        anomaly_flag: mlResult.anomaly_flag,
        anomaly_score: mlResult.anomaly_score,
        top_factors: mlResult.top_factors || [],
        explanation,
        inspection_recommendation,
        engineered_features: {
          weight_mismatch_percentage: enriched.weight_mismatch_percentage,
          weight_difference: enriched.weight_difference,
          is_declared_zero: enriched.is_declared_zero,
          excessive_dwell_time: enriched.excessive_dwell_time,
          value_to_weight_ratio: enriched.value_to_weight_ratio,
          trade_route_risk: enriched.trade_route_risk,
          importer_frequency: enriched.importer_frequency,
          exporter_frequency: enriched.exporter_frequency,
        },
      },
    });
  } catch (error) {
    logger.error(`Risk simulation error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { predictContainer, predictBatchFromFile, trainModel, reprocessAllContainers, getReprocessProgress, simulateRisk };
