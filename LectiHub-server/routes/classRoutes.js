const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const {
  listMyClasses,
  getClassByRequest,
  joinClass,
} = require('../controllers/classController');

router.get('/mine', auth, requireRole('student', 'teacher', 'admin'), listMyClasses);
router.get('/by-request/:requestId', auth, getClassByRequest);
router.post('/:id/join', auth, requireRole('student', 'teacher', 'admin'), joinClass);

module.exports = router;
