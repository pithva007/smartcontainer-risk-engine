/**
 * Auth Controller
 * POST /api/auth/register  — create new user (admin only)
 * POST /api/auth/login     — return JWT
 * GET  /api/auth/me        — return current user profile
 * POST /api/auth/logout    — audit log only (stateless JWT)
 * GET  /api/auth/users     — list users (admin only)
 * PATCH /api/auth/users/:id/activate — toggle active (admin)
 */
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const { audit } = require('../services/auditService');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';

// ── Register (admin-only) ──────────────────────────────────────────────────────
const register = async (req, res) => {
  const { username, email, password, full_name, role } = req.body;

  if (await User.exists({ username: username.toLowerCase() })) {
    return res.status(409).json({
      error: { code: 'USER_EXISTS', message: 'Username already taken.', request_id: req.requestId },
    });
  }
  if (await User.exists({ email: email.toLowerCase() })) {
    return res.status(409).json({
      error: { code: 'EMAIL_EXISTS', message: 'Email already registered.', request_id: req.requestId },
    });
  }

  const user = await User.create({
    username,
    email,
    password_hash: password, // pre-save hook hashes it
    full_name,
    role: role || 'viewer',
    created_by: req.user?._id,
  });

  await audit({
    user: req.user,
    action: 'CREATE_USER',
    entityType: 'User',
    entityId: user._id,
    req,
    metadata: { created_username: username, role: user.role },
  });

  logger.info(`User created: ${username} (${user.role}) by ${req.user?.username || 'system'}`);

  return res.status(201).json({
    success: true,
    user: user.toSafeObject(),
  });
};

// ── Login ──────────────────────────────────────────────────────────────────────
const login = async (req, res) => {
  const { username, password } = req.body;

  const user = await User.findOne({ username: username.toLowerCase() }).select('+password_hash +is_active');

  if (!user || !user.is_active) {
    return res.status(401).json({
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password.', request_id: req.requestId },
    });
  }

  const valid = await user.comparePassword(password);
  if (!valid) {
    return res.status(401).json({
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password.', request_id: req.requestId },
    });
  }

  await User.updateOne({ _id: user._id }, { last_login: new Date() });

  const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRY });

  await audit({ user, action: 'LOGIN', req, metadata: { ip: req.ip } });

  return res.status(200).json({
    success: true,
    token,
    expires_in: JWT_EXPIRY,
    user: user.toSafeObject(),
  });
};

// ── Logout ─────────────────────────────────────────────────────────────────────
const logout = async (req, res) => {
  await audit({ user: req.user, action: 'LOGOUT', req });
  return res.status(200).json({ success: true, message: 'Logged out.' });
};

// ── Me ─────────────────────────────────────────────────────────────────────────
const me = async (req, res) => {
  return res.status(200).json({ success: true, user: req.user.toSafeObject() });
};

// ── List Users (admin) ─────────────────────────────────────────────────────────
const listUsers = async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 }).lean();
  return res.status(200).json({
    success: true,
    total: users.length,
    users: users.map(({ password_hash, ...u }) => u),
  });
};

// ── Toggle Active (admin) ──────────────────────────────────────────────────────
const toggleActive = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'User not found.', request_id: req.requestId },
    });
  }

  user.is_active = !user.is_active;
  await user.save();

  await audit({
    user: req.user,
    action: 'UPDATE_USER',
    entityType: 'User',
    entityId: user._id,
    req,
    metadata: { is_active: user.is_active },
  });

  return res.status(200).json({ success: true, user: user.toSafeObject() });
};

module.exports = { register, login, logout, me, listUsers, toggleActive };
