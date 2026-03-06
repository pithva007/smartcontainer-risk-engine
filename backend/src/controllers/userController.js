const User = require('../models/userModel');
const Session = require('../models/sessionModel');
const AuditLog = require('../models/auditLogModel');
const bcrypt = require('bcryptjs');
const { audit } = require('../services/auditService');
const logger = require('../utils/logger');

// return profile details
const getProfile = async (req, res) => {
  const user = req.user;
  return res.status(200).json({
    success: true,
    profile: {
      full_name: user.full_name || user.username,
      official_email: user.email,
      department: user.department || '',
      system_role: user.role,
      profile_photo: user.profile_photo || '',
      account_created_date: user.createdAt ? user.createdAt.toISOString().split('T')[0] : null,
      last_login_time: user.last_login,
      active_sessions: await Session.countDocuments({ user_id: user._id }),
    },
  });
};

// update profile
const updateProfile = async (req, res) => {
  const { full_name, phone_number, department, profile_photo } = req.body;
  const user = req.user;

  if (full_name !== undefined) user.full_name = full_name;
  if (phone_number !== undefined) user.phone_number = phone_number;
  if (department !== undefined) user.department = department;
  if (profile_photo !== undefined) user.profile_photo = profile_photo;

  await user.save();
  await audit({ user, action: 'UPDATE_USER', req, metadata: { fields: Object.keys(req.body) } });
  return res.status(200).json({ success: true, user: user.toSafeObject() });
};

// change password
const changePassword = async (req, res) => {
  const { current_password, new_password } = req.body;
  const user = await User.findById(req.user._id).select('+password_hash');
  const valid = await user.comparePassword(current_password);
  if (!valid) {
    return res.status(400).json({
      error: { code: 'INVALID_PASSWORD', message: 'Current password is incorrect.', request_id: req.requestId },
    });
  }
  user.password_hash = new_password;
  await user.save();

  await audit({ user: req.user, action: 'PASSWORD_CHANGE', req });
  return res.status(200).json({ success: true, message: 'Password updated.' });
};

// get active sessions
const getActiveSessions = async (req, res) => {
  const sessions = await Session.find({ user_id: req.user._id }).sort({ login_time: -1 }).lean();
  return res.status(200).json({ success: true, sessions });
};

// logout from all sessions
const logoutAll = async (req, res) => {
  await Session.deleteMany({ user_id: req.user._id }).catch(() => {});
  await audit({ user: req.user, action: 'LOGOUT_ALL', req });
  return res.status(200).json({ success: true, message: 'Logged out from all devices.' });
};

// get activity logs (audit logs)
const getActivityLogs = async (req, res) => {
  const logs = await AuditLog.find({ user_id: req.user._id })
    .sort({ timestamp: -1 })
    .limit(50)
    .lean();
  return res.status(200).json({ success: true, logs });
};

// return system access info
const getSystemAccess = async (req, res) => {
  const role = req.user.role;
  const department = req.user.department || '';

  const permissionMap = {
    admin: [
      'upload_dataset',
      'run_risk_predictions',
      'view_risk_dashboard',
      'access_container_tracking',
      'download_prediction_reports',
      'view_anomaly_detection_logs',
      'manage_system_users',
      'audit_log_access',
      'system_configuration',
    ],
    officer: [
      'upload_dataset',
      'run_risk_predictions',
      'view_risk_dashboard',
      'access_container_tracking',
      'download_prediction_reports',
      'view_anomaly_detection_logs',
    ],
    viewer: [
      'view_risk_dashboard',
      'access_container_tracking',
    ],
  };

  const allPerms = permissionMap[role] || [];
  const enabled = allPerms.filter((p) => !['manage_system_users', 'audit_log_access', 'system_configuration'].includes(p));
  const restricted = ['manage_system_users', 'audit_log_access', 'system_configuration'];

  return res.status(200).json({
    success: true,
    role,
    department,
    permissions: enabled,
    restricted_permissions: restricted,
  });
};

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  getActiveSessions,
  logoutAll,
  getActivityLogs,
  getSystemAccess,
};
