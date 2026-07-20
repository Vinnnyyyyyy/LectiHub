const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { listStudentFeedback } = require('../controllers/studentFeedbackController');

router.get('/', auth, requireRole('student', 'teacher', 'admin'), listStudentFeedback);

module.exports = router;
