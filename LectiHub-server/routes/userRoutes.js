const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { createUser, listUsers, deleteUser } = require('../controllers/userController');

router.get('/', auth, requireRole('admin'), listUsers);
router.post('/create', auth, requireRole('admin'), createUser);
router.delete('/:id', auth, requireRole('admin'), deleteUser);

module.exports = router;
