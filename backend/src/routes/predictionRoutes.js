/**
 * Prediction Routes
 * POST /api/predict       - Single container risk prediction
 * POST /api/predict-batch - Batch prediction from uploaded CSV
 * POST /api/train         - Trigger ML training pipeline
 */
const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const { body, validationResult } = require('express-validator');
const { predictContainer, predictBatchFromFile, trainModel } = require('../controllers/predictionController');

// Multer storage for batch prediction uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_DIR || './data/uploads');
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `batch-${unique}${path.extname(file.originalname)}`);
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

// Input validation for single prediction
const validateSinglePrediction = [
  body('container_id').notEmpty().withMessage('container_id is required'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    next();
  },
];

router.post('/predict', validateSinglePrediction, predictContainer);
router.post('/predict-batch', upload.single('dataset'), predictBatchFromFile);
router.post('/train', trainModel);

module.exports = router;
