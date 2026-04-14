const fs = require('fs');
const path = require('path');
const multer = require('multer');

const { initServerless } = require('../_lib/init');
const {
  getRequestId,
  applyCors,
  handlePreflight,
  sendError,
  methodNotAllowed,
} = require('../_lib/http');
const { requireAuth } = require('../_lib/auth');
const { streamUpload } = require('../../src/controllers/streamUploadController');

const isVercel = !!(process.env.VERCEL || process.env.VERCEL_URL || process.env.VERCEL_ENV);
const UPLOAD_DIR = isVercel ? '/tmp/uploads' : (process.env.UPLOAD_DIR || './data/uploads');
try { if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch { /* ignore */ }

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `upload-${unique}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.csv', '.xlsx', '.xls'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) return cb(null, true);
  return cb(new Error('Only CSV and Excel files are accepted.'), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 50) * 1024 * 1024 },
});

const runMulter = (req, res) => new Promise((resolve, reject) => {
  upload.single('dataset')(req, res, (err) => {
    if (err) reject(err);
    else resolve();
  });
});

module.exports = async (req, res) => {
  const requestId = getRequestId(req);
  req.requestId = requestId;

  applyCors(req, res);
  if (handlePreflight(req, res)) return;

  if (req.method !== 'POST') {
    return methodNotAllowed(res, requestId, ['POST', 'OPTIONS']);
  }

  try {
    await initServerless();

    const user = await requireAuth(req, res, requestId);
    if (!user) return;
    req.user = user;

    await runMulter(req, res);
    return streamUpload(req, res);
  } catch (err) {
    const isPayloadError = err && (err.code === 'LIMIT_FILE_SIZE' || err.message);
    if (isPayloadError) {
      return sendError(
        res,
        err.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
        'UPLOAD_STREAM_VALIDATION_FAILED',
        err.message || 'Invalid upload payload.',
        requestId
      );
    }

    return sendError(res, 500, 'UPLOAD_STREAM_FAILED', 'Stream upload failed.', requestId, err.message);
  }
};
