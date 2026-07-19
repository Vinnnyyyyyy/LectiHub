const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  listMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} = require('../controllers/notificationController');

router.get('/', auth, listMyNotifications);
router.patch('/read-all', auth, markAllNotificationsRead);
router.patch('/:id/read', auth, markNotificationRead);

module.exports = router;
