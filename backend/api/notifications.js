const AuditLog = require('../src/models/auditLogModel');
const { initServerless } = require('./_lib/init');
const {
  getRequestId,
  applyCors,
  handlePreflight,
  sendOk,
  sendError,
  methodNotAllowed,
} = require('./_lib/http');
const { requireAuth } = require('./_lib/auth');

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

    const limitRaw = Number(req.query?.limit || 20);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(limitRaw, 100))
      : 20;

    const logs = await AuditLog.find({
      entity_type: 'Container',
      action: { $in: ['ADD_NOTE', 'UPDATE_STATUS', 'ASSIGN_CONTAINER'] },
    })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    // Small cache hint to reduce polling pressure while keeping feed fresh.
    res.setHeader('Cache-Control', 'private, max-age=5, stale-while-revalidate=25');

    return sendOk(res, {
      request_id: requestId,
      data: logs,
      limit,
    });
  } catch (err) {
    return sendError(
      res,
      500,
      'NOTIFICATIONS_FAILED',
      'Failed to fetch notifications.',
      requestId,
      err.message
    );
  }
};
