/**
 * Exporter Routes
 * GET /api/exporters/:exporter_id
 */
const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { getExporterById } = require('../controllers/exporterController');

// Only admin/officer can look up exporter details
router.get('/exporters/:exporter_id', requireAuth, requireRole(['admin', 'officer']), getExporterById);

module.exports = router;

