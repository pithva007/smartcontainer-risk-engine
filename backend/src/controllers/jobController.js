/**
 * Job Controller
 * GET  /api/jobs/:job_id        — job status + progress
 * GET  /api/jobs/:job_id/logs   — log lines
 * GET  /api/jobs/:job_id/result — download prediction CSV
 * GET  /api/jobs               — list recent jobs (admin/officer)
 */
const path = require('path');
const fs = require('fs');
const Job = require('../models/jobModel');
const logger = require('../utils/logger');

// ── GET Job Status ─────────────────────────────────────────────────────────────
const getJobStatus = async (req, res) => {
  const job = await Job.findOne({ job_id: req.params.job_id })
    .select('-logs')
    .populate('created_by', 'username role');

  if (!job) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Job not found.', request_id: req.requestId },
    });
  }

  return res.status(200).json({ success: true, job });
};

// ── GET Job Logs ───────────────────────────────────────────────────────────────
const getJobLogs = async (req, res) => {
  const job = await Job.findOne({ job_id: req.params.job_id }).select('job_id logs status');

  if (!job) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Job not found.', request_id: req.requestId },
    });
  }

  return res.status(200).json({
    success: true,
    job_id: job.job_id,
    status: job.status,
    logs: job.logs || [],
  });
};

// ── GET Job Result CSV ─────────────────────────────────────────────────────────
const getJobResult = async (req, res) => {
  const job = await Job.findOne({ job_id: req.params.job_id });

  if (!job) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Job not found.', request_id: req.requestId },
    });
  }

  if (job.status !== 'completed') {
    return res.status(409).json({
      error: {
        code: 'JOB_NOT_COMPLETE',
        message: `Job is ${job.status}. Result only available when status is 'completed'.`,
        request_id: req.requestId,
      },
    });
  }

  // Try to serve pre-generated result file
  const resultFile = job.metadata?.result_file;
  if (resultFile && fs.existsSync(resultFile)) {
    res.setHeader('Content-Disposition', `attachment; filename="job-${job.job_id}-results.csv"`);
    res.setHeader('Content-Type', 'text/csv');
    return fs.createReadStream(resultFile).pipe(res);
  }

  // Fallback: generate CSV on-the-fly from batch_id
  const batchId = job.metadata?.batch_id;
  if (!batchId) {
    return res.status(404).json({
      error: { code: 'NO_RESULT', message: 'Result file not available.', request_id: req.requestId },
    });
  }

  // Delegate to report service
  const { generateCSV } = require('../services/reportService');
  const csv = await generateCSV({ batch_id: batchId });

  res.setHeader('Content-Disposition', `attachment; filename="job-${job.job_id}-results.csv"`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  return res.send(csv);
};

// ── LIST Recent Jobs ───────────────────────────────────────────────────────────
const listJobs = async (req, res) => {
  const { status, type, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (type) filter.type = type;

  // Officers can only see their own jobs
  if (req.user.role === 'officer') {
    filter.created_by = req.user._id;
  }

  const [total, jobs] = await Promise.all([
    Job.countDocuments(filter),
    Job.find(filter)
      .select('-logs')
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .populate('created_by', 'username'),
  ]);

  return res.status(200).json({
    success: true,
    total,
    page: parseInt(page),
    limit: parseInt(limit),
    jobs,
  });
};

module.exports = { getJobStatus, getJobLogs, getJobResult, listJobs };
