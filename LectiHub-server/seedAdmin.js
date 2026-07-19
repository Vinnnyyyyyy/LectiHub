const bcrypt = require('bcrypt');
const db = require('./config/db');

async function seed() {
  const password_hash = await bcrypt.hash('admin123', 10); // change this password later!
  db.prepare(`
    INSERT INTO users (username, email, password_hash, role, full_name, must_change_password)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('admin', 'admin@lectihub.com', password_hash, 'admin', 'System Admin', 0);

  console.log('Admin created');
}

seed();