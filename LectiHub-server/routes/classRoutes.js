const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const {
  listMyClasses,
  getClassByRequest,
  joinClass,
  updateLessonConduct,
  completeClass,
  listClassHistory,
} = require('../controllers/classController');
const {
  getLessonReportForClass,
  submitLessonReport,
} = require('../controllers/lessonReportController');

router.get('/mine', auth, requireRole('student', 'teacher', 'admin'), listMyClasses);
router.get('/history', auth, requireRole('student', 'teacher', 'admin'), listClassHistory);
router.get('/by-request/:requestId', auth, getClassByRequest);
router.post('/:id/join', auth, requireRole('student', 'teacher', 'admin'), joinClass);
router.patch(
  '/:id/conduct',
  auth,
  requireRole('teacher', 'admin'),
  updateLessonConduct,
);
router.post(
  '/:id/complete',
  auth,
  requireRole('teacher', 'admin'),
  completeClass,
);
router.get(
  '/:id/report',
  auth,
  requireRole('student', 'teacher', 'admin'),
  getLessonReportForClass,
);
router.post(
  '/:id/report',
  auth,
  requireRole('teacher', 'admin'),
  submitLessonReport,
);

module.exports = router;
