/**
 * Tracking Routes
 * GET  /api/map/track/:container_id        — single container track + GeoJSON
 * GET  /api/map/tracks                     — fleet FeatureCollection
 * GET  /api/map/heatmap                    — risk heatmap
 * POST /api/tracking/link-vessel           — link container to vessel (admin/officer)
 * POST /api/tracking/refresh/:container_id — force refresh position (admin/officer)
 */
const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate, schemas } = require('../utils/validators');
const {
  getTrack,
  getTracks,
  getHeatmap,
  linkVessel,
  forceRefresh,
} = require('../controllers/trackingController');

/**
 * @swagger
 * /api/map/track/{container_id}:
 *   get:
 *     tags: [Tracking]
 *     summary: Get full tracking data + GeoJSON for a container
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: container_id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Track object with GeoJSON, stops, events, and current position
 *       404:
 *         description: Container not found
 */
router.get('/map/track/:container_id', requireAuth, getTrack);

/**
 * @swagger
 * /api/map/tracks:
 *   get:
 *     tags: [Tracking]
 *     summary: Get FeatureCollection of all tracked containers
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: risk_level
 *         schema: { type: string, enum: [Critical, Low Risk, Clear] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [AT_SEA, IN_PORT, DELAYED, ARRIVED] }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 200 }
 */
router.get('/map/tracks', requireAuth, getTracks);

/**
 * @swagger
 * /api/map/heatmap:
 *   get:
 *     tags: [Tracking]
 *     summary: Risk heatmap aggregated by origin coordinates
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: metric
 *         schema: { type: string, enum: [risk_score, anomaly_score, dwell_time_hours], default: risk_score }
 */
router.get('/map/heatmap', requireAuth, getHeatmap);

/**
 * @swagger
 * /api/tracking/link-vessel:
 *   post:
 *     tags: [Tracking]
 *     summary: Link a container to a vessel IMO or name
 *     security: [{ bearerAuth: [] }]
 */
router.post('/tracking/link-vessel', requireAuth, requireRole('officer'), validate(schemas.linkVessel), linkVessel);

/**
 * @swagger
 * /api/tracking/refresh/{container_id}:
 *   post:
 *     tags: [Tracking]
 *     summary: Force refresh simulated position for a container
 *     security: [{ bearerAuth: [] }]
 */
router.post('/tracking/refresh/:container_id', requireAuth, requireRole('officer'), forceRefresh);

module.exports = router;
