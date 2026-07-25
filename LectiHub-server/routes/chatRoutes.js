const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const {
  listChatThreads,
  listMessagesForClass,
  sendMessageForClass,
} = require('../controllers/chatController');

router.get('/threads', auth, requireRole('student', 'teacher'), listChatThreads);
router.get(
  '/classes/:classId/messages',
  auth,
  requireRole('student', 'teacher'),
  listMessagesForClass,
);
router.post(
  '/classes/:classId/messages',
  auth,
  requireRole('student', 'teacher'),
  sendMessageForClass,
);

module.exports = router;
