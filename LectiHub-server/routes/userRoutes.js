const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { createUser } = require('../controllers/userController');

router.post('/create', auth, requireRole('admin'), createUser);

module.exports = router;