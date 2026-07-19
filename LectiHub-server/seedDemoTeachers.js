/**
 * Seeds demo teachers + sample classes so admin availability filtering is testable.
 * Run: node seedDemoTeachers.js
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('./config/db');

async function seed() {
  const password_hash = await bcrypt.hash('teacher123', 10);
  const admin = db.prepare(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`).get();
  const createdBy = admin?.id || null;

  const teachers = [
    { username: 'teacher_ava', email: 'ava@lectihub.com', full_name: 'Ava Chen' },
    { username: 'teacher_ben', email: 'ben@lectihub.com', full_name: 'Ben Ortiz' },
    { username: 'teacher_cara', email: 'cara@lectihub.com', full_name: 'Cara Nguyen' },
  ];

  const insertTeacher = db.prepare(`
    INSERT OR IGNORE INTO users (username, email, password_hash, role, full_name, must_change_password, created_by)
    VALUES (?, ?, ?, 'teacher', ?, 0, ?)
  `);

  for (const teacher of teachers) {
    insertTeacher.run(
      teacher.username,
      teacher.email,
      password_hash,
      teacher.full_name,
      createdBy,
    );
  }

  const ava = db.prepare(`SELECT id FROM users WHERE username = 'teacher_ava'`).get();
  const ben = db.prepare(`SELECT id FROM users WHERE username = 'teacher_ben'`).get();

  // Clear old demo classes for these teachers, then insert sample conflicts
  if (ava) db.prepare(`DELETE FROM classes WHERE teacher_id = ?`).run(ava.id);
  if (ben) db.prepare(`DELETE FROM classes WHERE teacher_id = ?`).run(ben.id);

  const insertClass = db.prepare(`
    INSERT INTO classes (teacher_id, class_date, time_slot, title)
    VALUES (?, ?, ?, ?)
  `);

  // Ava busy on a common morning slot; Ben busy on an afternoon slot
  if (ava) {
    insertClass.run(ava.id, '2026-07-25', '10:00-11:00', 'Existing math class');
  }
  if (ben) {
    insertClass.run(ben.id, '2026-07-26', '14:00-15:00', 'Existing writing class');
  }

  console.log('Demo teachers ready (password: teacher123):');
  console.log('- teacher_ava / Ava Chen (busy 2026-07-25 10:00-11:00)');
  console.log('- teacher_ben / Ben Ortiz (busy 2026-07-26 14:00-15:00)');
  console.log('- teacher_cara / Cara Nguyen (fully free in demo)');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
