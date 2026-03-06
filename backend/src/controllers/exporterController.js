const User = require('../models/userModel');

/**
 * GET /api/exporters/:exporter_id
 * Looks up exporter metadata by exporter_id.
 *
 * Current system stores exporters as "viewer" users; we map by username when possible.
 */
const getExporterById = async (req, res) => {
  const { exporter_id } = req.params;
  const id = String(exporter_id || '').trim();
  if (!id) return res.status(400).json({ success: false, message: 'exporter_id is required', request_id: req.requestId });

  const user = await User.findOne({ username: id }).select('username full_name email department').lean();

  if (!user) {
    // Best-effort fallback: return identifiers even if exporter user isn't provisioned.
    return res.status(200).json({
      success: true,
      exporter_id: id,
      exporter_name: id,
      email: '',
      company: '',
    });
  }

  return res.status(200).json({
    success: true,
    exporter_id: user.username,
    exporter_name: user.full_name || user.username,
    email: user.email || '',
    company: user.department || '',
  });
};

module.exports = { getExporterById };

