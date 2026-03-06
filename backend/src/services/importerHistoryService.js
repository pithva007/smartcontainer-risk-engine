/**
 * Importer History Service
 * =============================================================================
 * Feature 7: Importer Critical History Auto-Escalation
 *
 * Business Rule:
 *   If an importer's historical critical shipment percentage is STRICTLY GREATER
 *   than 20%, any new shipment from that importer is auto-escalated to Critical —
 *   regardless of what the ML model predicted.
 *
 * Key design decisions:
 *  - Exactly 20% does NOT trigger escalation (strictly greater-than).
 *  - No importer history (0 past shipments) does NOT trigger escalation.
 *  - Raw model outputs are always preserved for full auditability.
 *  - Batch processing uses a single aggregation instead of N queries.
 * =============================================================================
 */

const Container = require('../models/containerModel');
const logger = require('../utils/logger');

/** Escalation triggers when historical critical % is strictly above this value. */
const ESCALATION_THRESHOLD_PCT = 20;

/**
 * Compute critical shipment statistics for a single importer.
 * Only counts records that have already been risk-classified (risk_level != null).
 *
 * @param {string|null|undefined} importerId
 * @returns {Promise<{ totalShipments: number, criticalShipments: number, criticalPercentage: number }>}
 */
const getImporterStats = async (importerId) => {
  if (!importerId) {
    return { totalShipments: 0, criticalShipments: 0, criticalPercentage: 0 };
  }

  const [total, critical] = await Promise.all([
    Container.countDocuments({ importer_id: importerId, risk_level: { $ne: null } }),
    Container.countDocuments({ importer_id: importerId, risk_level: 'Critical' }),
  ]);

  return {
    totalShipments: total,
    criticalShipments: critical,
    criticalPercentage:
      total > 0 ? parseFloat(((critical / total) * 100).toFixed(2)) : 0,
  };
};

/**
 * Compute critical shipment statistics for MULTIPLE importers in a SINGLE
 * MongoDB aggregation — designed for batch processing to avoid N round-trips.
 *
 * @param {string[]} importerIds - may include duplicates; nulls are filtered out
 * @returns {Promise<Map<string, { totalShipments: number, criticalShipments: number, criticalPercentage: number }>>}
 */
const getBatchImporterStats = async (importerIds) => {
  const validIds = [...new Set(importerIds.filter(Boolean))];
  if (validIds.length === 0) return new Map();

  const rows = await Container.aggregate([
    { $match: { importer_id: { $in: validIds }, risk_level: { $ne: null } } },
    {
      $group: {
        _id: '$importer_id',
        total_shipments: { $sum: 1 },
        critical_count: {
          $sum: { $cond: [{ $eq: ['$risk_level', 'Critical'] }, 1, 0] },
        },
      },
    },
  ]);

  const statsMap = new Map();

  for (const row of rows) {
    const pct =
      row.total_shipments > 0
        ? parseFloat(((row.critical_count / row.total_shipments) * 100).toFixed(2))
        : 0;
    statsMap.set(row._id, {
      totalShipments: row.total_shipments,
      criticalShipments: row.critical_count,
      criticalPercentage: pct,
    });
  }

  // Importers with no history at all → zero stats (safe default: won't escalate)
  for (const id of validIds) {
    if (!statsMap.has(id)) {
      statsMap.set(id, { totalShipments: 0, criticalShipments: 0, criticalPercentage: 0 });
    }
  }

  return statsMap;
};

/**
 * Apply the auto-escalation rule to a single intermediate prediction result.
 *
 * This function MUST be called after the ML prediction and initial
 * classification, but BEFORE final persistence to MongoDB.
 *
 * Returns an enriched prediction object that includes:
 *  - model_risk_score / model_risk_level  (raw ML outputs, unchanged)
 *  - final_risk_score / final_risk_level  (possibly overridden by business rule)
 *  - risk_score / risk_level              (kept in sync with final values for backward compat)
 *  - auto_escalated_by_importer_history   (boolean audit flag)
 *  - importer_critical_percentage         (for display/audit)
 *  - override_reason                      (human-readable explanation of why override happened)
 *
 * @param {Object} prediction - base prediction from ML + classifier
 * @param {{ totalShipments: number, criticalShipments: number, criticalPercentage: number }} importerStats
 * @returns {Object} enriched prediction with all escalation fields
 */
const applyAutoEscalation = (prediction, importerStats) => {
  const { criticalPercentage, totalShipments } = importerStats;

  // Preserve raw ML outputs exactly as-is (never mutate them)
  const modelRiskScore = prediction.risk_score;
  const modelRiskLevel = prediction.risk_level;

  // Escalation: strictly greater than 20% AND importer has prior history
  const shouldEscalate =
    totalShipments > 0 && criticalPercentage > ESCALATION_THRESHOLD_PCT;

  let finalRiskScore = modelRiskScore;
  let finalRiskLevel = modelRiskLevel;
  let autoEscalated = false;
  let overrideReason = null;
  let escalationNote = '';

  if (shouldEscalate) {
    finalRiskLevel = 'Critical';
    // Floor the score at 0.85 to clearly signal a business-rule override
    finalRiskScore = parseFloat(Math.max(modelRiskScore, 0.85).toFixed(4));
    autoEscalated = true;
    overrideReason =
      `Auto-escalated to Critical: importer historical critical rate is ${criticalPercentage}% ` +
      `(${importerStats.criticalShipments}/${totalShipments} shipments), exceeds the ${ESCALATION_THRESHOLD_PCT}% threshold.`;
    escalationNote =
      ' Auto-escalated to Critical because importer historical critical shipment percentage exceeds 20%.';

    logger.info(
      `[AutoEscalation] Container ${prediction.container_id || '(unknown)'} ` +
      `escalated — importer critical rate: ${criticalPercentage}%`
    );
  }

  const updatedExplanation = autoEscalated
    ? (prediction.explanation || '') + escalationNote
    : prediction.explanation;

  return {
    ...prediction,

    // ── Raw ML outputs (auditable, never overwritten) ──────────────────────
    model_risk_score: modelRiskScore,
    model_risk_level: modelRiskLevel,

    // ── Final business-adjusted decision ──────────────────────────────────
    final_risk_score: finalRiskScore,
    final_risk_level: finalRiskLevel,

    // ── Backward-compatible legacy fields kept in sync with final ─────────
    risk_score: finalRiskScore,
    risk_level: finalRiskLevel,

    // ── Escalation audit metadata ─────────────────────────────────────────
    auto_escalated_by_importer_history: autoEscalated,
    importer_critical_percentage: criticalPercentage,
    override_reason: overrideReason,

    // ── Updated explanation includes escalation note if applicable ─────────
    explanation: updatedExplanation,
    explanation_summary: updatedExplanation,
  };
};

module.exports = {
  getImporterStats,
  getBatchImporterStats,
  applyAutoEscalation,
  ESCALATION_THRESHOLD_PCT,
};
