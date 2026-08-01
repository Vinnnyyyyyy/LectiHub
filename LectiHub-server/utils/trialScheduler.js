const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../config/db');

function slugUsername(email, name) {
  const local = String(email || '')
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 18);
  const fromName = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 12);
  const base = local || fromName || 'trial';
  return `trial_${base}`.slice(0, 28);
}

function uniqueUsername(base) {
  let candidate = base;
  let i = 0;
  while (db.prepare('SELECT id FROM users WHERE username = ?').get(candidate)) {
    i += 1;
    candidate = `${base.slice(0, 24)}_${i}`;
  }
  return candidate;
}

/**
 * Find an existing student by email, or create a provisional student account
 * so the free-trial lead can enter the E-Scheduler assign queue.
 */
async function findOrCreateTrialStudent(trial) {
  const email = trial.email.trim().toLowerCase();
  const existing = db
    .prepare(`SELECT * FROM users WHERE lower(email) = lower(?) LIMIT 1`)
    .get(email);

  if (existing) {
    if (existing.role !== 'student') {
      const err = new Error(
        'This email is already used by a LectiHub account that is not a student. Use a different email for the free trial.',
      );
      err.status = 409;
      throw err;
    }
    return { student: existing, created: false };
  }

  const password = crypto.randomBytes(18).toString('base64url');
  const passwordHash = await bcrypt.hash(password, 10);
  const username = uniqueUsername(slugUsername(email, trial.name));

  const result = db
    .prepare(
      `INSERT INTO users (username, email, password_hash, role, full_name, must_change_password)
       VALUES (?, ?, ?, 'student', ?, 1)`,
    )
    .run(username, email, passwordHash, trial.name);

  const student = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  return { student, created: true };
}

function notifyAdminsAboutTrial(requestId, trial) {
  const admins = db.prepare(`SELECT id FROM users WHERE role = 'admin'`).all();
  const title = 'New free trial booking';
  const message = `${trial.name} requested a free 30‑min trial (${trial.program}) on ${trial.preferredDate} ${trial.preferredSlot} via ${trial.videoPlatformLabel}.`;

  for (const admin of admins) {
    db.prepare(
      `INSERT INTO notifications (
         user_id, type, title, message, related_request_id, related_class_id, details, deliver_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      admin.id,
      'schedule_request',
      title,
      message,
      requestId,
      null,
      JSON.stringify({
        source: 'free_trial',
        studentName: trial.name,
        program: trial.program,
        preferredDate: trial.preferredDate,
        preferredSlot: trial.preferredSlot,
        videoPlatform: trial.videoPlatform,
        classCount: 1,
        requestIds: [requestId],
      }),
      null,
    );
  }
}

/**
 * Action 2 — push preferred date/slot + video platform into the E-Scheduler
 * as a pending schedule_request in the admin Review queue.
 */
async function createTrialScheduleRequest(trial) {
  const { student } = await findOrCreateTrialStudent(trial);

  const remarks = [
    'Free trial (30 minutes)',
    `Program: ${trial.program}`,
    `Company / Individual: ${trial.entityType === 'company' ? 'Company' : 'Individual'}`,
    `Preferred platform: ${trial.videoPlatformLabel}`,
  ].join(' · ');

  const insert = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO schedule_requests (
           student_id, remarks, status, source, program, entity_type,
           preferred_meeting_provider
         )
         VALUES (?, ?, 'pending', 'free_trial', ?, ?, ?)`,
      )
      .run(
        student.id,
        remarks,
        trial.program,
        trial.entityType,
        trial.videoPlatform,
      );

    const requestId = Number(result.lastInsertRowid);

    db.prepare(
      `INSERT INTO schedule_request_slots (request_id, preferred_date, time_slot)
       VALUES (?, ?, ?)`,
    ).run(requestId, trial.preferredDate, trial.preferredSlot);

    notifyAdminsAboutTrial(requestId, trial);
    return requestId;
  });

  const requestId = insert();
  return {
    requestId,
    studentId: student.id,
    studentUsername: student.username,
  };
}

module.exports = {
  createTrialScheduleRequest,
  findOrCreateTrialStudent,
};
