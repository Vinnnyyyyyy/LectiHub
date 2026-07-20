const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { getMonitoringOverview } = require('../controllers/adminMonitoringController');

router.get('/monitoring', auth, requireRole('admin'), getMonitoringOverview);

module.exports = router;
