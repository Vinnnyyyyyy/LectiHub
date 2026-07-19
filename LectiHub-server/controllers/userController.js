const bcrypt = require('bcrypt');
const db = require('../config/db');

async function createUser(req, res) {
  const { username, email, password, role, full_name } = req.body;

  if (!['teacher', 'student'].includes(role)) {
    return res.status(400).json({ message: 'Invalid role' });
  }

  const password_hash = await bcrypt.hash(password, 10);

  try {
    const stmt = db.prepare(`
      INSERT INTO users (username, email, password_hash, role, full_name, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(username, email, password_hash, role, full_name, req.user.id);

    res.status(201).json({ message: 'User created', username, tempPassword: password });
  } catch (err) {
    res.status(500).json({ message: 'Error creating user', error: err.message });
  }
}

module.exports = { createUser };