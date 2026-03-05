/**
 * Dashboard Routes
 * GET /api/summary                     - Overall risk summary
 * GET /api/dashboard/risk-distribution - Risk level distribution
 * GET /api/dashboard/top-risky-routes  - Top risky trade routes
 * GET /api/dashboard/anomaly-stats     - Anomaly statistics
 * GET /api/dashboard/recent-high-risk  - Recent critical containers
 */
const router = require('express').Router();
const {
  getSummary,
  getRiskDistribution,
  getTopRiskyRoutes,
  getAnomalyStats,
  getRecentHighRisk,
} = require('../controllers/dashboardController');

router.get('/summary', getSummary);
router.get('/dashboard/risk-distribution', getRiskDistribution);
router.get('/dashboard/top-risky-routes', getTopRiskyRoutes);
router.get('/dashboard/anomaly-stats', getAnomalyStats);
router.get('/dashboard/recent-high-risk', getRecentHighRisk);

module.exports = router;
