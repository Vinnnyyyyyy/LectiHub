const db = require('../config/db');
const { mapClassRow } = require('../utils/scheduleHelpers');

function getUserSummary(id) {
  return db
    .prepare(
      `SELECT id, username, full_name, email, subject_expertise, role
       FROM users
       WHERE id = ?`,
    )
    .get(id);
}

function hydrateClass(row) {
  return mapClassRow(
    row,
    row.teacher_id ? getUserSummary(row.teacher_id) : null,
    row.student_id ? getUserSummary(row.student_id) : null,
  );
}

async function listMyClasses(req, res) {
  try {
    let rows = [];

    if (req.user.role === 'student') {
      rows = db
        .prepare(
          `SELECT *
           FROM classes
           WHERE student_id = ?
           ORDER BY class_date ASC, time_slot ASC`,
        )
        .all(req.user.id);
    } else if (req.user.role === 'teacher') {
      rows = db
        .prepare(
          `SELECT *
           FROM classes
           WHERE teacher_id = ?
           ORDER BY class_date ASC, time_slot ASC`,
        )
        .all(req.user.id);
    } else if (req.user.role === 'admin') {
      rows = db
        .prepare(
          `SELECT *
           FROM classes
           ORDER BY class_date ASC, time_slot ASC`,
        )
        .all();
    } else {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Only return confirmed schedules that belong to approved assignments when possible,
    // but include all class rows for the role (demo seed classes may have no student).
    const schedules = rows
      .filter((row) => (row.status || 'confirmed') === 'confirmed')
      .map(hydrateClass);

    res.json(schedules);
  } catch (err) {
    res.status(500).json({ message: 'Error loading schedules', error: err.message });
  }
}

async function getClassByRequest(req, res) {
  try {
    const requestId = Number(req.params.requestId);
    if (!Number.isInteger(requestId) || requestId < 1) {
      return res.status(400).json({ message: 'Invalid request id' });
    }

    const row = db
      .prepare(
        `SELECT *
         FROM classes
         WHERE schedule_request_id = ?
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get(requestId);

    if (!row) {
      return res.status(404).json({ message: 'No confirmed schedule for this request' });
    }

    if (req.user.role === 'student' && row.student_id !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (req.user.role === 'teacher' && row.teacher_id !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(hydrateClass(row));
  } catch (err) {
    res.status(500).json({ message: 'Error loading schedule', error: err.message });
  }
}

module.exports = {
  listMyClasses,
  getClassByRequest,
  hydrateClass,
};
