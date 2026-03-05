/**
 * Auth Routes
 * POST   /api/auth/register        — create user (admin only)
 * POST   /api/auth/login           — login
 * GET    /api/auth/me              — current user
 * POST   /api/auth/logout          — logout (audit)
 * GET    /api/auth/users           — list users (admin)
 * PATCH  /api/auth/users/:id/active — toggle active (admin)
 */
const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate, schemas } = require('../utils/validators');
const {
  register,
  login,
  logout,
  me,
  listUsers,
  toggleActive,
} = require('../controllers/authController');

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login and receive a JWT token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string, example: admin }
 *               password: { type: string, example: admin123 }
 *     responses:
 *       200:
 *         description: JWT token returned
 *       401:
 *         description: Invalid credentials
 */
router.post('/auth/login', validate(schemas.login), login);

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user (Admin only)
 *     security: [{ bearerAuth: [] }]
 */
router.post('/auth/register', requireAuth, requireRole('admin'), validate(schemas.createUser), register);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user profile
 *     security: [{ bearerAuth: [] }]
 */
router.get('/auth/me', requireAuth, me);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout (records audit event)
 *     security: [{ bearerAuth: [] }]
 */
router.post('/auth/logout', requireAuth, logout);

/**
 * @swagger
 * /api/auth/users:
 *   get:
 *     tags: [Auth]
 *     summary: List all users (Admin only)
 *     security: [{ bearerAuth: [] }]
 */
router.get('/auth/users', requireAuth, requireRole('admin'), listUsers);

/**
 * @swagger
 * /api/auth/users/{id}/active:
 *   patch:
 *     tags: [Auth]
 *     summary: Toggle user active status (Admin only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 */
router.patch('/auth/users/:id/active', requireAuth, requireRole('admin'), toggleActive);

module.exports = router;
