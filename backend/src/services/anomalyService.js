/**
 * Anomaly Detection Service
 * Interfaces with the Python ML microservice for Isolation Forest predictions
 * and provides utilities for anomaly analysis.
 */
const axios = require('axios');
const Container = require('../models/containerModel');
const { engineerBatchFeatures } = require('../utils/featureEngineering');
const logger = require('../utils/logger');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

/**
 * Run anomaly detection for a single record.
 *
 * @param {Object} features - engineered feature object
 * @returns {Promise<{ anomaly_flag: boolean, anomaly_score: number }>}
 */
const detectAnomalySingle = async (features) => {
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/anomaly`, features, { timeout: 10000 });
    return response.data;
  } catch (error) {
    logger.warn(`Anomaly service error: ${error.message} - using local fallback`);
    return localAnomalyFallback(features);
  }
};

/**
 * Batch anomaly detection for multiple records.
 *
 * @param {Array} features - array of engineered feature objects
 * @returns {Promise<Array<{ anomaly_flag: boolean, anomaly_score: number }>>}
 */
const detectAnomalyBatch = async (features) => {
  try {
    const response = await axios.post(
      `${ML_SERVICE_URL}/anomaly-batch`,
      { records: features },
      { timeout: 60000 }
    );
    return response.data.results;
  } catch (error) {
    logger.warn(`Anomaly batch service error: ${error.message} - using local fallback`);
    return features.map(localAnomalyFallback);
  }
};

/**
 * Simple statistical anomaly fallback when ML service is unavailable.
 * Uses z-score-like logic on key features.
 */
const localAnomalyFallback = (f) => {
  let anomalySignals = 0;

  // Extreme weight mismatch
  if ((f.weight_mismatch_percentage || 0) > 50) anomalySignals++;

  // Extreme value-to-weight ratio
  const vwr = f.value_to_weight_ratio || 0;
  if (vwr > 5000 || (vwr < 0.01 && vwr >= 0)) anomalySignals++;

  // Very high dwell time
  if ((f.dwell_time_hours || 0) > 240) anomalySignals++;

  // First-time importer/exporter on a risky route
  if ((f.importer_frequency || 0) === 1 && (f.trade_route_risk || 0) > 0.5) anomalySignals++;

  const anomalyFlag = anomalySignals >= 2;

  return {
    anomaly_flag: anomalyFlag,
    anomaly_score: parseFloat((anomalySignals * 0.25).toFixed(4)), // 0.0–1.0 range
  };
};

/**
 * Retrieve anomalous containers from the database.
 *
 * @param {Object} filters - optional MongoDB filter
 * @param {number} limit
 * @returns {Promise<Array>}
 */
const getAnomalies = async (filters = {}, limit = 100) => {
  return Container.find({ anomaly_flag: true, ...filters })
    .sort({ anomaly_score: -1, risk_score: -1 })
    .limit(limit)
    .lean();
};

/**
 * Get anomaly statistics summary.
 * @returns {Promise<Object>}
 */
const getAnomalyStats = async () => {
  const [total, critical, lowRisk] = await Promise.all([
    Container.countDocuments({ anomaly_flag: true }),
    Container.countDocuments({ anomaly_flag: true, risk_level: 'Critical' }),
    Container.countDocuments({ anomaly_flag: true, risk_level: 'Low Risk' }),
  ]);

  return {
    total_anomalies: total,
    critical_anomalies: critical,
    low_risk_anomalies: lowRisk,
    clear_anomalies: total - critical - lowRisk,
  };
};

module.exports = {
  detectAnomalySingle,
  detectAnomalyBatch,
  localAnomalyFallback,
  getAnomalies,
  getAnomalyStats,
};
