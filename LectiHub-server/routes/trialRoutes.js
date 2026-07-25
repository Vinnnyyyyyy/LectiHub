const express = require('express');
const router = express.Router();
const {
  getTrialConfig,
  createFreeTrialRequest,
} = require('../controllers/trialController');

// Public free-trial intake (no auth) — posts leads to Dolibarr from the LectiHub web form.
router.get('/config', getTrialConfig);
router.post('/', createFreeTrialRequest);

module.exports = router;
