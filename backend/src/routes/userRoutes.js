const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate, schemas } = require('../utils/validators');
const {
  getProfile,
  updateProfile,
  changePassword,
  getActiveSessions,
  logoutAll,
  getActivityLogs,
  getSystemAccess,
} = require('../controllers/userController');

// schema definitions will be added below

// GET /api/user/profile
/**
 * @swagger
 * /api/user/profile:
 *   get:
 *     tags: [User]
 *     summary: Get extended profile information for current user
 *     security: [{ bearerAuth: [] }]
 */
router.get('/user/profile', requireAuth, getProfile);

// PUT /api/user/update-profile
/**
 * @swagger
 * /api/user/update-profile:
 *   put:
 *     tags: [User]
 *     summary: Update editable profile fields
 *     security: [{ bearerAuth: [] }]
 */
router.put('/user/update-profile', requireAuth, validate(schemas.updateProfile), updateProfile);

// POST /api/user/change-password
/**
 * @swagger
 * /api/user/change-password:
 *   post:
 *     tags: [User]
 *     summary: Change current user password
 *     security: [{ bearerAuth: [] }]
 */
router.post('/user/change-password', requireAuth, validate(schemas.changePassword), changePassword);

// GET /api/user/active-sessions
/**
 * @swagger
 * /api/user/active-sessions:
 *   get:
 *     tags: [User]
 *     summary: List current active login sessions
 *     security: [{ bearerAuth: [] }]
 */
router.get('/user/active-sessions', requireAuth, getActiveSessions);

// POST /api/user/logout-all
/**
 * @swagger
 * /api/user/logout-all:
 *   post:
 *     tags: [User]
 *     summary: Invalidate all sessions for current user
 *     security: [{ bearerAuth: [] }]
 */
router.post('/user/logout-all', requireAuth, logoutAll);

// GET /api/user/activity-logs
/**
 * @swagger
 * /api/user/activity-logs:
 *   get:
 *     tags: [User]
 *     summary: Fetch recent activity/audit logs for current user
 *     security: [{ bearerAuth: [] }]
 */
router.get('/user/activity-logs', requireAuth, getActivityLogs);

// GET /api/user/system-access
/**
 * @swagger
 * /api/user/system-access:
 *   get:
 *     tags: [User]
 *     summary: Return current user's role and permission sets
 *     security: [{ bearerAuth: [] }]
 */
router.get('/user/system-access', requireAuth, getSystemAccess);

module.exports = router;
