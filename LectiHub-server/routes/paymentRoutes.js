const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const {
  getPaymentConfig,
  createDolibarrPaymentLink,
} = require('../controllers/paymentController');

router.get('/config', auth, requireRole('student', 'admin'), getPaymentConfig);
router.post(
  '/dolibarr/link',
  auth,
  requireRole('student', 'admin'),
  createDolibarrPaymentLink,
);

module.exports = router;
