/**
 * Prediction Service
 * Orchestrates feature engineering → ML microservice call → risk classification → persistence
 */
const axios = require('axios');
const Container = require('../models/containerModel');
const { engineerFeatures, engineerBatchFeatures, buildFrequencyMaps } = require('../utils/featureEngineering');
const { classifyAndExplain } = require('../utils/riskClassifier');
const { getImporterStats, getBatchImporterStats, applyAutoEscalation } = require('./importerHistoryService');
const { getExporterShipmentCount, getBatchExporterShipmentCount, applyNewTraderEscalation } = require('./exporterHistoryService');
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

  const { risk_level, explanation, inspection_recommendation } = classifyAndExplain(mlResult.risk_score, enriched);

  // ── Feature 7: Importer Critical History Auto-Escalation ─────────────────
  const importerStats = await getImporterStats(rawRecord.importer_id);

  const baseResult = {
    container_id: rawRecord.container_id,
    risk_score: mlResult.risk_score,
    risk_level,
    anomaly_flag: mlResult.anomaly_flag,
    anomaly_score: mlResult.anomaly_score,
    explanation,
    inspection_recommendation,
    top_factors: mlResult.top_factors || [],
    features: {
      weight_difference: enriched.weight_difference,
      weight_mismatch_percentage: enriched.weight_mismatch_percentage,
      value_to_weight_ratio: enriched.value_to_weight_ratio,
      high_dwell_time_flag: enriched.high_dwell_time_flag,
      dwell_time_hours: enriched.dwell_time_hours,
      trade_route_risk: enriched.trade_route_risk,
    },
  };

  // Apply escalation rule — this sets final_risk_score/level and audit fields
  const importerEscalated = applyAutoEscalation(baseResult, importerStats);

  // ── Feature 8: New Trader Safeguard Auto-Escalation ──────────────────────
  const exporterHistoryCount = await getExporterShipmentCount(rawRecord.exporter_id);
  const finalEscalated = applyNewTraderEscalation(importerEscalated, exporterHistoryCount);

  // Persist with both raw model outputs and final business-adjusted values
  await Container.findOneAndUpdate(
    { container_id: rawRecord.container_id },
    {
      ...enriched,
      // Raw ML outputs
      model_risk_score: mlResult.risk_score,
      model_risk_level: finalEscalated.model_risk_level,
      // Final decision (may differ if auto-escalated)
      risk_score: finalEscalated.final_risk_score,
      risk_level: finalEscalated.final_risk_level,
      final_risk_score: finalEscalated.final_risk_score,
      final_risk_level: finalEscalated.final_risk_level,
      // Auto-escalation audit
      auto_escalated_by_importer_history: finalEscalated.auto_escalated_by_importer_history,
      importer_critical_percentage: finalEscalated.importer_critical_percentage,
      auto_escalated_by_new_trader_rule: finalEscalated.auto_escalated_by_new_trader_rule,
      exporter_historical_shipment_count: finalEscalated.exporter_historical_shipment_count,
      new_trader_threshold_used: finalEscalated.new_trader_threshold_used,
      override_reason: finalEscalated.override_reason,
      // Other prediction fields
      anomaly_flag: mlResult.anomaly_flag,
      anomaly_score: mlResult.anomaly_score,
      explanation: finalEscalated.explanation,
      explanation_summary: finalEscalated.explanation_summary,
      prediction_source: 'single',
      processed_at: new Date(),
    },
    { upsert: true, new: true }
  );

  // Return full result including stats for frontend display
  return {
    ...finalEscalated,
    importer_stats: {
      total_shipments: importerStats.totalShipments,
      critical_shipments: importerStats.criticalShipments,
      critical_percentage: importerStats.criticalPercentage,
    },
  };
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

  // ── Feature 7 & 8: Compute all importer / exporter stats in ONE aggregation ─────────────
  const uniqueImporterIds = [...new Set(enrichedRecords.map((r) => r.importer_id).filter(Boolean))];
  const importerStatsMap = await getBatchImporterStats(uniqueImporterIds);

  const uniqueExporterIds = [...new Set(enrichedRecords.map((r) => r.exporter_id).filter(Boolean))];
  const exporterStatsMap = await getBatchExporterShipmentCount(uniqueExporterIds);

  const results = [];
  const bulkOps = [];
  let autoEscalatedCount = 0;
  const now = new Date();

  for (let i = 0; i < enrichedRecords.length; i++) {
    const enriched = enrichedRecords[i];
    const ml = mlResults[i] || computeHeuristicRisk(enriched);
    const { risk_level, explanation, inspection_recommendation } = classifyAndExplain(ml.risk_score, enriched);

    const importerStats = importerStatsMap.get(enriched.importer_id) || {
      totalShipments: 0,
      criticalShipments: 0,
      criticalPercentage: 0,
    };

    const baseResult = {
      container_id: enriched.container_id,
      risk_score: ml.risk_score,
      risk_level,
      anomaly_flag: ml.anomaly_flag,
      anomaly_score: ml.anomaly_score,
      explanation,
      inspection_recommendation,
      top_factors: ml.top_factors || [],
    };

    // Apply Feature 7: Importer History
    const importerEscalated = applyAutoEscalation(baseResult, importerStats);
    
    // Apply Feature 8: Exporter History Safeguard
    const exporterHistoryCount = exporterStatsMap.get(enriched.exporter_id) ?? 0;
    const finalEscalated = applyNewTraderEscalation(importerEscalated, exporterHistoryCount);

    if (finalEscalated.auto_escalated_by_importer_history || finalEscalated.auto_escalated_by_new_trader_rule) {
      autoEscalatedCount++;
    }

    results.push(finalEscalated);

    bulkOps.push({
      updateOne: {
        filter: { container_id: enriched.container_id },
        update: {
          $set: {
            ...enriched,
            // Raw ML outputs
            model_risk_score: ml.risk_score,
            model_risk_level: finalEscalated.model_risk_level,
            // Final business-adjusted decision
            risk_score: finalEscalated.final_risk_score,
            risk_level: finalEscalated.final_risk_level,
            final_risk_score: finalEscalated.final_risk_score,
            final_risk_level: finalEscalated.final_risk_level,
            // Auto-escalation audit
            auto_escalated_by_importer_history: finalEscalated.auto_escalated_by_importer_history,
            importer_critical_percentage: finalEscalated.importer_critical_percentage,
            auto_escalated_by_new_trader_rule: finalEscalated.auto_escalated_by_new_trader_rule,
            exporter_historical_shipment_count: finalEscalated.exporter_historical_shipment_count,
            new_trader_threshold_used: finalEscalated.new_trader_threshold_used,
            override_reason: finalEscalated.override_reason,
            // Other fields
            anomaly_flag: ml.anomaly_flag,
            anomaly_score: ml.anomaly_score,
            explanation: finalEscalated.explanation,
            explanation_summary: finalEscalated.explanation_summary,
            prediction_source: 'batch',
            upload_batch_id: batchId,
            batch_id: batchId,
            processed_at: now,
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

  // Return results array AND escalation summary
  return { results, autoEscalatedCount };
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

module.exports = { predictSingle, predictBatch, triggerTraining, callMLService, computeHeuristicRisk };
