const bcrypt = require('bcrypt');
const db = require('../config/db');

function mapUser(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email || '',
    fullName: row.full_name || row.username,
    role: row.role,
    createdAt: row.created_at,
    subjectExpertise: row.subject_expertise || '',
    // Directory roll-ups; present on list responses, absent elsewhere.
    weeklyMinutes: row.weekly_minutes != null ? Number(row.weekly_minutes) : null,
    studentCount: row.student_count != null ? Number(row.student_count) : null,
    calendarProvider: row.calendar_provider || null,
  };
}

async function createUser(req, res) {
  const { username, email, password, full_name, subject_expertise } = req.body;
  // Admins may only create teacher accounts (students self-register).
  const role = 'teacher';

  if (!username || !password) {
    return res.status(400).json({ message: 'username and password are required.' });
  }

  if (req.body?.role && String(req.body.role).toLowerCase() !== 'teacher') {
    return res.status(400).json({
      message: 'Admins can only create teacher accounts. Students register themselves.',
    });
  }

  const password_hash = await bcrypt.hash(password, 10);

  try {
    const stmt = db.prepare(`
      INSERT INTO users (username, email, password_hash, role, full_name, created_by, subject_expertise, must_change_password)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `);
    stmt.run(
      username,
      email || null,
      password_hash,
      role,
      full_name || username,
      req.user.id,
      subject_expertise || null,
    );

    res.status(201).json({
      message: 'Teacher account created',
      username,
      role,
      tempPassword: password,
    });
  } catch (err) {
    res.status(500).json({ message: 'Error creating teacher', error: err.message });
  }
}

// Monday of the current week / the Monday after, in SQLite date() arithmetic.
// strftime('%w') is 0=Sunday, so (%w + 6) % 7 is days elapsed since Monday.
const WEEK_START = `date('now', '-' || ((strftime('%w','now') + 6) % 7) || ' days')`;
const WEEK_END = `date('now', '-' || ((strftime('%w','now') + 6) % 7) || ' days', '+7 days')`;

// Directory roll-ups for the admin People table. Teacher-oriented: the
// subqueries key off classes.teacher_id, so they read 0 / NULL for students.
const USER_LIST_COLUMNS = `
  u.id, u.username, u.email, u.full_name, u.role, u.created_at, u.subject_expertise,
  (SELECT COALESCE(SUM(COALESCE(c.duration_minutes, 30)), 0)
     FROM classes c
    WHERE c.teacher_id = u.id
      AND c.class_date >= ${WEEK_START}
      AND c.class_date < ${WEEK_END}
  ) AS weekly_minutes,
  (SELECT COUNT(DISTINCT c.student_id)
     FROM classes c
    WHERE c.teacher_id = u.id AND c.student_id IS NOT NULL
  ) AS student_count,
  (SELECT cc.provider
     FROM calendar_connections cc
    WHERE cc.user_id = u.id AND cc.is_active = 1
    LIMIT 1
  ) AS calendar_provider
`;

async function listUsers(req, res) {
  try {
    const role = String(req.query.role || '').toLowerCase().trim();
    let rows;
    if (role && ['admin', 'teacher', 'student'].includes(role)) {
      rows = db
        .prepare(
          `SELECT ${USER_LIST_COLUMNS}
           FROM users u
           WHERE u.role = ?
           ORDER BY u.full_name ASC, u.username ASC`,
        )
        .all(role);
    } else {
      rows = db
        .prepare(
          `SELECT ${USER_LIST_COLUMNS}
           FROM users u
           ORDER BY
             CASE u.role
               WHEN 'admin' THEN 0
               WHEN 'teacher' THEN 1
               ELSE 2
             END,
             u.full_name ASC,
             u.username ASC`,
        )
        .all();
    }
    return res.json({ users: rows.map(mapUser) });
  } catch (err) {
    console.error('List users error:', err);
    return res.status(500).json({ message: 'Unable to list users.', error: err.message });
  }
}

async function deleteUser(req, res) {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId < 1) {
      return res.status(400).json({ message: 'Invalid user id.' });
    }

    if (Number(req.user.id) === userId) {
      return res.status(400).json({ message: 'You cannot delete your own account while logged in.' });
    }

    const target = db
      .prepare(`SELECT id, username, role, full_name FROM users WHERE id = ?`)
      .get(userId);
    if (!target) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (target.role === 'admin') {
      const adminCount = db
        .prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'admin'`)
        .get().count;
      if (adminCount <= 1) {
        return res.status(400).json({ message: 'Cannot delete the last admin account.' });
      }
    }

    const remove = db.transaction(() => {
      // Clear dependent rows that reference this user.
      db.prepare(`DELETE FROM notifications WHERE user_id = ?`).run(userId);
      db.prepare(`DELETE FROM calendar_events WHERE user_id = ?`).run(userId);
      db.prepare(`DELETE FROM calendar_connections WHERE user_id = ?`).run(userId);
      db.prepare(`DELETE FROM teacher_availability WHERE teacher_id = ?`).run(userId);

      db.prepare(`DELETE FROM student_feedback WHERE student_id = ? OR teacher_id = ?`).run(
        userId,
        userId,
      );
      db.prepare(`DELETE FROM lesson_reports WHERE student_id = ? OR teacher_id = ?`).run(
        userId,
        userId,
      );

      const classIds = db
        .prepare(`SELECT id FROM classes WHERE student_id = ? OR teacher_id = ?`)
        .all(userId, userId)
        .map((row) => row.id);
      for (const classId of classIds) {
        db.prepare(`DELETE FROM calendar_events WHERE class_id = ?`).run(classId);
        db.prepare(`DELETE FROM student_feedback WHERE class_id = ?`).run(classId);
        db.prepare(`DELETE FROM lesson_reports WHERE class_id = ?`).run(classId);
        db.prepare(`DELETE FROM notifications WHERE related_class_id = ?`).run(classId);
      }

      const conversationIds = db
        .prepare(
          `SELECT id FROM conversations
           WHERE student_id = ? OR teacher_id = ?`,
        )
        .all(userId, userId)
        .map((row) => row.id);
      for (const conversationId of conversationIds) {
        db.prepare(`DELETE FROM messages WHERE conversation_id = ?`).run(conversationId);
      }
      db.prepare(`DELETE FROM conversations WHERE student_id = ? OR teacher_id = ?`).run(
        userId,
        userId,
      );

      db.prepare(`DELETE FROM classes WHERE student_id = ? OR teacher_id = ?`).run(userId, userId);

      const requestIds = db
        .prepare(
          `SELECT id FROM schedule_requests
           WHERE student_id = ? OR assigned_teacher_id = ?`,
        )
        .all(userId, userId)
        .map((row) => row.id);
      for (const requestId of requestIds) {
        db.prepare(`DELETE FROM schedule_request_slots WHERE request_id = ?`).run(requestId);
        db.prepare(`DELETE FROM notifications WHERE related_request_id = ?`).run(requestId);
        db.prepare(`DELETE FROM schedule_requests WHERE id = ?`).run(requestId);
      }

      db.prepare(`UPDATE users SET created_by = NULL WHERE created_by = ?`).run(userId);
      db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
    });

    remove();

    return res.json({
      message: `Deleted ${target.full_name || target.username} (@${target.username}).`,
      deletedUserId: userId,
    });
  } catch (err) {
    console.error('Delete user error:', err);
    return res.status(500).json({
      message: 'Unable to delete this user right now.',
      error: err.message,
    });
  }
}

module.exports = { createUser, listUsers, deleteUser };
