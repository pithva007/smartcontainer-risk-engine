/**
 * Risk Classification Module
 * Converts a continuous risk score (0-1) into a labelled risk level
 * and generates a human-readable explanation based on feature thresholds.
 */

// Classification thresholds
const CRITICAL_THRESHOLD = 0.7;
const LOW_RISK_THRESHOLD = 0.4;

// Feature thresholds for explanation generation
const THRESHOLDS = {
  weight_mismatch_percentage: 20,   // >20% mismatch is significant
  value_to_weight_ratio_high: 1000, // unusually high $/kg
  value_to_weight_ratio_low: 0.1,   // suspiciously low $/kg
  dwell_time_hours: 72,             // hours before "high dwell"
  weight_difference: 500,           // kg absolute difference
  trade_route_risk: 0.7,            // normalised risk score for rare routes
};

/**
 * Classify a numeric risk score into a categorical risk level.
 *
 * @param {number} riskScore - float 0–1
 * @returns {'Critical'|'Low Risk'|'Clear'}
 */
const classifyRisk = (riskScore) => {
  if (riskScore >= CRITICAL_THRESHOLD) return 'Critical';
  if (riskScore >= LOW_RISK_THRESHOLD) return 'Low Risk';
  return 'Clear';
};

/**
 * Generate a dynamic, human-readable explanation for a prediction
 * based on the strongest feature signals in the container record.
 *
 * @param {Object} features - engineered feature object
 * @param {number} riskScore
 * @returns {string} explanation text
 */
const generateExplanation = (features, riskScore) => {
  const reasons = [];

  // Weight mismatch
  if ((features.weight_mismatch_percentage || 0) > THRESHOLDS.weight_mismatch_percentage) {
    const pct = (features.weight_mismatch_percentage || 0).toFixed(1);
    reasons.push(`Measured weight differs from declared weight by ${pct}%.`);
  }

  // Absolute weight difference
  if ((features.weight_difference || 0) > THRESHOLDS.weight_difference) {
    const diff = (features.weight_difference || 0).toFixed(0);
    reasons.push(`Large absolute weight discrepancy of ${diff} kg detected.`);
  }

  // High value-to-weight ratio
  if ((features.value_to_weight_ratio || 0) > THRESHOLDS.value_to_weight_ratio_high) {
    reasons.push('Unusually high value-to-weight ratio detected.');
  }

  // Low value-to-weight ratio
  if (
    features.value_to_weight_ratio !== undefined &&
    features.value_to_weight_ratio < THRESHOLDS.value_to_weight_ratio_low &&
    features.value_to_weight_ratio >= 0
  ) {
    reasons.push('Suspiciously low declared value relative to shipment weight.');
  }

  // High dwell time
  if (features.high_dwell_time_flag || (features.dwell_time_hours || 0) > THRESHOLDS.dwell_time_hours) {
    const hours = features.dwell_time_hours || 0;
    reasons.push(`Container dwell time is unusually high (${hours} hours).`);
  }

  // Rare trade route
  if ((features.trade_route_risk || 0) > THRESHOLDS.trade_route_risk) {
    reasons.push(
      `Trade route ${features.origin_country} → ${features.destination_country} has elevated risk frequency.`
    );
  }

  // Low importer frequency (new / rare importer)
  if ((features.importer_frequency || 0) <= 2) {
    reasons.push('Importer has very few recorded shipments — low historical activity.');
  }

  // Default fallback
  if (reasons.length === 0) {
    if (riskScore >= CRITICAL_THRESHOLD) {
      return 'Multiple combined risk factors contribute to this critical classification.';
    }
    if (riskScore >= LOW_RISK_THRESHOLD) {
      return 'Minor risk indicators detected. Further review recommended.';
    }
    return 'No significant risk indicators detected. Shipment appears normal.';
  }

  return reasons.join(' ');
};

/**
 * Full classification result for a single record.
 *
 * @param {number} riskScore
 * @param {Object} features
 * @returns {{ risk_level: string, explanation: string }}
 */
const classifyAndExplain = (riskScore, features) => {
  return {
    risk_level: classifyRisk(riskScore),
    explanation: generateExplanation(features, riskScore),
  };
};

module.exports = {
  classifyRisk,
  generateExplanation,
  classifyAndExplain,
  CRITICAL_THRESHOLD,
  LOW_RISK_THRESHOLD,
  THRESHOLDS,
};
