const jwt = require('jsonwebtoken');
const User = require('../../src/models/userModel');
const Session = require('../../src/models/sessionModel');
const { sendError } = require('./http');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

const requireAuth = async (req, res, requestId) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendError(res, 401, 'UNAUTHORIZED', 'Missing or invalid Authorization header.', requestId);
    return null;
  }

  const token = authHeader.slice(7);
  let decoded;

  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID';
    sendError(res, 401, code, err.message, requestId);
    return null;
  }

  const user = await User.findById(decoded.id).select('+is_active +role');
  if (!user || !user.is_active) {
    sendError(res, 401, 'USER_INACTIVE', 'User account not found or deactivated.', requestId);
    return null;
  }

  // Session validation is best-effort; if sid exists but session is gone we return 401,
  // otherwise continue for backward compatibility with older tokens.
  if (decoded.sid) {
    const session = await Session.findById(decoded.sid);
    if (!session || String(session.user_id) !== String(user._id)) {
      sendError(res, 401, 'SESSION_INVALID', 'Session not found or expired.', requestId);
      return null;
    }
    session.last_seen = new Date();
    await session.save().catch(() => {});
  }

  return user;
};

module.exports = { requireAuth };
