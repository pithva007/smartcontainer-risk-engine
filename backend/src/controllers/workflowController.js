/**
 * Workflow Controller
 * Customs inspection workflow endpoints.
 *
 * POST /api/containers/:id/assign   — assign officer (admin/officer)
 * POST /api/containers/:id/status   — update inspection status
 * POST /api/containers/:id/notes    — add note
 * GET  /api/queue                   — priority queue sorted by risk
 */
const Container = require('../models/containerModel');
const { audit } = require('../services/auditService');
const logger = require('../utils/logger');

// ── Assign Container ───────────────────────────────────────────────────────────
const assignContainer = async (req, res) => {
  const { id } = req.params;
  const { assigned_to, notes } = req.body;

  const container = await Container.findOne({ container_id: id });
  if (!container) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: `Container '${id}' not found.`, request_id: req.requestId },
    });
  }

  container.assigned_to = assigned_to;
  if (!container.inspection_status || container.inspection_status === 'NEW') {
    container.inspection_status = 'ASSIGNED';
  }
  container.updated_at = new Date();

  if (notes && notes.trim().length > 0) {
    container.notes.push({ text: notes.trim(), added_by: req.user?.username || 'system', timestamp: new Date() });
  }

  await container.save();

  await audit({
    user: req.user,
    action: 'ASSIGN_CONTAINER',
    entityType: 'Container',
    entityId: id,
    req,
    metadata: { assigned_to, notes },
  });

  return res.status(200).json({ success: true, container_id: id, inspection_status: container.inspection_status, assigned_to });
};

// ── Update Status ──────────────────────────────────────────────────────────────
const updateStatus = async (req, res) => {
  const { id } = req.params;
  const { inspection_status, notes } = req.body;

  const container = await Container.findOne({ container_id: id });
  if (!container) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: `Container '${id}' not found.`, request_id: req.requestId },
    });
  }

  container.inspection_status = inspection_status;
  if (inspection_status === 'CLEARED') {
    container.risk_level = 'Clear';
  }
  container.updated_at = new Date();
  if (notes) {
    container.notes.push({ text: notes, added_by: req.user?.username || 'system', timestamp: new Date() });
  }
  await container.save();

  await audit({
    user: req.user,
    action: 'UPDATE_STATUS',
    entityType: 'Container',
    entityId: id,
    req,
    metadata: { inspection_status, notes },
  });

  return res.status(200).json({ success: true, container_id: id, inspection_status });
};

// ── Add Note ───────────────────────────────────────────────────────────────────
const addNote = async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;

  const container = await Container.findOne({ container_id: id });
  if (!container) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: `Container '${id}' not found.`, request_id: req.requestId },
    });
  }

  container.notes.push({ text: note, added_by: req.user?.username || 'system', timestamp: new Date() });
  container.updated_at = new Date();
  await container.save();

  await audit({
    user: req.user,
    action: 'ADD_NOTE',
    entityType: 'Container',
    entityId: id,
    req,
    metadata: { note },
  });

  return res.status(201).json({
    success: true,
    container_id: id,
    notes: container.notes,
  });
};

// ── Inspection Queue ───────────────────────────────────────────────────────────
const getQueue = async (req, res) => {
  const { page = 1, limit = 50, risk_level, anomaly } = req.query;

  const filter = {
    inspection_status: { $in: ['NEW', 'ASSIGNED', 'IN_REVIEW'] },
  };
  if (risk_level) filter.risk_level = risk_level;
  if (anomaly === 'true') filter.anomaly_flag = true;

  // Officers see only containers assigned to them
  if (req.user.role === 'officer') {
    filter.assigned_to = req.user.username;
  }

  const [total, containers] = await Promise.all([
    Container.countDocuments(filter),
    Container.find(filter)
      .sort({
        // Priority: Critical first, then anomalies, then highest risk score, then dwell time
        risk_score: -1,
        anomaly_flag: -1,
        dwell_time_hours: -1,
      })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .select(
        'container_id origin_country destination_country risk_score risk_level anomaly_flag dwell_time_hours inspection_status assigned_to declaration_date notes'
      )
      .lean(),
  ]);

  return res.status(200).json({
    success: true,
    total,
    page: parseInt(page),
    limit: parseInt(limit),
    queue: containers,
  });
};

// ── Get Single Container ───────────────────────────────────────────────────────
const getContainer = async (req, res) => {
  const { id } = req.params;
  const container = await Container.findOne({ container_id: id }).lean();
  if (!container) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: `Container '${id}' not found.`, request_id: req.requestId },
    });
  }
  return res.status(200).json({ success: true, data: container });
};

// ── Notifications (Activity Feed) ──────────────────────────────────────────────
const getNotifications = async (req, res) => {
  const { limit = 20 } = req.query;

  try {
    const AuditLog = require('../models/auditLogModel');
    // Fetch recent ADD_NOTE, UPDATE_STATUS, and ASSIGN_CONTAINER events
    const logs = await AuditLog.find({
      entity_type: 'Container',
      action: { $in: ['ADD_NOTE', 'UPDATE_STATUS', 'ASSIGN_CONTAINER'] }
    })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .lean();

    return res.status(200).json({
      success: true,
      data: logs
    });
  } catch (error) {
    logger.error('Error fetching notifications:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
};

module.exports = { assignContainer, updateStatus, addNote, getQueue, getContainer, getNotifications };
