const { initServerless } = require('../_lib/init');
const {
  getRequestId,
  applyCors,
  handlePreflight,
  sendOk,
  sendError,
  methodNotAllowed,
} = require('../_lib/http');
const { requireAuth } = require('../_lib/auth');

module.exports = async (req, res) => {
  const requestId = getRequestId(req);
  applyCors(req, res);
  if (handlePreflight(req, res)) return;

  if (req.method !== 'GET') {
    return methodNotAllowed(res, requestId, ['GET', 'OPTIONS']);
  }

  try {
    await initServerless();

    const user = await requireAuth(req, res, requestId);
    if (!user) return;

    return sendOk(res, {
      request_id: requestId,
      user: user.toSafeObject(),
    });
  } catch (err) {
    return sendError(
      res,
      500,
      'AUTH_ME_FAILED',
      'Failed to load current user.',
      requestId,
      err.message
    );
  }
};
