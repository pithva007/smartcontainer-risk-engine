/**
 * Dashboard Controller
 * Provides aggregated statistics for frontend visualisation dashboards.
 */
const Container = require('../models/containerModel');
const { getCache, setCache } = require('../config/redis');
const logger = require('../utils/logger');

const CACHE_TTL = 120; // seconds

/**
 * GET /api/summary
 * Return overall risk and anomaly statistics.
 */
const getSummary = async (req, res) => {
  const cacheKey = 'dashboard:summary';

  try {
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.status(200).json({ success: true, ...cached, cached: true });
    }

    const [
      total_containers,
      critical_count,
      low_risk_count,
      clear_count,
      anomaly_count,
      unprocessed_count,
    ] = await Promise.all([
      Container.countDocuments({}),
      Container.countDocuments({ risk_level: 'Critical' }),
      Container.countDocuments({ risk_level: 'Low Risk' }),
      Container.countDocuments({ risk_level: 'Clear' }),
      Container.countDocuments({ anomaly_flag: true }),
      Container.countDocuments({ risk_level: null }),
    ]);

    const summary = {
      total_containers,
      critical_count,
      low_risk_count,
      clear_count,
      anomaly_count,
      unprocessed_count,
      risk_distribution: {
        critical_percent: total_containers > 0 ? ((critical_count / total_containers) * 100).toFixed(1) : '0.0',
        low_risk_percent: total_containers > 0 ? ((low_risk_count / total_containers) * 100).toFixed(1) : '0.0',
        clear_percent: total_containers > 0 ? ((clear_count / total_containers) * 100).toFixed(1) : '0.0',
      },
    };

    await setCache(cacheKey, summary, CACHE_TTL);

    return res.status(200).json({ success: true, ...summary });
  } catch (error) {
    logger.error(`Summary error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/dashboard/risk-distribution
 * Returns risk level breakdown for pie/bar charts.
 */
const getRiskDistribution = async (req, res) => {
  const cacheKey = 'dashboard:risk_dist';
  try {
    const cached = await getCache(cacheKey);
    if (cached) return res.status(200).json({ success: true, data: cached });

    const distribution = await Container.aggregate([
      { $match: { risk_level: { $ne: null } } },
      { $group: { _id: '$risk_level', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const data = distribution.map((d) => ({ risk_level: d._id, count: d.count }));
    await setCache(cacheKey, data, CACHE_TTL);

    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error(`Risk distribution error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/dashboard/top-risky-routes
 * Returns the top N trade routes by critical container count.
 */
const getTopRiskyRoutes = async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  const cacheKey = `dashboard:top_routes:${limit}`;

  try {
    const cached = await getCache(cacheKey);
    if (cached) return res.status(200).json({ success: true, data: cached });

    const routes = await Container.aggregate([
      { $match: { risk_level: 'Critical' } },
      {
        $group: {
          _id: {
            origin: '$origin_country',
            destination: '$destination_country',
          },
          critical_count: { $sum: 1 },
          avg_risk_score: { $avg: '$risk_score' },
          anomaly_count: { $sum: { $cond: ['$anomaly_flag', 1, 0] } },
        },
      },
      { $sort: { critical_count: -1 } },
      { $limit: limit },
    ]);

    const data = routes.map((r) => ({
      origin: r._id.origin,
      destination: r._id.destination,
      critical_count: r.critical_count,
      avg_risk_score: parseFloat((r.avg_risk_score || 0).toFixed(3)),
      anomaly_count: r.anomaly_count,
    }));

    await setCache(cacheKey, data, CACHE_TTL);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error(`Top risky routes error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/dashboard/anomaly-stats
 * Returns anomaly detection statistics.
 */
const getAnomalyStats = async (req, res) => {
  const cacheKey = 'dashboard:anomaly_stats';
  try {
    const cached = await getCache(cacheKey);
    if (cached) return res.status(200).json({ success: true, data: cached });

    const [totalAnomalies, byCritical, topCountries] = await Promise.all([
      Container.countDocuments({ anomaly_flag: true }),
      Container.aggregate([
        { $match: { anomaly_flag: true } },
        { $group: { _id: '$risk_level', count: { $sum: 1 } } },
      ]),
      Container.aggregate([
        { $match: { anomaly_flag: true } },
        { $group: { _id: '$origin_country', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
    ]);

    const data = {
      total_anomalies: totalAnomalies,
      by_risk_level: byCritical.reduce((acc, item) => {
        acc[item._id || 'Unknown'] = item.count;
        return acc;
      }, {}),
      top_origin_countries: topCountries.map((c) => ({
        country: c._id,
        anomaly_count: c.count,
      })),
    };

    await setCache(cacheKey, data, CACHE_TTL);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error(`Anomaly stats error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/dashboard/recent-high-risk
 * Returns the most recently processed critical containers.
 */
const getRecentHighRisk = async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 500, 1000);
  const cacheKey = `dashboard:recent_high_risk:${limit}`;

  try {
    const cached = await getCache(cacheKey);
    if (cached) return res.status(200).json({ success: true, data: cached, cached: true });

    const containers = await Container.find({ risk_level: 'Critical' })
      .sort({ processed_at: -1 })
      .limit(limit)
      .select('container_id origin_country destination_country risk_score risk_level anomaly_flag explanation processed_at')
      .lean();

    await setCache(cacheKey, containers, CACHE_TTL);
    return res.status(200).json({ success: true, data: containers });
  } catch (error) {
    logger.error(`Recent high risk error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/dashboard/containers
 * Returns a paginated/filtered list of all containers.
 */
const getContainersList = async (req, res) => {
  const { page = 1, limit = 50, risk_level, anomaly } = req.query;
  const cacheKey = `dashboard:containers:${page}:${limit}:${risk_level || 'all'}:${anomaly || 'false'}`;

  const filter = {};
  if (risk_level) filter.risk_level = risk_level;
  if (anomaly === 'true') filter.anomaly_flag = true;

  try {
    const cached = await getCache(cacheKey);
    if (cached) return res.status(200).json({ ...cached, cached: true });

    const [total, containers] = await Promise.all([
      Container.countDocuments(filter),
      Container.find(filter)
        .sort({ processed_at: -1, risk_score: -1 })
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit))
        .select(
          'container_id origin_country destination_country risk_score risk_level anomaly_flag inspection_status assigned_to queued_at'
        )
        .lean(),
    ]);

    const payload = {
      success: true,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      data: containers,
    };

    await setCache(cacheKey, payload, 60); // 60s cache for paginated lists
    return res.status(200).json(payload);
  } catch (error) {
    logger.error(`Get containers list error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE /api/containers/all
 * Wipe every container record and flush all dashboard Redis cache.
 * Requires authentication (any logged-in user may reset their own data).
 */
const clearAllData = async (req, res) => {
  try {
    const { deletedCount } = await Container.deleteMany({});

    // Also delete all jobs so history is in sync
    const Job = require('../models/jobModel');
    await Job.deleteMany({});

    // Flush entire dashboard cache
    const { flushCache } = require('../config/redis');
    await flushCache();

    logger.info(`All data cleared by ${req.user?.username || 'unknown'} — ${deletedCount} containers removed`);

    return res.status(200).json({
      success: true,
      message: `All data cleared. ${deletedCount} containers removed.`,
      deleted_containers: deletedCount,
    });
  } catch (error) {
    logger.error(`Clear all data error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Analytics endpoints (Features 2 & 5)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/analytics/route-risk
 * Feature 2: Route Risk Intelligence — all routes ranked by risk score.
 */
const getRouteRisk = async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const cacheKey = `analytics:route_risk:${limit}`;

  try {
    const cached = await getCache(cacheKey);
    if (cached) return res.status(200).json({ success: true, data: cached, cached: true });

    const routes = await Container.aggregate([
      { $match: { origin_country: { $ne: null }, destination_country: { $ne: null } } },
      {
        $group: {
          _id: { origin: '$origin_country', destination: '$destination_country' },
          total_count: { $sum: 1 },
          critical_count: { $sum: { $cond: [{ $eq: ['$risk_level', 'Critical'] }, 1, 0] } },
          low_risk_count: { $sum: { $cond: [{ $eq: ['$risk_level', 'Low Risk'] }, 1, 0] } },
          clear_count: { $sum: { $cond: [{ $eq: ['$risk_level', 'Clear'] }, 1, 0] } },
          anomaly_count: { $sum: { $cond: ['$anomaly_flag', 1, 0] } },
          avg_risk_score: { $avg: '$risk_score' },
          avg_dwell_time: { $avg: '$dwell_time_hours' },
        },
      },
      {
        $addFields: {
          critical_rate: {
            $cond: [{ $gt: ['$total_count', 0] }, { $divide: ['$critical_count', '$total_count'] }, 0],
          },
        },
      },
      { $sort: { critical_rate: -1, critical_count: -1 } },
      { $limit: limit },
    ]);

    const data = routes.map((r) => ({
      origin: r._id.origin,
      destination: r._id.destination,
      total_count: r.total_count,
      critical_count: r.critical_count,
      low_risk_count: r.low_risk_count,
      clear_count: r.clear_count,
      anomaly_count: r.anomaly_count,
      critical_rate: parseFloat((r.critical_rate * 100).toFixed(1)),
      avg_risk_score: parseFloat((r.avg_risk_score || 0).toFixed(3)),
      avg_dwell_time: parseFloat((r.avg_dwell_time || 0).toFixed(1)),
    }));

    await setCache(cacheKey, data, CACHE_TTL);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error(`Route risk error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/analytics/suspicious-importers
 * Feature 5: Top importers ranked by critical shipment count.
 */
const getSuspiciousImporters = async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 15, 50);
  const cacheKey = `analytics:suspicious_importers:${limit}`;

  try {
    const cached = await getCache(cacheKey);
    if (cached) return res.status(200).json({ success: true, data: cached, cached: true });

    const importers = await Container.aggregate([
      { $match: { importer_id: { $ne: null } } },
      {
        $group: {
          _id: '$importer_id',
          total_shipments: { $sum: 1 },
          critical_count: { $sum: { $cond: [{ $eq: ['$risk_level', 'Critical'] }, 1, 0] } },
          anomaly_count: { $sum: { $cond: ['$anomaly_flag', 1, 0] } },
          avg_risk_score: { $avg: '$risk_score' },
          countries: { $addToSet: '$origin_country' },
        },
      },
      { $match: { critical_count: { $gt: 0 } } },
      {
        $addFields: {
          critical_rate: { $divide: ['$critical_count', '$total_shipments'] },
          risk_score: { $multiply: ['$avg_risk_score', { $divide: ['$critical_count', '$total_shipments'] }] },
        },
      },
      { $sort: { critical_count: -1, critical_rate: -1 } },
      { $limit: limit },
    ]);

    const data = importers.map((imp) => ({
      importer_id: imp._id,
      total_shipments: imp.total_shipments,
      critical_count: imp.critical_count,
      anomaly_count: imp.anomaly_count,
      critical_rate: parseFloat((imp.critical_rate * 100).toFixed(1)),
      avg_risk_score: parseFloat((imp.avg_risk_score || 0).toFixed(3)),
      origin_countries: imp.countries.filter(Boolean).slice(0, 5),
    }));

    await setCache(cacheKey, data, CACHE_TTL);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error(`Suspicious importers error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/analytics/fraud-patterns
 * Feature 5: HS codes and shipping lines with the highest critical rates.
 */
const getFraudPatterns = async (req, res) => {
  const cacheKey = 'analytics:fraud_patterns';

  try {
    const cached = await getCache(cacheKey);
    if (cached) return res.status(200).json({ success: true, data: cached, cached: true });

    const [hsCodes, shippingLines] = await Promise.all([
      Container.aggregate([
        { $match: { hs_code: { $ne: null } } },
        {
          $group: {
            _id: '$hs_code',
            total: { $sum: 1 },
            critical_count: { $sum: { $cond: [{ $eq: ['$risk_level', 'Critical'] }, 1, 0] } },
            avg_risk_score: { $avg: '$risk_score' },
          },
        },
        { $match: { total: { $gte: 3 }, critical_count: { $gt: 0 } } },
        {
          $addFields: {
            critical_rate: { $divide: ['$critical_count', '$total'] },
          },
        },
        { $sort: { critical_rate: -1 } },
        { $limit: 10 },
      ]),
      Container.aggregate([
        { $match: { shipping_line: { $ne: null } } },
        {
          $group: {
            _id: '$shipping_line',
            total: { $sum: 1 },
            critical_count: { $sum: { $cond: [{ $eq: ['$risk_level', 'Critical'] }, 1, 0] } },
            avg_risk_score: { $avg: '$risk_score' },
          },
        },
        { $match: { total: { $gte: 5 }, critical_count: { $gt: 0 } } },
        {
          $addFields: {
            critical_rate: { $divide: ['$critical_count', '$total'] },
          },
        },
        { $sort: { critical_rate: -1 } },
        { $limit: 10 },
      ]),
    ]);

    const data = {
      high_risk_hs_codes: hsCodes.map((h) => ({
        hs_code: h._id,
        total: h.total,
        critical_count: h.critical_count,
        critical_rate: parseFloat((h.critical_rate * 100).toFixed(1)),
        avg_risk_score: parseFloat((h.avg_risk_score || 0).toFixed(3)),
      })),
      high_risk_shipping_lines: shippingLines.map((s) => ({
        shipping_line: s._id,
        total: s.total,
        critical_count: s.critical_count,
        critical_rate: parseFloat((s.critical_rate * 100).toFixed(1)),
        avg_risk_score: parseFloat((s.avg_risk_score || 0).toFixed(3)),
      })),
    };

    await setCache(cacheKey, data, CACHE_TTL);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error(`Fraud patterns error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/analytics/risk-trend
 * Feature 5: Risk counts grouped by day over the last N days.
 * Query param: days=30 (default)
 */
const getRiskTrend = async (req, res) => {
  const days = Math.min(parseInt(req.query.days) || 30, 90);
  const cacheKey = `analytics:risk_trend:${days}`;

  try {
    const cached = await getCache(cacheKey);
    if (cached) return res.status(200).json({ success: true, data: cached, cached: true });

    const since = new Date();
    since.setDate(since.getDate() - days);

    const trend = await Container.aggregate([
      { $match: { processed_at: { $gte: since }, risk_level: { $ne: null } } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$processed_at' } },
            risk_level: '$risk_level',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.date': 1 } },
    ]);

    // Pivot into [{date, Critical, Low Risk, Clear}]
    const byDate = {};
    for (const row of trend) {
      const { date, risk_level } = row._id;
      if (!byDate[date]) byDate[date] = { date, Critical: 0, 'Low Risk': 0, Clear: 0 };
      byDate[date][risk_level] = row.count;
    }
    const data = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));

    await setCache(cacheKey, data, CACHE_TTL);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error(`Risk trend error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 7: Importer Critical History Analytics
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/analytics/importer-risk-history
 * Feature 7: Returns importers with their historical critical percentage,
 * auto-escalation counts, and risk profile.
 *
 * Query params:
 *  - limit (default 20, max 100)
 *  - min_pct (minimum critical percentage, default 0)
 */
const getImporterRiskHistory = async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 2000);
  const minPct = parseFloat(req.query.min_pct) || 0;
  const cacheKey = `analytics:importer_risk_history:${limit}:${minPct}`;

  try {
    const cached = await getCache(cacheKey);
    if (cached) return res.status(200).json({ success: true, data: cached, cached: true });

    const importers = await Container.aggregate([
      { $match: { importer_id: { $ne: null }, risk_level: { $ne: null } } },
      {
        $group: {
          _id: '$importer_id',
          total_shipments: { $sum: 1 },
          critical_count: {
            $sum: { $cond: [{ $eq: ['$risk_level', 'Critical'] }, 1, 0] },
          },
          auto_escalated_count: {
            $sum: { $cond: ['$auto_escalated_by_importer_history', 1, 0] },
          },
          avg_risk_score: { $avg: '$risk_score' },
          latest_shipment: { $max: '$processed_at' },
          countries: { $addToSet: '$origin_country' },
        },
      },
      {
        $addFields: {
          critical_percentage: {
            $cond: [
              { $gt: ['$total_shipments', 0] },
              {
                $multiply: [
                  { $divide: ['$critical_count', '$total_shipments'] },
                  100,
                ],
              },
              0,
            ],
          },
        },
      },
      { $match: { critical_percentage: { $gte: minPct } } },
      { $sort: { critical_count: -1, critical_percentage: -1 } },
      { $limit: limit },
    ]);

    const data = importers.map((imp) => ({
      importer_id: imp._id,
      total_shipments: imp.total_shipments,
      critical_count: imp.critical_count,
      critical_percentage: parseFloat((imp.critical_percentage || 0).toFixed(2)),
      auto_escalated_count: imp.auto_escalated_count,
      avg_risk_score: parseFloat((imp.avg_risk_score || 0).toFixed(3)),
      // Flag whether this importer currently triggers the >20% escalation rule
      triggers_escalation: imp.critical_percentage > 20,
      latest_shipment: imp.latest_shipment,
      origin_countries: (imp.countries || []).filter(Boolean).slice(0, 5),
    }));

    await setCache(cacheKey, data, CACHE_TTL);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error(`Importer risk history error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/analytics/escalation-stats
 * Feature 7: System-wide auto-escalation statistics.
 * Returns total escalated containers, rate, and per-importer breakdown.
 */
const getEscalationStats = async (req, res) => {
  const cacheKey = 'analytics:escalation_stats';

  try {
    const cached = await getCache(cacheKey);
    if (cached) return res.status(200).json({ success: true, data: cached, cached: true });

    const [totalProcessed, totalEscalatedImporter, totalEscalatedNewTrader, byImporter] = await Promise.all([
      Container.countDocuments({ risk_level: { $ne: null } }),
      Container.countDocuments({ auto_escalated_by_importer_history: true }),
      Container.countDocuments({ auto_escalated_by_new_trader_rule: true }),
      Container.aggregate([
        { $match: { auto_escalated_by_importer_history: true } },
        {
          $group: {
            _id: '$importer_id',
            escalated_count: { $sum: 1 },
            critical_percentage: { $avg: '$importer_critical_percentage' },
          },
        },
        { $sort: { escalated_count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    const totalEscalated = totalEscalatedImporter + totalEscalatedNewTrader;

    const data = {
      total_auto_escalated: totalEscalated,
      total_escalated_importer: totalEscalatedImporter,
      total_escalated_new_trader: totalEscalatedNewTrader,
      total_containers: totalProcessed,
      escalation_rate:
        totalProcessed > 0
          ? parseFloat(((totalEscalated / totalProcessed) * 100).toFixed(2))
          : 0,
      by_importer: byImporter.map((i) => ({
        importer_id: i._id,
        escalated_count: i.escalated_count,
        critical_percentage: parseFloat((i.critical_percentage || 0).toFixed(2)),
      })),
    };

    await setCache(cacheKey, data, CACHE_TTL);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error(`Escalation stats error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getSummary,
  getRiskDistribution,
  getTopRiskyRoutes,
  getAnomalyStats,
  getRecentHighRisk,
  getContainersList,
  clearAllData,
  getRouteRisk,
  getSuspiciousImporters,
  getFraudPatterns,
  getRiskTrend,
  getImporterRiskHistory,
  getEscalationStats,
};
