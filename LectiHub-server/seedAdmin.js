const bcrypt = require('bcrypt');
const db = require('./config/db');

async function seed() {
  const existing = db
    .prepare(
      `SELECT id, username, email FROM users
       WHERE username = ? OR email = ?
       LIMIT 1`,
    )
    .get('admin', 'admin@lectihub.com');

  if (existing) {
    console.log('Admin already exists — nothing to do.');
    console.log('Login with username: admin / password: admin123');
    return;
  }

  const password_hash = await bcrypt.hash('admin123', 10); // change this password later!
  db.prepare(
    `
    INSERT INTO users (username, email, password_hash, role, full_name, must_change_password)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  ).run('admin', 'admin@lectihub.com', password_hash, 'admin', 'System Admin', 0);

  console.log('Admin created');
  console.log('Login with username: admin / password: admin123');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
