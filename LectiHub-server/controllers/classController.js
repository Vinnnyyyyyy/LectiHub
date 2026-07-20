const db = require('../config/db');
const {
  ATTENDANCE_STATUSES,
  PARTICIPATION_LEVELS,
  buildMeetingDetails,
  canJoin,
  getMeetingProvider,
  isValidHttpUrl,
  mapClassRow,
  normalizeAttendanceStatus,
  normalizeClassStatus,
  normalizeParticipationLevel,
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

function getClassOrError(req, res) {
  const classId = Number(req.params.id);
  if (!Number.isInteger(classId) || classId < 1) {
    res.status(400).json({ message: 'A valid class id is required.' });
    return null;
  }

  const classRow = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId);
  if (!classRow) {
    res.status(404).json({ message: 'Class not found.' });
    return null;
  }

  return { classId, classRow };
}

function requireAssignedTeacher(req, res, classRow) {
  const isTeacher = Number(classRow.teacher_id) === Number(req.user.id);
  if (!isTeacher && req.user.role !== 'admin') {
    res.status(403).json({
      message: 'Only the assigned teacher can update lesson conduct details.',
    });
    return false;
  }
  return true;
}

function parseConductBody(body = {}) {
  const errors = [];
  const updates = {};

  if (Object.prototype.hasOwnProperty.call(body, 'curriculumPlan')) {
    updates.curriculum_plan = String(body.curriculumPlan || '').trim();
  }

  if (Object.prototype.hasOwnProperty.call(body, 'attendanceStatus')) {
    const raw = String(body.attendanceStatus || '').toLowerCase().trim() || 'not_recorded';
    if (!ATTENDANCE_STATUSES.has(raw)) {
      errors.push('attendanceStatus must be present, late, absent, excused, or not_recorded.');
    } else {
      updates.attendance_status = normalizeAttendanceStatus(raw);
      if (raw !== 'not_recorded') {
        updates.attendance_recorded_at = new Date().toISOString();
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'participationLevel')) {
    const raw = String(body.participationLevel || '').toLowerCase().trim() || 'not_recorded';
    if (!PARTICIPATION_LEVELS.has(raw)) {
      errors.push('participationLevel must be low, medium, high, or not_recorded.');
    } else {
      updates.participation_level = normalizeParticipationLevel(raw);
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'participationNotes')) {
    updates.participation_notes = String(body.participationNotes || '').trim();
  }

  if (Object.prototype.hasOwnProperty.call(body, 'recordingUrl')) {
    const recordingUrl = String(body.recordingUrl || '').trim();
    if (!isValidHttpUrl(recordingUrl)) {
      errors.push('recordingUrl must be a valid http(s) URL.');
    } else {
      updates.recording_url = recordingUrl;
    }
  }

  return { updates, errors };
}

function applyConductUpdates(classId, updates) {
  const columns = Object.keys(updates);
  if (!columns.length) return;

  const setters = columns.map((column) => `${column} = ?`).join(', ');
  const values = columns.map((column) => updates[column]);
  db.prepare(`UPDATE classes SET ${setters} WHERE id = ?`).run(...values, classId);
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
    const found = getClassOrError(req, res);
    if (!found) return;
    const { classId, classRow } = found;

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
    const isStudentJoining = Number(classRow.student_id) === Number(req.user.id);
    const currentAttendance = normalizeAttendanceStatus(classRow.attendance_status);
    const shouldMarkPresent =
      isStudentJoining && (currentAttendance === 'not_recorded' || currentAttendance === 'absent');

    db.prepare(
      `UPDATE classes
       SET meeting_link = ?,
           meeting_info = ?,
           meeting_provider = ?,
           status = 'in_progress',
           started_at = COALESCE(started_at, ?),
           attendance_status = CASE WHEN ? = 1 THEN 'present' ELSE attendance_status END,
           attendance_recorded_at = CASE
             WHEN ? = 1 THEN COALESCE(attendance_recorded_at, ?)
             ELSE attendance_recorded_at
           END
       WHERE id = ?`,
    ).run(
      meetingLink,
      meetingInfo,
      meetingProvider,
      nowIso,
      shouldMarkPresent ? 1 : 0,
      shouldMarkPresent ? 1 : 0,
      nowIso,
      classId,
    );

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

async function updateLessonConduct(req, res) {
  try {
    const found = getClassOrError(req, res);
    if (!found) return;
    const { classId, classRow } = found;

    if (!requireAssignedTeacher(req, res, classRow)) return;

    const status = normalizeClassStatus(classRow.status);
    if (status === 'cancelled') {
      return res.status(400).json({
        message: 'Cancelled classes cannot be updated.',
        class: hydrateClass(classRow),
      });
    }

    const { updates, errors } = parseConductBody(req.body || {});
    if (errors.length) {
      return res.status(400).json({ message: errors[0], errors });
    }
    if (!Object.keys(updates).length) {
      return res.status(400).json({
        message:
          'Provide at least one of curriculumPlan, attendanceStatus, participationLevel, participationNotes, or recordingUrl.',
      });
    }

    // Teachers typically conduct during/after class — allow scheduled so they can prep curriculum.
    applyConductUpdates(classId, updates);

    const updated = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId);
    return res.json({
      message: 'Lesson conduct details saved.',
      class: hydrateClass(updated),
    });
  } catch (err) {
    console.error('Update lesson conduct error:', err);
    return res
      .status(500)
      .json({ message: 'Unable to save lesson details right now.', error: err.message });
  }
}

async function completeClass(req, res) {
  try {
    const found = getClassOrError(req, res);
    if (!found) return;
    const { classId, classRow } = found;

    if (!requireAssignedTeacher(req, res, classRow)) return;

    const status = normalizeClassStatus(classRow.status);
    if (status === 'cancelled') {
      return res.status(400).json({
        message: 'Cancelled classes cannot be completed.',
        class: hydrateClass(classRow),
      });
    }
    if (status === 'completed') {
      return res.json({
        message: 'Class is already completed.',
        class: hydrateClass(classRow),
      });
    }
    if (status === 'scheduled') {
      return res.status(400).json({
        message: 'Start the class (join) before marking it completed.',
        class: hydrateClass(classRow),
      });
    }

    const { updates, errors } = parseConductBody(req.body || {});
    if (errors.length) {
      return res.status(400).json({ message: errors[0], errors });
    }

    const nowIso = new Date().toISOString();
    updates.status = 'completed';
    updates.completed_at = nowIso;

    // Default attendance to present when completing an in-progress lesson without an explicit mark.
    const nextAttendance =
      updates.attendance_status ||
      normalizeAttendanceStatus(classRow.attendance_status);
    if (nextAttendance === 'not_recorded') {
      updates.attendance_status = 'present';
      updates.attendance_recorded_at = nowIso;
    }

    applyConductUpdates(classId, updates);

    const updated = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId);
    return res.json({
      message: 'Lesson completed. Attendance and participation are saved.',
      class: hydrateClass(updated),
    });
  } catch (err) {
    console.error('Complete class error:', err);
    return res
      .status(500)
      .json({ message: 'Unable to complete the lesson right now.', error: err.message });
  }
}

module.exports = {
  listMyClasses,
  getClassByRequest,
  joinClass,
  updateLessonConduct,
  completeClass,
  hydrateClass,
};
