/**
 * Exporter History Service
 * =============================================================================
 * Feature 8: New Trader Safeguard Auto-Escalation
 *
 * Business Rule:
 *   If a trader is "new", their first few shipments must automatically go to
 *   Critical so that the system can observe them, collect history, and prevent
 *   easy evasion.
 *
 * Key design decisions:
 *  - Triggered if an exporter has FEWER than NEW_TRADER_CRITICAL_SHIPMENT_LIMIT
 *    past shipments.
 *  - This is the THIRD line of defense (Model -> Importer History -> Exporter History)
 *  - Configurable via process.env.NEW_TRADER_CRITICAL_SHIPMENT_LIMIT (default 5).
 * =============================================================================
 */

const Container = require('../models/containerModel');
const logger = require('../utils/logger');

// The default configuration threshold for a "new" trader rule.
const NEW_TRADER_CRITICAL_SHIPMENT_LIMIT = Number(process.env.NEW_TRADER_CRITICAL_SHIPMENT_LIMIT) || 5;

/**
 * Fetch the exact shipment count for a single Exporter.
 *
 * @param {string|null|undefined} exporterId
 * @returns {Promise<number>} the historical shipment count
 */
const getExporterShipmentCount = async (exporterId) => {
  if (!exporterId) {
    return 0; // null/undefined exporter counts as 0 (will trigger rule)
  }

  // Count exactly how many documents this exporter has in the DB
  const count = await Container.countDocuments({ exporter_id: exporterId });
  return count;
};

/**
 * Fetch historical shipment counts for MULTIPLE exporters in a SINGLE
 * MongoDB aggregation - designed for batch processing.
 *
 * @param {string[]} exporterIds
 * @returns {Promise<Map<string, number>>}
 */
const getBatchExporterShipmentCount = async (exporterIds) => {
  const validIds = [...new Set(exporterIds.filter(Boolean))];
  if (validIds.length === 0) return new Map();

  const rows = await Container.aggregate([
    { $match: { exporter_id: { $in: validIds } } },
    {
      $group: {
        _id: '$exporter_id',
        count: { $sum: 1 },
      },
    },
  ]);

  const statsMap = new Map();

  for (const row of rows) {
    statsMap.set(row._id, row.count);
  }

  // Backfill 0 for those not found at all
  for (const id of validIds) {
    if (!statsMap.has(id)) {
      statsMap.set(id, 0);
    }
  }

  return statsMap;
};

/**
 * Applies the New Trader Safeguard to a single intermediate prediction result.
 * This should be executed AFTER the Importer History rule.
 *
 * If the shipment is ALREADY Critical, it does NOT override the reason, it just
 * stays critical. If it is Clear/Low Risk AND the exporter has < limit shipments,
 * it is forcefully escalated to Critical.
 *
 * @param {Object} prediction - current prediction object (potentially after importer history escalation)
 * @param {number} historicalShipmentCount - how many historical shipments the exporter has
 * @returns {Object} updated prediction with new trader flags
 */
const applyNewTraderEscalation = (prediction, historicalShipmentCount) => {
  const shouldEscalate = historicalShipmentCount < NEW_TRADER_CRITICAL_SHIPMENT_LIMIT;

  let finalRiskLevel = prediction.final_risk_level;
  let finalRiskScore = prediction.final_risk_score;
  let autoEscalated = false;
  let overrideReason = prediction.override_reason || null;
  let explanationSummary = prediction.explanation_summary || prediction.explanation || '';
  let escalationNote = '';

  // Only apply this override if it was NOT already escalated to Critical by something else.
  // Actually, wait, the business rule says:
  // "If shipment passes first two checks and exporter is still new, force it to Critical"
  // So if it's already Critical, leave it.
  
  if (shouldEscalate && finalRiskLevel !== 'Critical') {
    finalRiskLevel = 'Critical';
    // Floor the score so it obviously looks critical, but we can use 0.85
    finalRiskScore = parseFloat(Math.max(prediction.model_risk_score, 0.85).toFixed(4));
    autoEscalated = true;
    overrideReason = 'Exporter is a new trader with insufficient shipment history';
    escalationNote = ` Auto-escalated to Critical because this exporter is new and has fewer than the minimum required historical shipments for trust evaluation.`;
  }

  const updatedExplanation = autoEscalated
    ? (explanationSummary + escalationNote).trim()
    : explanationSummary;

  return {
    ...prediction,

    final_risk_score: finalRiskScore,
    final_risk_level: finalRiskLevel,
    
    // keep aliases in sync
    risk_score: finalRiskScore,
    risk_level: finalRiskLevel,
    
    auto_escalated_by_new_trader_rule: autoEscalated,
    exporter_historical_shipment_count: historicalShipmentCount,
    new_trader_threshold_used: NEW_TRADER_CRITICAL_SHIPMENT_LIMIT,
    
    override_reason: overrideReason,
    explanation: updatedExplanation,
    explanation_summary: updatedExplanation,
  };
};

module.exports = {
  getExporterShipmentCount,
  getBatchExporterShipmentCount,
  applyNewTraderEscalation,
  NEW_TRADER_CRITICAL_SHIPMENT_LIMIT,
};
