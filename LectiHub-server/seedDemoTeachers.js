/**
 * Seeds demo teachers + optional busy-block rows for availability/conflict testing.
 * Busy blocks are NOT student bookings and must not appear on teacher dashboards.
 * Run: node seedDemoTeachers.js
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('./config/db');

const DEMO_BUSY_TITLES = [
  'Existing math class',
  'Math tutoring',
  'Algebra review',
  'Existing writing class',
  'Essay coaching',
];

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

  // Remove only orphan demo busy-blocks (no student). Never wipe real bookings.
  const clearDemoBusy = db.prepare(`
    DELETE FROM classes
    WHERE teacher_id = ?
      AND student_id IS NULL
      AND title = ?
  `);
  for (const teacher of [ava, ben, cara]) {
    if (!teacher) continue;
    for (const title of DEMO_BUSY_TITLES) {
      clearDemoBusy.run(teacher.id, title);
    }
  }

  const insertBusyBlock = db.prepare(`
    INSERT INTO classes (teacher_id, student_id, class_date, time_slot, title, status)
    VALUES (?, NULL, ?, ?, ?, 'scheduled')
  `);

  // These rows only exist so admin conflict/availability demos have something to hit.
  // They intentionally have no student and are hidden from teacher Upcoming.
  if (ava) {
    insertBusyBlock.run(ava.id, '2026-07-25', '10:00-10:30', 'Existing math class');
    insertBusyBlock.run(ava.id, '2026-07-27', '09:00-09:30', 'Math tutoring');
    insertBusyBlock.run(ava.id, '2026-07-28', '11:00-11:30', 'Algebra review');
  }
  if (ben) {
    insertBusyBlock.run(ben.id, '2026-07-26', '14:00-14:30', 'Existing writing class');
    insertBusyBlock.run(ben.id, '2026-07-29', '13:00-13:30', 'Essay coaching');
  }
  // Cara: fully free in demo (lowest workload)

  const { ensureDefaultTeacherAvailability } = require('./utils/availabilityHelpers');
  ensureDefaultTeacherAvailability(db);

  console.log('Demo teachers ready (password: teacher123):');
  console.log('- teacher_ava / Ava Chen · Math (busy blocks for conflict demos only)');
  console.log('- teacher_ben / Ben Ortiz · Writing (busy blocks for conflict demos only)');
  console.log('- teacher_cara / Cara Nguyen · Science (fully free, lowest workload)');
  console.log('Note: busy blocks have no student and do not appear as Upcoming classes.');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
