const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const {
  listLessonReports,
  getLessonReportById,
} = require('../controllers/lessonReportController');
const {
  submitFeedbackForReport,
  getFeedbackForReport,
} = require('../controllers/studentFeedbackController');

router.get('/', auth, requireRole('student', 'teacher', 'admin'), listLessonReports);
router.post(
  '/:reportId/feedback',
  auth,
  requireRole('student'),
  submitFeedbackForReport,
);
router.get(
  '/:reportId/feedback',
  auth,
  requireRole('student', 'teacher', 'admin'),
  getFeedbackForReport,
);
router.get('/:reportId', auth, requireRole('student', 'teacher', 'admin'), getLessonReportById);

module.exports = router;
