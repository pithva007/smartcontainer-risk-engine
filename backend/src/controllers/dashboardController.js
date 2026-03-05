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
  try {
    const containers = await Container.find({ risk_level: 'Critical' })
      .sort({ processed_at: -1 })
      .limit(limit)
      .select('container_id origin_country destination_country risk_score risk_level anomaly_flag explanation processed_at')
      .lean();

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

  const filter = {};
  if (risk_level) filter.risk_level = risk_level;
  if (anomaly === 'true') filter.anomaly_flag = true;

  try {
    const [total, containers] = await Promise.all([
      Container.countDocuments(filter),
      Container.find(filter)
        .sort({ processed_at: -1, risk_score: -1 })
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit))
        .select(
          'container_id origin_country destination_country risk_score risk_level anomaly_flag inspection_status assigned_to'
        )
        .lean(),
    ]);

    return res.status(200).json({
      success: true,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      data: containers,
    });
  } catch (error) {
    logger.error(`Get containers list error: ${error.message}`);
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
};
