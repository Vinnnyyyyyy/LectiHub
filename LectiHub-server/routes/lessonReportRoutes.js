const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const {
  listLessonReports,
  getLessonReportById,
} = require('../controllers/lessonReportController');

router.get('/', auth, requireRole('student', 'teacher', 'admin'), listLessonReports);
router.get('/:reportId', auth, requireRole('student', 'teacher', 'admin'), getLessonReportById);

module.exports = router;
