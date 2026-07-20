const db = require('../config/db');
const {
  buildMeetingDetails,
  canJoin,
  getMeetingProvider,
  mapClassRow,
  normalizeClassStatus,
} = require('../utils/scheduleHelpers');

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

const VISIBLE_STATUSES = new Set(['scheduled', 'in_progress', 'completed']);

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

    // Include scheduled / in-progress / completed (legacy "confirmed" normalizes to scheduled).
    const schedules = rows
      .filter((row) => VISIBLE_STATUSES.has(normalizeClassStatus(row.status)))
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

async function joinClass(req, res) {
  try {
    const classId = Number(req.params.id);
    if (!Number.isInteger(classId) || classId < 1) {
      return res.status(400).json({ message: 'A valid class id is required.' });
    }

    const classRow = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId);
    if (!classRow) {
      return res.status(404).json({ message: 'Class not found.' });
    }

    const isParticipant =
      Number(classRow.student_id) === Number(req.user.id) ||
      Number(classRow.teacher_id) === Number(req.user.id);

    if (!isParticipant && req.user.role !== 'admin') {
      return res.status(403).json({
        message: 'Only the assigned student or teacher can join this class.',
      });
    }

    const status = normalizeClassStatus(classRow.status);
    if (status === 'cancelled' || status === 'completed') {
      return res.status(400).json({
        message: `This class is ${status.replace('_', ' ')} and cannot be joined.`,
        class: hydrateClass(classRow),
      });
    }

    if (!canJoin(classRow)) {
      return res.status(400).json({
        message:
          'This class is not available to join yet. Please try again closer to the scheduled start time.',
        class: hydrateClass(classRow),
      });
    }

    let meetingLink = String(classRow.meeting_link || '').trim();
    let meetingInfo = String(classRow.meeting_info || '').trim();
    let meetingProvider =
      String(classRow.meeting_provider || '').trim() || getMeetingProvider();

    if (!meetingLink) {
      const meeting = buildMeetingDetails(
        classRow.schedule_request_id || classId,
        classRow.class_date,
        classRow.start_time || String(classRow.time_slot || '').split('-')[0] || '09:00',
      );
      meetingLink = meeting.meetingLink;
      meetingInfo = meeting.meetingInfo;
      meetingProvider = meeting.meetingProvider;
    }

    const wasInProgress = status === 'in_progress';
    const nowIso = new Date().toISOString();

    db.prepare(
      `UPDATE classes
       SET meeting_link = ?,
           meeting_info = ?,
           meeting_provider = ?,
           status = 'in_progress',
           started_at = COALESCE(started_at, ?)
       WHERE id = ?`,
    ).run(meetingLink, meetingInfo, meetingProvider, nowIso, classId);

    const updated = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId);

    return res.json({
      message: wasInProgress
        ? 'Class is already in progress. Opening the meeting room.'
        : 'Class is now in progress. Opening the meeting room.',
      class: hydrateClass(updated),
      meeting: {
        provider: meetingProvider,
        link: meetingLink,
        info: meetingInfo,
      },
    });
  } catch (err) {
    console.error('Join class error:', err);
    return res.status(500).json({ message: 'Unable to join class right now.', error: err.message });
  }
}

module.exports = {
  listMyClasses,
  getClassByRequest,
  joinClass,
  hydrateClass,
};
