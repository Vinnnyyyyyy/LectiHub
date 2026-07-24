const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const {
  getOpenAvailability,
  getMyAvailability,
  updateMyAvailability,
} = require('../controllers/availabilityController');

router.get('/open', auth, requireRole('student', 'admin'), getOpenAvailability);
router.get('/mine', auth, requireRole('teacher'), getMyAvailability);
router.put('/mine', auth, requireRole('teacher'), updateMyAvailability);

module.exports = router;
