/**
 * Dashboard Routes
 * GET    /api/summary                     - Overall risk summary
 * GET    /api/dashboard/risk-distribution - Risk level distribution
 * GET    /api/dashboard/top-risky-routes  - Top risky trade routes
 * GET    /api/dashboard/anomaly-stats     - Anomaly statistics
 * GET    /api/dashboard/recent-high-risk  - Recent critical containers
 * DELETE /api/containers/all              - Clear ALL container data + jobs
 */
const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const {
  getSummary,
  getRiskDistribution,
  getTopRiskyRoutes,
  getAnomalyStats,
  getRecentHighRisk,
  getContainersList,
  clearAllData,
} = require('../controllers/dashboardController');

router.get('/summary', getSummary);
router.get('/dashboard/risk-distribution', getRiskDistribution);
router.get('/dashboard/top-risky-routes', getTopRiskyRoutes);
router.get('/dashboard/anomaly-stats', getAnomalyStats);
router.get('/dashboard/recent-high-risk', getRecentHighRisk);
router.get('/dashboard/containers', getContainersList);
router.delete('/containers/all', requireAuth, clearAllData);

module.exports = router;
