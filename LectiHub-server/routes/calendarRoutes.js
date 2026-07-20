const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const {
  getMyCalendar,
  connectCalendarProvider,
  disconnectCalendarProvider,
} = require('../controllers/calendarController');

router.get('/mine', auth, requireRole('student', 'teacher', 'admin'), getMyCalendar);
router.post('/connect', auth, requireRole('teacher'), connectCalendarProvider);
router.delete('/connect/:provider', auth, requireRole('teacher'), disconnectCalendarProvider);

module.exports = router;
