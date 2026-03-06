/**
 * Dashboard Routes
 * GET    /api/summary                              - Overall risk summary
 * GET    /api/dashboard/risk-distribution          - Risk level distribution
 * GET    /api/dashboard/top-risky-routes           - Top risky trade routes
 * GET    /api/dashboard/anomaly-stats              - Anomaly statistics
 * GET    /api/dashboard/recent-high-risk           - Recent critical containers
 * GET    /api/analytics/route-risk                 - Route Risk Intelligence (Feature 2)
 * GET    /api/analytics/suspicious-importers       - Suspicious importers ranking (Feature 5)
 * GET    /api/analytics/fraud-patterns             - HS code & shipping line fraud patterns (Feature 5)
 * GET    /api/analytics/risk-trend                 - Risk counts over time (Feature 5)
 * DELETE /api/containers/all                       - Clear ALL container data + jobs
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
  getRouteRisk,
  getSuspiciousImporters,
  getFraudPatterns,
  getRiskTrend,
  getImporterRiskHistory,
  getEscalationStats,
} = require('../controllers/dashboardController');

router.get('/summary', getSummary);
router.get('/dashboard/risk-distribution', getRiskDistribution);
router.get('/dashboard/top-risky-routes', getTopRiskyRoutes);
router.get('/dashboard/anomaly-stats', getAnomalyStats);
router.get('/dashboard/recent-high-risk', getRecentHighRisk);
router.get('/dashboard/containers', getContainersList);
router.get('/analytics/route-risk', getRouteRisk);
router.get('/analytics/suspicious-importers', getSuspiciousImporters);
router.get('/analytics/fraud-patterns', getFraudPatterns);
router.get('/analytics/risk-trend', getRiskTrend);
router.get('/analytics/importer-risk-history', getImporterRiskHistory);
router.get('/analytics/escalation-stats', getEscalationStats);
router.delete('/containers/all', requireAuth, clearAllData);

module.exports = router;
