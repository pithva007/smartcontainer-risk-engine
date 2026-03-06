/**
 * Upload Routes
 * POST /api/upload         - Dataset file upload
 * GET  /api/upload/batches - List upload batches
 */
const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { uploadDataset, listBatches } = require('../controllers/uploadController');

// On Vercel, only /tmp is writable. Fall back to /tmp/uploads when running serverless.
const UPLOAD_DIR = process.env.VERCEL
  ? '/tmp/uploads'
  : (process.env.UPLOAD_DIR || './data/uploads');
try { if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch { /* ignore */ }

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `upload-${unique}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.csv', '.xlsx', '.xls'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV and Excel files are accepted.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 50) * 1024 * 1024 },
});

router.post('/upload', upload.single('dataset'), uploadDataset);
router.get('/upload/batches', listBatches);

module.exports = router;
