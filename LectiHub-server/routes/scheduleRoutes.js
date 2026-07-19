const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const {
  createScheduleRequest,
  listMyScheduleRequests,
} = require('../controllers/scheduleController');

router.post('/', auth, requireRole('student'), createScheduleRequest);
router.get('/mine', auth, requireRole('student'), listMyScheduleRequests);

module.exports = router;
