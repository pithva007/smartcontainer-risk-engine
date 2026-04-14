const { initServerless } = require('./_lib/init');
const {
	getRequestId,
	applyCors,
	handlePreflight,
	sendOk,
	sendError,
	methodNotAllowed,
} = require('./_lib/http');

module.exports = async (req, res) => {
	const requestId = getRequestId(req);
	applyCors(req, res);
	if (handlePreflight(req, res)) return;

	if (req.method !== 'GET') {
		return methodNotAllowed(res, requestId, ['GET', 'OPTIONS']);
	}

	try {
		await initServerless();

		return sendOk(res, {
			request_id: requestId,
			service: 'smartcontainer-risk-engine-api',
			status: 'ok',
			endpoints: [
				'/api',
				'/api/auth/me',
				'/api/containers/all',
				'/api/jobs',
				'/api/notifications',
			],
			timestamp: new Date().toISOString(),
		});
	} catch (err) {
		return sendError(
			res,
			500,
			'INIT_FAILED',
			'API initialization failed.',
			requestId,
			err.message
		);
	}
};
