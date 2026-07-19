const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

function issueAuthResponse(user) {
  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  return {
    token,
    role: user.role,
    username: user.username,
    fullName: user.full_name || user.username,
    mustChangePassword: !!user.must_change_password,
  };
}

async function register(req, res) {
  const { username, email, password, full_name } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Username, email, and password are required' });
  }

  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  const password_hash = await bcrypt.hash(password, 10);

  try {
    const stmt = db.prepare(`
      INSERT INTO users (username, email, password_hash, role, full_name, must_change_password)
      VALUES (?, ?, ?, 'student', ?, 0)
    `);
    const result = stmt.run(username.trim(), email.trim().toLowerCase(), password_hash, full_name?.trim() || null);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(issueAuthResponse(user));
  } catch (err) {
    if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ message: 'Username or email already exists' });
    }
    res.status(500).json({ message: 'Error creating account', error: err.message });
  }
}

async function login(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ message: 'Invalid credentials' });

  res.json(issueAuthResponse(user));
}

module.exports = { login, register };