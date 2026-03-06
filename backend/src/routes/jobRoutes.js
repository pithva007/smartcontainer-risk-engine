/**
 * Job Routes
 * GET    /api/jobs               — list jobs (admin/officer)
 * GET    /api/jobs/:job_id       — job status
 * GET    /api/jobs/:job_id/logs  — job logs
 * GET    /api/jobs/:job_id/result — download result CSV
 * DELETE /api/jobs/:job_id       — delete a job record
 */
const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { getJobStatus, getJobLogs, getJobResult, listJobs, deleteJob } = require('../controllers/jobController');

/**
 * @swagger
 * /api/jobs:
 *   get:
 *     tags: [Jobs]
 *     summary: List background jobs
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [waiting, active, completed, failed] }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [UPLOAD_DATASET, BATCH_PREDICT, RETRAIN_MODEL] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 */
router.get('/jobs', requireAuth, requireRole('officer'), listJobs);

/**
 * @swagger
 * /api/jobs/{job_id}:
 *   get:
 *     tags: [Jobs]
 *     summary: Get job status and progress
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: job_id
 *         required: true
 *         schema: { type: string }
 */
router.get('/jobs/:job_id', requireAuth, getJobStatus);

/**
 * @swagger
 * /api/jobs/{job_id}/logs:
 *   get:
 *     tags: [Jobs]
 *     summary: Get job log lines
 *     security: [{ bearerAuth: [] }]
 */
router.get('/jobs/:job_id/logs', requireAuth, getJobLogs);

/**
 * @swagger
 * /api/jobs/{job_id}/result:
 *   get:
 *     tags: [Jobs]
 *     summary: Download job result as CSV (only when status=completed)
 *     security: [{ bearerAuth: [] }]
 */
router.get('/jobs/:job_id/result', requireAuth, requireRole('officer'), getJobResult);

/**
 * @swagger
 * /api/jobs/{job_id}:
 *   delete:
 *     tags: [Jobs]
 *     summary: Delete a job record (owner or admin only, not while active)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: job_id
 *         required: true
 *         schema: { type: string }
 */
router.delete('/jobs/:job_id', requireAuth, requireRole('officer'), deleteJob);

module.exports = router;
