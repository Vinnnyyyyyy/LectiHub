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
    {
      username: 'teacher_ava',
      email: 'ava@lectihub.com',
      full_name: 'Ava Chen',
      subject_expertise: 'Math',
    },
    {
      username: 'teacher_ben',
      email: 'ben@lectihub.com',
      full_name: 'Ben Ortiz',
      subject_expertise: 'Writing',
    },
    {
      username: 'teacher_cara',
      email: 'cara@lectihub.com',
      full_name: 'Cara Nguyen',
      subject_expertise: 'Science',
    },
  ];

  const insertTeacher = db.prepare(`
    INSERT OR IGNORE INTO users (username, email, password_hash, role, full_name, must_change_password, created_by, subject_expertise)
    VALUES (?, ?, ?, 'teacher', ?, 0, ?, ?)
  `);

  const updateExpertise = db.prepare(`
    UPDATE users SET subject_expertise = ? WHERE username = ?
  `);

  for (const teacher of teachers) {
    insertTeacher.run(
      teacher.username,
      teacher.email,
      password_hash,
      teacher.full_name,
      createdBy,
      teacher.subject_expertise,
    );
    updateExpertise.run(teacher.subject_expertise, teacher.username);
  }

  const ava = db.prepare(`SELECT id FROM users WHERE username = 'teacher_ava'`).get();
  const ben = db.prepare(`SELECT id FROM users WHERE username = 'teacher_ben'`).get();
  const cara = db.prepare(`SELECT id FROM users WHERE username = 'teacher_cara'`).get();

  for (const teacher of [ava, ben, cara]) {
    if (teacher) db.prepare(`DELETE FROM classes WHERE teacher_id = ?`).run(teacher.id);
  }

  const insertClass = db.prepare(`
    INSERT INTO classes (teacher_id, class_date, time_slot, title)
    VALUES (?, ?, ?, ?)
  `);

  // Ava: one conflict + higher workload
  if (ava) {
    insertClass.run(ava.id, '2026-07-25', '10:00-11:00', 'Existing math class');
    insertClass.run(ava.id, '2026-07-27', '09:00-10:00', 'Math tutoring');
    insertClass.run(ava.id, '2026-07-28', '11:00-12:00', 'Algebra review');
  }
  // Ben: one conflict, medium workload
  if (ben) {
    insertClass.run(ben.id, '2026-07-26', '14:00-15:00', 'Existing writing class');
    insertClass.run(ben.id, '2026-07-29', '13:00-14:00', 'Essay coaching');
  }
  // Cara: fully free in demo (lowest workload)

  console.log('Demo teachers ready (password: teacher123):');
  console.log('- teacher_ava / Ava Chen · Math (busy 2026-07-25 10:00-11:00, higher workload)');
  console.log('- teacher_ben / Ben Ortiz · Writing (busy 2026-07-26 14:00-15:00)');
  console.log('- teacher_cara / Cara Nguyen · Science (fully free, lowest workload)');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
