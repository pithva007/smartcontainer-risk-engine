const Job = require('../../../src/models/jobModel');
const Container = require('../../../src/models/containerModel');
const { initServerless } = require('../../_lib/init');
const {
  getRequestId,
  applyCors,
  handlePreflight,
  sendOk,
  sendError,
  methodNotAllowed,
} = require('../../_lib/http');
const { requireAuth } = require('../../_lib/auth');

module.exports = async (req, res) => {
  const requestId = getRequestId(req);
  req.requestId = requestId;

  applyCors(req, res);
  if (handlePreflight(req, res)) return;

  if (req.method !== 'GET') {
    return methodNotAllowed(res, requestId, ['GET', 'OPTIONS']);
  }

  try {
    await initServerless();

    const user = await requireAuth(req, res, requestId);
    if (!user) return;

    const idParam = req.query?.id;
    const jobId = Array.isArray(idParam) ? idParam[0] : idParam;
    if (!jobId) {
      return sendError(res, 400, 'INVALID_JOB_ID', 'Job id is required.', requestId);
    }

    const limitRaw = Number(req.query?.limit || 200);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(limitRaw, 300))
      : 200;

    const job = await Job.findOne({ job_id: jobId })
      .select('job_id status progress error created_by metadata')
      .lean();

    if (!job) {
      return sendError(res, 404, 'NOT_FOUND', 'Job not found.', requestId);
    }

    if (user.role !== 'admin' && String(job.created_by) !== String(user._id)) {
      return sendError(res, 403, 'FORBIDDEN', 'You can only access your own jobs.', requestId);
    }

    const sinceRaw = String(req.query?.since || '').trim();
    const sinceDate = sinceRaw ? new Date(sinceRaw) : null;
    const hasValidSince = !!(sinceDate && !Number.isNaN(sinceDate.getTime()));
    const batchId = job.metadata?.batch_id;

    let rows = [];

    if (batchId) {
      const query = { upload_batch_id: batchId };
      if (hasValidSince) query.processed_at = { $gt: sinceDate };

      const docs = await Container.find(query)
        .select('container_id risk_score risk_level anomaly_flag anomaly_score explanation origin_country destination_country declared_value declared_weight processed_at')
        .sort({ processed_at: 1 })
        .limit(limit)
        .lean();

      rows = docs.map((d) => ({
        job_id: job.job_id,
        batch_id: batchId,
        container_id: d.container_id,
        risk_score: d.risk_score ?? 0,
        risk_level: d.risk_level || 'Clear',
        anomaly_flag: !!d.anomaly_flag,
        anomaly_score: d.anomaly_score ?? 0,
        explanation: d.explanation || '',
        origin_country: d.origin_country || '',
        destination_country: d.destination_country || '',
        declared_value: d.declared_value ?? 0,
        declared_weight: d.declared_weight ?? 0,
        processed_at: d.processed_at ? new Date(d.processed_at).toISOString() : new Date().toISOString(),
      }));
    }

    const total = Number(job.metadata?.total_records || 0);
    const processed = Number(job.metadata?.processed_records || 0);
    const failed = Number(job.metadata?.failed_records || 0);
    const percent = total > 0
      ? Math.round((processed / total) * 100)
      : Number(job.progress || 0);

    const progress = {
      job_id: job.job_id,
      processed,
      total,
      percent,
    };

    const done = job.status === 'completed'
      ? {
        job_id: job.job_id,
        batch_id: batchId,
        total,
        processed,
        failed,
      }
      : null;

    const nextSince = rows.length > 0
      ? rows[rows.length - 1].processed_at
      : (hasValidSince ? sinceDate.toISOString() : null);

    res.setHeader('Cache-Control', 'private, max-age=2, stale-while-revalidate=8');

    return sendOk(res, {
      request_id: requestId,
      job_id: job.job_id,
      status: job.status,
      progress,
      done,
      error: job.status === 'failed' ? (job.error || 'Job failed.') : null,
      rows,
      next_since: nextSince,
    });
  } catch (err) {
    return sendError(
      res,
      500,
      'JOB_LIVE_FAILED',
      'Failed to fetch live job updates.',
      requestId,
      err.message
    );
  }
};
