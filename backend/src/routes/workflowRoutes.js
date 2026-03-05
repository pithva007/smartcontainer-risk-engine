/**
 * Workflow Routes
 * POST /api/containers/:id/assign  — assign to officer
 * POST /api/containers/:id/status  — update inspection status
 * POST /api/containers/:id/notes   — add note
 * GET  /api/queue                  — priority inspection queue
 */
const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate, schemas } = require('../utils/validators');
const { assignContainer, updateStatus, addNote, getQueue } = require('../controllers/workflowController');

/**
 * @swagger
 * /api/queue:
 *   get:
 *     tags: [Workflow]
 *     summary: Get priority inspection queue (sorted by risk)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: risk_level
 *         schema: { type: string, enum: [Critical, Low Risk, Clear] }
 *       - in: query
 *         name: anomaly
 *         schema: { type: boolean }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 */
router.get('/queue', requireAuth, requireRole('officer'), getQueue);

/**
 * @swagger
 * /api/containers/{id}/assign:
 *   post:
 *     tags: [Workflow]
 *     summary: Assign container to an officer
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 */
router.post('/containers/:id/assign', requireAuth, requireRole('officer'), validate(schemas.assignContainer), assignContainer);

/**
 * @swagger
 * /api/containers/{id}/status:
 *   post:
 *     tags: [Workflow]
 *     summary: Update inspection status of a container
 *     security: [{ bearerAuth: [] }]
 */
router.post('/containers/:id/status', requireAuth, requireRole('officer'), validate(schemas.updateStatus), updateStatus);

/**
 * @swagger
 * /api/containers/{id}/notes:
 *   post:
 *     tags: [Workflow]
 *     summary: Add an inspection note to a container
 *     security: [{ bearerAuth: [] }]
 */
router.post('/containers/:id/notes', requireAuth, requireRole('officer'), validate(schemas.addNote), addNote);

module.exports = router;
