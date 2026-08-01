const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { login, register, changePassword } = require('../controllers/authController');

router.post('/login', login);
router.post('/register', register);
router.patch('/password', auth, changePassword);

module.exports = router;
