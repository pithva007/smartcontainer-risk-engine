const { getSummary } = require('../src/controllers/dashboardController');
const { initServerless } = require('./_lib/init');
const {
  getRequestId,
  applyCors,
  handlePreflight,
  sendError,
  methodNotAllowed,
} = require('./_lib/http');

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
    return getSummary(req, res);
  } catch (err) {
    return sendError(
      res,
      500,
      'SUMMARY_FAILED',
      'Failed to load summary.',
      requestId,
      err.message
    );
  }
};
