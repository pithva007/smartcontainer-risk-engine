/**
 * Risk Classification Module
 * Converts a continuous risk score (0-1) into a labelled risk level
 * and generates a human-readable explanation based on feature thresholds.
 *
 * Classification thresholds are dynamic: they are computed by train_model.py
 * via Youden's J statistic on the validation set and saved to
 * ml-service/models/training_metrics.json.  This file is read at module
 * load time so every deploy picks up the latest trained values automatically.
 * Hardcoded values are used only as a safe fallback when the file is absent.
 */

const fs   = require('fs');
const path = require('path');

// ── Load model-derived thresholds from training_metrics.json ────────────────
let _modelThresholds = {};
try {
  const metricsPath = path.join(
    __dirname, '../../ml-service/models/training_metrics.json'
  );
  _modelThresholds = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
} catch (_) {
  // File not yet generated (first run / model not trained yet) — use defaults below
}

// Fallback defaults (used only when the model hasn't been trained yet)
const _DEFAULT_CRITICAL  = 0.45;
const _DEFAULT_LOW_RISK  = 0.20;

// Live values — either from the trained model or the safe defaults above
const CRITICAL_THRESHOLD = _modelThresholds.critical_threshold ?? _DEFAULT_CRITICAL;
const LOW_RISK_THRESHOLD  = _modelThresholds.low_risk_threshold  ?? _DEFAULT_LOW_RISK;

// Feature thresholds for explanation generation
const THRESHOLDS = {
  weight_mismatch_percentage: 20,   // >20% mismatch → flagged
  value_to_weight_ratio_high: 1000, // unusually high $/kg
  value_to_weight_ratio_low: 0.1,   // suspiciously low $/kg
  dwell_time_hours: 72,             // hours before "excessive dwell"
  weight_difference: 500,           // kg absolute difference
  trade_route_risk: 0.7,            // normalised risk score for rare routes
};

/**
 * Classify a numeric risk score into a categorical risk level.
 *
 * Critical  ≥ 0.45  — immediate inspection flagged
 * Low Risk  ≥ 0.20  — flagged for officer review
 * Clear     < 0.20  — pass through
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

  // Highest priority: declared weight is zero (evasion / manifest omission)
  if (features.is_declared_zero) {
    reasons.push('Declared weight is zero — possible evasion or missing manifest data.');
  }

  // Percentage-based weight mismatch (capped at 200% by featureEngineering.js)
  if ((features.weight_mismatch_percentage || 0) > THRESHOLDS.weight_mismatch_percentage) {
    const pct = (features.weight_mismatch_percentage || 0).toFixed(1);
    reasons.push(`Measured weight differs from declared weight by ${pct}%.`);
  }

  // Absolute weight difference (secondary weight signal)
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

  // Excessive dwell time (>72 h) — checks both the new and legacy flag names
  const dwellFlag = features.excessive_dwell_time || features.high_dwell_time_flag ||
    (features.dwell_time_hours || 0) > THRESHOLDS.dwell_time_hours;
  if (dwellFlag) {
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

  // Default fallback (3-tier)
  if (reasons.length === 0) {
    if (riskScore >= CRITICAL_THRESHOLD) {
      return 'Multiple combined risk signals contribute to this critical classification.';
    }
    if (riskScore >= LOW_RISK_THRESHOLD) {
      return 'Minor risk indicators detected. Further review recommended.';
    }
    return 'No significant risk indicators detected. Shipment appears normal.';
  }

  return reasons.join(' ');
};

/**
 * Recommend a specific customs inspection action based on the risk profile.
 *
 * @param {number} riskScore
 * @param {Object} features - engineered feature object
 * @returns {{ recommendedAction: string, reason: string, confidence: string }}
 */
const recommendInspection = (riskScore, features) => {
  const riskLevel = classifyRisk(riskScore);

  if (riskLevel === 'Critical') {
    if (features.is_declared_zero || (features.weight_mismatch_percentage || 0) > 50) {
      return {
        recommendedAction: 'Full Physical Inspection',
        reason: 'Severe weight anomaly or zero declared weight suggests manifest fraud',
        confidence: 'High',
      };
    }
    if ((features.value_to_weight_ratio || 0) > 1000) {
      return {
        recommendedAction: 'X-Ray Scanning + Documentation Audit',
        reason: 'Extreme value-to-weight ratio indicates possible high-value contraband',
        confidence: 'High',
      };
    }
    if (features.excessive_dwell_time || features.high_dwell_time_flag) {
      return {
        recommendedAction: 'Full Physical Inspection',
        reason: 'Excessive port dwell time is a strong smuggling indicator',
        confidence: 'High',
      };
    }
    if ((features.trade_route_risk || 0) > 0.7) {
      return {
        recommendedAction: 'X-Ray Scanning + Officer Review',
        reason: 'High-risk trade route with elevated critical container history',
        confidence: 'High',
      };
    }
    return {
      recommendedAction: 'X-Ray Scanning',
      reason: 'Multiple combined risk signals exceed critical threshold',
      confidence: 'High',
    };
  }

  if (riskLevel === 'Low Risk') {
    if ((features.trade_route_risk || 0) > 0.5) {
      return {
        recommendedAction: 'Documentation Audit',
        reason: 'Elevated route risk warrants document verification',
        confidence: 'Medium',
      };
    }
    if ((features.importer_frequency || 1) <= 2) {
      return {
        recommendedAction: 'Documentation Audit',
        reason: 'New or infrequent importer requires additional scrutiny',
        confidence: 'Medium',
      };
    }
    return {
      recommendedAction: 'Random Spot Check',
      reason: 'Minor risk indicators present — low priority review',
      confidence: 'Low',
    };
  }

  return {
    recommendedAction: 'Standard Processing',
    reason: 'No significant risk indicators detected',
    confidence: 'Low',
  };
};

/**
 * Full classification result for a single record.
 *
 * @param {number} riskScore
 * @param {Object} features
 * @returns {{ risk_level: string, explanation: string, inspection_recommendation: Object }}
 */
const classifyAndExplain = (riskScore, features) => {
  return {
    risk_level: classifyRisk(riskScore),
    explanation: generateExplanation(features, riskScore),
    inspection_recommendation: recommendInspection(riskScore, features),
  };
};

module.exports = {
  classifyRisk,
  generateExplanation,
  classifyAndExplain,
  recommendInspection,
  CRITICAL_THRESHOLD,
  LOW_RISK_THRESHOLD,
  THRESHOLDS,
};
