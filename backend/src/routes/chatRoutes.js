/**
 * Chat Routes
 * POST   /api/chat/start
 * GET    /api/chat/conversations
 * GET    /api/chat/messages/:conversation_id
 * POST   /api/chat/message
 * PATCH  /api/chat/status/:conversation_id
 * POST   /api/chat/upload
 */
const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');
const { validate, schemas } = require('../utils/validators');
const {
  startConversation,
  getConversations,
  getMessages,
  sendMessage,
} = require('../controllers/chatController');

// Chat attachment uploads
const isVercel = !!(process.env.VERCEL || process.env.VERCEL_URL || process.env.VERCEL_ENV);
const UPLOAD_DIR = isVercel ? '/tmp/uploads' : (process.env.UPLOAD_DIR || './data/uploads');
try { if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch { /* ignore */ }

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `chat-${unique}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedExt = ['.pdf', '.jpg', '.jpeg', '.png'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowedExt.includes(ext)) return cb(new Error('Only PDF/JPG/PNG files are accepted.'), false);
  return cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 50) * 1024 * 1024 },
});

router.post('/chat/start', requireAuth, validate(schemas.chatStart), startConversation);
router.get('/chat/conversations', requireAuth, validate(schemas.chatListConversations), getConversations);
router.get('/chat/messages/:conversation_id', requireAuth, validate(schemas.chatGetMessages), getMessages);
router.post('/chat/message', requireAuth, validate(schemas.chatSendMessage), sendMessage);

router.post('/chat/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file provided.', request_id: req.requestId });
  const urlPath = `/uploads/${req.file.filename}`;
  return res.status(200).json({
    success: true,
    file: {
      url: urlPath,
      name: req.file.originalname,
      mime: req.file.mimetype,
      size: req.file.size,
    },
  });
});

module.exports = router;

