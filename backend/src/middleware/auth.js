/**
 * Auth Middleware
 * requireAuth — verifies JWT and attaches req.user
 * requireRole — enforces role-based access control
 * Role hierarchy: admin > officer > viewer
 */
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const logger = require('../utils/logger');

const ROLE_HIERARCHY = { viewer: 1, officer: 2, admin: 3 };

/**
 * Verify JWT token from Authorization header (Bearer <token>)
 * Attaches decoded user to req.user
 */
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid Authorization header.',
          request_id: req.requestId,
        },
      });
    }

    const token = authHeader.slice(7);
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'change-me-in-production');
    } catch (jwtErr) {
      const code = jwtErr.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID';
      return res.status(401).json({
        error: {
          code,
          message: jwtErr.message,
          request_id: req.requestId,
        },
      });
    }

    // Fetch user from DB to get current role/active status
    const user = await User.findById(decoded.id).select('+is_active +role');
    if (!user || !user.is_active) {
      return res.status(401).json({
        error: {
          code: 'USER_INACTIVE',
          message: 'User account not found or deactivated.',
          request_id: req.requestId,
        },
      });
    }

    req.user = user;
    // attach session id from token if present
    if (decoded && decoded.sid) {
      req.tokenSid = decoded.sid;
      // verify session exists
      const Session = require('../models/sessionModel');
      const sess = await Session.findById(decoded.sid);
      if (!sess || String(sess.user_id) !== String(user._id)) {
        return res.status(401).json({
          error: {
            code: 'SESSION_INVALID',
            message: 'Session not found or expired',
            request_id: req.requestId,
          },
        });
      }
      // update last_seen timestamp
      sess.last_seen = new Date();
      await sess.save().catch(() => {});
    }
    next();
  } catch (err) {
    logger.error(`Auth middleware error: ${err.message}`);
    return res.status(500).json({
      error: {
        code: 'AUTH_ERROR',
        message: 'Authentication service error.',
        request_id: req.requestId,
      },
    });
  }
};

/**
 * Check that req.user has at least a minimum role level.
 * Usage: requireRole('officer') or requireRole(['admin', 'officer'])
 *
 * @param {string|string[]} minRole
 */
const requireRole = (minRole) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Not authenticated.', request_id: req.requestId },
    });
  }

  const allowed = Array.isArray(minRole) ? minRole : [minRole];
  const userLevel = ROLE_HIERARCHY[req.user.role] || 0;
  const requiredLevel = Math.min(...allowed.map((r) => ROLE_HIERARCHY[r] || 99));

  if (userLevel < requiredLevel) {
    return res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: `This action requires role: ${allowed.join(' or ')}.`,
        request_id: req.requestId,
      },
    });
  }
  next();
};

module.exports = { requireAuth, requireRole };
