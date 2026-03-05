/**
 * Audit Log Model
 * Immutable record of user actions for compliance and forensics
 */
const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    username: String,
    role: String,
    action: {
      type: String,
      enum: [
        'LOGIN',
        'LOGOUT',
        'UPLOAD_DATASET',
        'PREDICT_SINGLE',
        'PREDICT_BATCH',
        'DOWNLOAD_REPORT',
        'UPDATE_STATUS',
        'ASSIGN_CONTAINER',
        'ADD_NOTE',
        'RETRAIN_MODEL',
        'CREATE_USER',
        'UPDATE_USER',
        'VIEW_DASHBOARD',
        'LINK_VESSEL',
        'VIEW_TRACK',
      ],
      required: true,
      index: true,
    },
    entity_type: {
      type: String,
      enum: ['Container', 'Job', 'User', 'Report', 'ShipmentTrack'],
      index: true,
    },
    entity_id: String,
    ip: String,
    user_agent: String,
    request_id: String,
    metadata: mongoose.Schema.Types.Mixed,
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
      immutable: true,
    },
  },
  {
    timestamps: false,
    collection: 'audit_logs',
  }
);

auditLogSchema.index({ timestamp: -1, action: 1 });
auditLogSchema.index({ user_id: 1, timestamp: -1 });
auditLogSchema.index({ entity_type: 1, entity_id: 1 });

// TTL: keep audit logs for 1 year
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 31536000 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
