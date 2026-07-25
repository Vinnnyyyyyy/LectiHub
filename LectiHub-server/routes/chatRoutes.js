const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const {
  listChatThreads,
  listMessagesForPeer,
  sendMessageForPeer,
} = require('../controllers/chatController');

router.get('/threads', auth, requireRole('student', 'teacher'), listChatThreads);
router.get(
  '/peers/:peerId/messages',
  auth,
  requireRole('student', 'teacher'),
  listMessagesForPeer,
);
router.post(
  '/peers/:peerId/messages',
  auth,
  requireRole('student', 'teacher'),
  sendMessageForPeer,
);

module.exports = router;
