/**
 * Feature Engineering Module
 * Computes derived features from raw container shipment data
 * before feeding into the ML prediction pipeline.
 */

// Dwell time threshold considered "high" (hours)
const HIGH_DWELL_TIME_THRESHOLD = 72;

/**
 * Compute all engineered features for a single container record.
 * Mutates and returns an enriched copy of the record.
 *
 * @param {Object} record - Raw shipment record
 * @param {Map} importerFreqMap - Map of importer_id -> shipment count
 * @param {Map} exporterFreqMap - Map of exporter_id -> shipment count
 * @param {Map} tradeRouteRiskMap - Map of "origin->dest" -> risk frequency score
 * @returns {Object} enriched record with engineered features
 */
const engineerFeatures = (record, importerFreqMap = new Map(), exporterFreqMap = new Map(), tradeRouteRiskMap = new Map()) => {
  const enriched = { ...record };

  const declaredWeight = parseFloat(enriched.declared_weight) || 0;
  const measuredWeight = parseFloat(enriched.measured_weight) || 0;
  const declaredValue = parseFloat(enriched.declared_value) || 0;
  const dwellTime = parseFloat(enriched.dwell_time_hours) || 0;

  // Weight difference (absolute)
  enriched.weight_difference = Math.abs(measuredWeight - declaredWeight);

  // Robust weight mismatch percentage — 0.001 guard prevents div/0 on zero
  // declarations; capped at 200% so extreme outliers don't skew the feature.
  enriched.weight_mismatch_percentage = Math.min(
    (enriched.weight_difference / (declaredWeight + 0.001)) * 100,
    200
  );

  // Binary flag: declared weight is exactly zero (evasion / data omission signal)
  enriched.is_declared_zero = declaredWeight === 0 ? 1 : 0;

  // Value to weight ratio (declared value per kg)
  const referenceWeight = measuredWeight > 0 ? measuredWeight : declaredWeight;
  enriched.value_to_weight_ratio = referenceWeight > 0
    ? declaredValue / referenceWeight
    : 0;

  // High dwell time binary flag
  enriched.high_dwell_time_flag = dwellTime > HIGH_DWELL_TIME_THRESHOLD ? 1 : 0;
  // Alias used by the explainability layer and Python pipeline
  enriched.excessive_dwell_time = enriched.high_dwell_time_flag;

  // Importer frequency from pre-computed map
  enriched.importer_frequency = importerFreqMap.get(enriched.importer_id) || 1;

  // Exporter frequency
  enriched.exporter_frequency = exporterFreqMap.get(enriched.exporter_id) || 1;

  // Trade route risk score
  const tradeRouteKey = `${enriched.origin_country}->${enriched.destination_country}`;
  enriched.trade_route_risk = tradeRouteRiskMap.get(tradeRouteKey) || 0;

  return enriched;
};

/**
 * Build frequency maps from an array of records.
 * Used to compute importer/exporter/trade-route frequencies
 * across the entire dataset before feature engineering.
 *
 * @param {Array} records
 * @returns {{ importerFreqMap, exporterFreqMap, tradeRouteRiskMap }}
 */
const buildFrequencyMaps = (records) => {
  const importerFreqMap = new Map();
  const exporterFreqMap = new Map();
  const tradeRouteCountMap = new Map();

  for (const rec of records) {
    // Importer frequency
    if (rec.importer_id) {
      importerFreqMap.set(rec.importer_id, (importerFreqMap.get(rec.importer_id) || 0) + 1);
    }
    // Exporter frequency
    if (rec.exporter_id) {
      exporterFreqMap.set(rec.exporter_id, (exporterFreqMap.get(rec.exporter_id) || 0) + 1);
    }
    // Trade route count
    const routeKey = `${rec.origin_country}->${rec.destination_country}`;
    tradeRouteCountMap.set(routeKey, (tradeRouteCountMap.get(routeKey) || 0) + 1);
  }

  // Normalise trade route count into a 0-1 risk score
  // Higher frequency = lower risk (well-known route), rare routes = higher risk
  const maxRouteCount = Math.max(...tradeRouteCountMap.values(), 1);
  const tradeRouteRiskMap = new Map();
  for (const [key, count] of tradeRouteCountMap) {
    // Invert: rare route → high risk
    tradeRouteRiskMap.set(key, 1 - count / maxRouteCount);
  }

  return { importerFreqMap, exporterFreqMap, tradeRouteRiskMap };
};

/**
 * Apply feature engineering to an entire batch of records.
 *
 * @param {Array} records
 * @returns {Array} enriched records
 */
const engineerBatchFeatures = (records) => {
  const { importerFreqMap, exporterFreqMap, tradeRouteRiskMap } = buildFrequencyMaps(records);
  return records.map((rec) =>
    engineerFeatures(rec, importerFreqMap, exporterFreqMap, tradeRouteRiskMap)
  );
};

/**
 * Normalise field names from CSV headers to internal schema keys.
 * Handles mixed-case and space-separated column names.
 *
 * @param {Object} rawRow - raw CSV row object
 * @returns {Object} normalised record
 */
const normaliseRecord = (rawRow) => {
  const normalise = (key) => key.toLowerCase().replace(/[\s-]/g, '_');
  const result = {};
  for (const [k, v] of Object.entries(rawRow)) {
    result[normalise(k)] = v;
  }
  return result;
};

module.exports = {
  engineerFeatures,
  engineerBatchFeatures,
  buildFrequencyMaps,
  normaliseRecord,
  HIGH_DWELL_TIME_THRESHOLD,
};
