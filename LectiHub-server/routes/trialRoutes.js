const express = require('express');
const router = express.Router();
const {
  getTrialConfig,
  createFreeTrialRequest,
} = require('../controllers/trialController');

// Public free-trial intake (no auth) — queues leads in the E-Scheduler review queue.
router.get('/config', getTrialConfig);
router.post('/', createFreeTrialRequest);

module.exports = router;
