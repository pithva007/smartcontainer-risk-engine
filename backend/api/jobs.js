const Job = require('../src/models/jobModel');
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

    const status = req.query?.status;
    const type = req.query?.type;
    const pageRaw = Number(req.query?.page || 1);
    const limitRaw = Number(req.query?.limit || 20);
    const page = Number.isFinite(pageRaw) ? Math.max(1, pageRaw) : 1;
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 100)) : 20;

    const filter = {};
    if (status) filter.status = status;
    if (type) filter.type = type;

    // Officers can only view their own jobs.
    if (user.role === 'officer') {
      filter.created_by = user._id;
    }

    const [total, jobs] = await Promise.all([
      Job.countDocuments(filter),
      Job.find(filter)
        .select('-logs')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('created_by', 'username role')
        .lean(),
    ]);

    const normalizedJobs = jobs.map((job) => ({
      ...job,
      created_at: job.createdAt,
    }));

    res.setHeader('Cache-Control', 'private, max-age=3, stale-while-revalidate=15');

    return sendOk(res, {
      request_id: requestId,
      total,
      page,
      limit,
      jobs: normalizedJobs,
    });
  } catch (err) {
    return sendError(
      res,
      500,
      'JOBS_FAILED',
      'Failed to fetch jobs.',
      requestId,
      err.message
    );
  }
};
