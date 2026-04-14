module.exports = async (req, res) => {
  res.status(200).json({
    success: true,
    service: 'smartcontainer-risk-engine',
    message: 'Backend is running. Use /api for API endpoints.',
    api_root: '/api',
    timestamp: new Date().toISOString(),
  });
};
