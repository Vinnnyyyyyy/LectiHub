const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const {
  createScheduleRequest,
  listMyScheduleRequests,
  listScheduleRequestsForAdmin,
  getScheduleRequestForAdmin,
  assignTeacherToRequest,
} = require('../controllers/scheduleController');

router.post('/', auth, requireRole('student'), createScheduleRequest);
router.get('/mine', auth, requireRole('student'), listMyScheduleRequests);

router.get('/', auth, requireRole('admin'), listScheduleRequestsForAdmin);
router.get('/:id', auth, requireRole('admin'), getScheduleRequestForAdmin);
router.post('/:id/assign', auth, requireRole('admin'), assignTeacherToRequest);

module.exports = router;
