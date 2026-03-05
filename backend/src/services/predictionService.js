/**
 * Prediction Service
 * Orchestrates feature engineering → ML microservice call → risk classification → persistence
 */
const axios = require('axios');
const Container = require('../models/containerModel');
const { engineerFeatures, engineerBatchFeatures, buildFrequencyMaps } = require('../utils/featureEngineering');
const { classifyAndExplain } = require('../utils/riskClassifier');
const { getCache, setCache } = require('../config/redis');
const logger = require('../utils/logger');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

/**
 * Call the Python ML microservice to get a risk score for one record.
 *
 * @param {Object} features - engineered feature object
 * @returns {Promise<{ risk_score: number, anomaly_score: number, anomaly_flag: boolean }>}
 */
const callMLService = async (features) => {
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/predict`, features, {
      timeout: 10000,
    });
    return response.data;
  } catch (error) {
    logger.warn(`ML service unavailable: ${error.message} - using fallback heuristic`);
    // Fallback: compute a basic heuristic risk score in Node.js
    return computeHeuristicRisk(features);
  }
};

/**
 * Heuristic fallback risk scoring when ML service is unavailable.
 * Uses weighted combination of engineered features.
 *
 * @param {Object} f - engineered features
 * @returns {{ risk_score: number, anomaly_score: number, anomaly_flag: boolean }}
 */
const computeHeuristicRisk = (f) => {
  let score = 0;

  // Weight mismatch (0-30 points)
  const mismatch = Math.min((f.weight_mismatch_percentage || 0) / 100, 1);
  score += mismatch * 0.30;

  // Value to weight ratio anomaly (0-20 points)
  const vwr = f.value_to_weight_ratio || 0;
  if (vwr > 1000 || (vwr < 0.1 && vwr >= 0)) score += 0.20;

  // High dwell time (0-20 points)
  score += (f.high_dwell_time_flag ? 1 : 0) * 0.20;

  // Trade route risk (0-15 points)
  score += Math.min(f.trade_route_risk || 0, 1) * 0.15;

  // Rare importer/exporter (0-15 points)
  if ((f.importer_frequency || 0) <= 2) score += 0.075;
  if ((f.exporter_frequency || 0) <= 2) score += 0.075;

  const riskScore = Math.min(Math.max(score, 0), 1);
  const anomalyFlag = riskScore > 0.65;

  return {
    risk_score: parseFloat(riskScore.toFixed(4)),
    anomaly_score: parseFloat((riskScore * -1 + 0.5).toFixed(4)), // invert convention
    anomaly_flag: anomalyFlag,
  };
};

/**
 * Predict risk for a single container record.
 * Saves result to MongoDB.
 *
 * @param {Object} rawRecord - raw/partially processed record
 * @returns {Promise<Object>} prediction result
 */
const predictSingle = async (rawRecord) => {
  // Build frequency maps from DB for context (lightweight single-record lookup)
  const [importerCount, exporterCount] = await Promise.all([
    Container.countDocuments({ importer_id: rawRecord.importer_id }),
    Container.countDocuments({ exporter_id: rawRecord.exporter_id }),
  ]);

  const importerFreqMap = new Map([[rawRecord.importer_id, importerCount || 1]]);
  const exporterFreqMap = new Map([[rawRecord.exporter_id, exporterCount || 1]]);

  // Trade route risk from DB (ratio of critical records on this route)
  const routeKey = `${rawRecord.origin_country}->${rawRecord.destination_country}`;
  const [routeTotal, routeCritical] = await Promise.all([
    Container.countDocuments({ origin_country: rawRecord.origin_country, destination_country: rawRecord.destination_country }),
    Container.countDocuments({ origin_country: rawRecord.origin_country, destination_country: rawRecord.destination_country, risk_level: 'Critical' }),
  ]);
  const tradeRouteRiskScore = routeTotal > 0 ? routeCritical / routeTotal : 0;
  const tradeRouteRiskMap = new Map([[routeKey, tradeRouteRiskScore]]);

  const enriched = engineerFeatures(rawRecord, importerFreqMap, exporterFreqMap, tradeRouteRiskMap);
  const mlResult = await callMLService(enriched);

  const { risk_level, explanation } = classifyAndExplain(mlResult.risk_score, enriched);

  const result = {
    container_id: rawRecord.container_id,
    risk_score: mlResult.risk_score,
    risk_level,
    anomaly_flag: mlResult.anomaly_flag,
    anomaly_score: mlResult.anomaly_score,
    explanation,
    features: {
      weight_difference: enriched.weight_difference,
      weight_mismatch_percentage: enriched.weight_mismatch_percentage,
      value_to_weight_ratio: enriched.value_to_weight_ratio,
      high_dwell_time_flag: enriched.high_dwell_time_flag,
      dwell_time_hours: enriched.dwell_time_hours,
      trade_route_risk: enriched.trade_route_risk,
    },
  };

  // Persist or update in MongoDB
  await Container.findOneAndUpdate(
    { container_id: rawRecord.container_id },
    {
      ...enriched,
      risk_score: mlResult.risk_score,
      risk_level,
      anomaly_flag: mlResult.anomaly_flag,
      anomaly_score: mlResult.anomaly_score,
      explanation,
      processed_at: new Date(),
    },
    { upsert: true, new: true }
  );

  return result;
};

/**
 * Batch predict risk for an array of records (e.g. from CSV upload).
 * Calls ML service with entire batch for efficiency.
 *
 * @param {Array} rawRecords
 * @param {string} batchId - UUID for this upload batch
 * @returns {Promise<Array>} prediction results
 */
const predictBatch = async (rawRecords, batchId) => {
  const enrichedRecords = engineerBatchFeatures(rawRecords);

  let mlResults;
  try {
    const response = await axios.post(
      `${ML_SERVICE_URL}/predict-batch`,
      { records: enrichedRecords },
      { timeout: 60000 }
    );
    mlResults = response.data.predictions;
  } catch (error) {
    logger.warn(`ML batch service unavailable: ${error.message} - using heuristic fallback`);
    mlResults = enrichedRecords.map(computeHeuristicRisk);
  }

  const results = [];
  const bulkOps = [];

  for (let i = 0; i < enrichedRecords.length; i++) {
    const enriched = enrichedRecords[i];
    const ml = mlResults[i] || computeHeuristicRisk(enriched);
    const { risk_level, explanation } = classifyAndExplain(ml.risk_score, enriched);

    const resultRecord = {
      container_id: enriched.container_id,
      risk_score: ml.risk_score,
      risk_level,
      anomaly_flag: ml.anomaly_flag,
      anomaly_score: ml.anomaly_score,
      explanation,
    };
    results.push(resultRecord);

    bulkOps.push({
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
            upload_batch_id: batchId,
            processed_at: new Date(),
          },
        },
        upsert: true,
      },
    });
  }

  // Bulk write to MongoDB in one round-trip
  if (bulkOps.length > 0) {
    await Container.bulkWrite(bulkOps, { ordered: false });
  }

  return results;
};

/**
 * Trigger ML training pipeline via ML microservice.
 *
 * @returns {Promise<Object>} training result
 */
const triggerTraining = async () => {
  const response = await axios.post(`${ML_SERVICE_URL}/train`, {}, { timeout: 300000 });
  return response.data;
};

module.exports = { predictSingle, predictBatch, triggerTraining, computeHeuristicRisk };
