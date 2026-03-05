/**
 * Audit Service
 * Thin wrapper that creates AuditLog documents.
 * Soft-failure: logs errors but never throws to callers.
 */
const AuditLog = require('../models/auditLogModel');
const logger = require('../utils/logger');

/**
 * Record an audit event.
 *
 * @param {Object} opts
 * @param {Object} [opts.user]       - req.user object (may be null for unauthenticated)
 * @param {string} opts.action       - audit action enum value
 * @param {string} [opts.entityType] - e.g. 'Container'
 * @param {string} [opts.entityId]   - entity primary key
 * @param {Object} [opts.req]        - Express req object for IP/UA/requestId
 * @param {Object} [opts.metadata]   - additional metadata
 */
const audit = async ({ user, action, entityType, entityId, req, metadata }) => {
  try {
    await AuditLog.create({
      user_id: user?._id,
      username: user?.username,
      role: user?.role,
      action,
      entity_type: entityType,
      entity_id: entityId ? String(entityId) : undefined,
      ip: req?.ip || req?.headers?.['x-forwarded-for'],
      user_agent: req?.headers?.['user-agent'],
      request_id: req?.requestId,
      metadata,
    });
  } catch (err) {
    // Never fail the main request due to audit log error
    logger.warn(`Audit log write failed: ${err.message}`);
  }
};

module.exports = { audit };
