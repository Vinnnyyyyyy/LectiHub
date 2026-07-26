const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const {
  createPaymentReceipt,
  listPaymentReceipts,
  listMyPaymentReceipts,
  getPaymentReceipt,
  updatePaymentReceiptStatus,
} = require('../controllers/paymentReceiptController');

router.post('/', auth, requireRole('student', 'admin'), createPaymentReceipt);
router.get('/mine', auth, requireRole('student'), listMyPaymentReceipts);
router.get('/', auth, requireRole('admin'), listPaymentReceipts);
router.get('/:id', auth, requireRole('student', 'admin'), getPaymentReceipt);
router.patch('/:id', auth, requireRole('admin'), updatePaymentReceiptStatus);

module.exports = router;
