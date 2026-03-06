/**
 * Report Routes
 * GET /api/report/summary.csv       — download CSV report
 * GET /api/report/summary.pdf       — download PDF report
 * GET /api/report/predictions.csv   — focused 4-column prediction export
 */
const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { downloadCSV, downloadPDF, downloadPredictionsCSV } = require('../controllers/reportController');

/**
 * @swagger
 * /api/report/summary.csv:
 *   get:
 *     tags: [Reports]
 *     summary: Download full container data as CSV
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: batch_id
 *         schema: { type: string }
 *       - in: query
 *         name: risk_level
 *         schema: { type: string, enum: [Critical, Low Risk, Clear] }
 *       - in: query
 *         name: from_date
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to_date
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema: { type: string, format: binary }
 */
router.get('/report/summary.csv', requireAuth, requireRole('officer'), downloadCSV);

/**
 * @swagger
 * /api/report/summary.pdf:
 *   get:
 *     tags: [Reports]
 *     summary: Download risk analysis summary as PDF
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: batch_id
 *         schema: { type: string }
 *       - in: query
 *         name: risk_level
 *         schema: { type: string, enum: [Critical, Low Risk, Clear] }
 *     responses:
 *       200:
 *         description: PDF file download
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 */
router.get('/report/summary.pdf', requireAuth, requireRole('officer'), downloadPDF);

/**
 * @swagger
 * /api/report/predictions.csv:
 *   get:
 *     tags: [Reports]
 *     summary: Download focused prediction CSV (Container_ID, Risk_Score, Risk_Level, Explanation_Summary)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: batch_id
 *         schema: { type: string }
 *         description: Filter to a specific upload batch
 *       - in: query
 *         name: risk_level
 *         schema: { type: string, enum: [Critical, Low Risk, Clear] }
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema: { type: string, format: binary }
 */
router.get('/report/predictions.csv', requireAuth, downloadPredictionsCSV);

module.exports = router;
