const crypto = require('crypto');

const BUILTIN_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'https://smartcontainerrrr.vercel.app',
  'https://smartcontainer-risk-engine-fwkw.vercel.app',
];

const EXTRA_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

const ALLOWED_ORIGINS = new Set([...BUILTIN_ORIGINS, ...EXTRA_ORIGINS]);

const getRequestId = (req) => {
  return (
    req.headers['x-request-id'] ||
    req.headers['x-vercel-id'] ||
    crypto.randomUUID()
  );
};

const applyCors = (req, res) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Request-ID');
};

const handlePreflight = (req, res) => {
  if (req.method !== 'OPTIONS') return false;
  res.status(204).end();
  return true;
};

const sendOk = (res, payload, status = 200) => {
  return res.status(status).json({ success: true, ...payload });
};

const sendError = (res, status, code, message, requestId, details) => {
  const body = {
    success: false,
    error: {
      code,
      message,
      request_id: requestId,
    },
  };
  if (details && process.env.NODE_ENV !== 'production') {
    body.error.details = details;
  }
  return res.status(status).json(body);
};

const methodNotAllowed = (res, requestId, allowed) => {
  res.setHeader('Allow', allowed.join(', '));
  return sendError(res, 405, 'METHOD_NOT_ALLOWED', `Allowed methods: ${allowed.join(', ')}`, requestId);
};

module.exports = {
  getRequestId,
  applyCors,
  handlePreflight,
  sendOk,
  sendError,
  methodNotAllowed,
};
