const Container = require('../../src/models/containerModel');
const Job = require('../../src/models/jobModel');
const { flushCache } = require('../../src/config/redis');
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

const allowedMethods = ['GET', 'DELETE', 'OPTIONS'];

module.exports = async (req, res) => {
  const requestId = getRequestId(req);
  applyCors(req, res);
  if (handlePreflight(req, res)) return;

  if (!allowedMethods.includes(req.method)) {
    return methodNotAllowed(res, requestId, allowedMethods);
  }

  try {
    await initServerless();

    const user = await requireAuth(req, res, requestId);
    if (!user) return;

    if (req.method === 'GET') {
      const pageRaw = Number(req.query?.page || 1);
      const limitRaw = Number(req.query?.limit || 50);
      const page = Number.isFinite(pageRaw) ? Math.max(1, pageRaw) : 1;
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 200)) : 50;
      const riskLevel = req.query?.risk_level;
      const anomaly = req.query?.anomaly;

      const filter = {};
      if (riskLevel) filter.risk_level = riskLevel;
      if (anomaly === 'true') filter.anomaly_flag = true;

      const [total, data] = await Promise.all([
        Container.countDocuments(filter),
        Container.find(filter)
          .sort({ processed_at: -1, risk_score: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
      ]);

      res.setHeader('Cache-Control', 'private, max-age=3, stale-while-revalidate=15');

      return sendOk(res, {
        request_id: requestId,
        total,
        page,
        limit,
        data,
      });
    }

    // DELETE /api/containers/all
    if (!(user.role === 'admin' || user.role === 'officer')) {
      return sendError(res, 403, 'FORBIDDEN', 'Only admin/officer can clear data.', requestId);
    }

    const [{ deletedCount }] = await Promise.all([
      Container.deleteMany({}),
      Job.deleteMany({}),
    ]);

    await flushCache().catch(() => {});

    return sendOk(res, {
      request_id: requestId,
      message: `All data cleared. ${deletedCount} containers removed.`,
      deleted_containers: deletedCount,
    });
  } catch (err) {
    return sendError(
      res,
      500,
      'CONTAINERS_ALL_FAILED',
      'Failed to process /api/containers/all request.',
      requestId,
      err.message
    );
  }
};
