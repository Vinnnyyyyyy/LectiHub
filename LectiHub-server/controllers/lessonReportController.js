const db = require('../config/db');
const {
  ATTENDANCE_STATUSES,
  mapLessonReport,
  normalizeAttendanceStatus,
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

function hydrateReport(row) {
  return mapLessonReport(
    row,
    row.teacher_id ? getUserSummary(row.teacher_id) : null,
    row.student_id ? getUserSummary(row.student_id) : null,
    {
      title: row.class_title,
      subject: row.class_subject,
    },
  );
}

function getReportByClassId(classId) {
  return db
    .prepare(
      `SELECT
         lr.*,
         c.title AS class_title,
         c.subject AS class_subject
       FROM lesson_reports lr
       JOIN classes c ON c.id = lr.class_id
       WHERE lr.class_id = ?`,
    )
    .get(classId);
}

function getReportById(reportId) {
  return db
    .prepare(
      `SELECT
         lr.*,
         c.title AS class_title,
         c.subject AS class_subject
       FROM lesson_reports lr
       JOIN classes c ON c.id = lr.class_id
       WHERE lr.id = ?`,
    )
    .get(reportId);
}

function notifyUser(userId, type, title, message, options = {}) {
  const relatedRequestId = options.relatedRequestId ?? null;
  const relatedClassId = options.relatedClassId ?? null;
  const details =
    options.details != null ? JSON.stringify(options.details) : null;

  db.prepare(
    `INSERT INTO notifications (
       user_id, type, title, message, related_request_id, related_class_id, details
     )
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    userId,
    type,
    title,
    message,
    relatedRequestId,
    relatedClassId,
    details,
  );
}

function notifyReportSubmitted(report, classRow, teacherName) {
  const topic = report.lesson_topic;
  const details = {
    reportId: report.id,
    classId: report.class_id,
    lessonTopic: topic,
    reportDate: report.report_date,
    reportTime: report.report_time,
    attendanceStatus: report.attendance_status,
  };

  if (report.student_id) {
    notifyUser(
      report.student_id,
      'lesson_report',
      'New lesson report available',
      `${teacherName} submitted a lesson report for ${topic}.`,
      {
        relatedClassId: report.class_id,
        details,
      },
    );
  }

  const admins = db.prepare(`SELECT id FROM users WHERE role = 'admin'`).all();
  for (const admin of admins) {
    notifyUser(
      admin.id,
      'lesson_report',
      'Lesson report submitted',
      `${teacherName} submitted a lesson report for ${topic}.`,
      {
        relatedClassId: report.class_id,
        details,
      },
    );
  }
}

function parseReportBody(body = {}, classRow) {
  const errors = [];

  const reportDate = String(body.reportDate || classRow.class_date || '').trim();
  const reportTime = String(
    body.reportTime ||
      classRow.start_time ||
      String(classRow.time_slot || '').split('-')[0] ||
      '',
  ).trim();
  const lessonTopic = String(
    body.lessonTopic || classRow.curriculum_plan || classRow.subject || classRow.title || '',
  ).trim();
  const pagesDiscussed = String(body.pagesDiscussed || '').trim();
  const homeworkAssigned = String(body.homeworkAssigned || '').trim();
  const remarks = String(body.remarks || '').trim();
  const studentProgress = String(body.studentProgress || '').trim();

  const rawAttendance = String(
    body.attendanceStatus || classRow.attendance_status || '',
  )
    .toLowerCase()
    .trim();
  const attendanceStatus = normalizeAttendanceStatus(rawAttendance);

  if (!reportDate || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    errors.push('reportDate must be a valid date (YYYY-MM-DD).');
  }
  if (!reportTime || !/^\d{2}:\d{2}/.test(reportTime)) {
    errors.push('reportTime must be a valid time (HH:MM).');
  }
  if (!lessonTopic) {
    errors.push('lessonTopic is required.');
  }
  if (!rawAttendance || !ATTENDANCE_STATUSES.has(rawAttendance) || attendanceStatus === 'not_recorded') {
    errors.push('attendanceStatus must be present, late, absent, or excused.');
  }
  if (!studentProgress) {
    errors.push('studentProgress is required.');
  }

  return {
    errors,
    values: {
      report_date: reportDate,
      report_time: reportTime.slice(0, 5),
      lesson_topic: lessonTopic,
      pages_discussed: pagesDiscussed,
      attendance_status: attendanceStatus,
      homework_assigned: homeworkAssigned,
      remarks,
      student_progress: studentProgress,
    },
  };
}

function canAccessReport(req, reportRow) {
  if (req.user.role === 'admin') return true;
  if (req.user.role === 'teacher' && Number(reportRow.teacher_id) === Number(req.user.id)) {
    return true;
  }
  if (req.user.role === 'student' && Number(reportRow.student_id) === Number(req.user.id)) {
    return true;
  }
  return false;
}

async function listLessonReports(req, res) {
  try {
    let rows = [];

    if (req.user.role === 'admin') {
      rows = db
        .prepare(
          `SELECT
             lr.*,
             c.title AS class_title,
             c.subject AS class_subject
           FROM lesson_reports lr
           JOIN classes c ON c.id = lr.class_id
           ORDER BY lr.submitted_at DESC, lr.id DESC`,
        )
        .all();
    } else if (req.user.role === 'teacher') {
      rows = db
        .prepare(
          `SELECT
             lr.*,
             c.title AS class_title,
             c.subject AS class_subject
           FROM lesson_reports lr
           JOIN classes c ON c.id = lr.class_id
           WHERE lr.teacher_id = ?
           ORDER BY lr.submitted_at DESC, lr.id DESC`,
        )
        .all(req.user.id);
    } else if (req.user.role === 'student') {
      rows = db
        .prepare(
          `SELECT
             lr.*,
             c.title AS class_title,
             c.subject AS class_subject
           FROM lesson_reports lr
           JOIN classes c ON c.id = lr.class_id
           WHERE lr.student_id = ?
           ORDER BY lr.submitted_at DESC, lr.id DESC`,
        )
        .all(req.user.id);
    } else {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(rows.map(hydrateReport));
  } catch (err) {
    res.status(500).json({ message: 'Error loading lesson reports', error: err.message });
  }
}

async function getLessonReportForClass(req, res) {
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
      Number(classRow.teacher_id) === Number(req.user.id) ||
      Number(classRow.student_id) === Number(req.user.id);
    if (!isParticipant && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const report = getReportByClassId(classId);
    if (!report) {
      return res.status(404).json({ message: 'No lesson report submitted for this class yet.' });
    }

    res.json(hydrateReport(report));
  } catch (err) {
    res.status(500).json({ message: 'Error loading lesson report', error: err.message });
  }
}

async function submitLessonReport(req, res) {
  try {
    const classId = Number(req.params.id);
    if (!Number.isInteger(classId) || classId < 1) {
      return res.status(400).json({ message: 'A valid class id is required.' });
    }

    const classRow = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId);
    if (!classRow) {
      return res.status(404).json({ message: 'Class not found.' });
    }

    const isTeacher = Number(classRow.teacher_id) === Number(req.user.id);
    if (!isTeacher && req.user.role !== 'admin') {
      return res.status(403).json({
        message: 'Only the assigned teacher can submit a lesson report.',
      });
    }

    const status = normalizeClassStatus(classRow.status);
    if (status !== 'completed' && status !== 'in_progress') {
      return res.status(400).json({
        message: 'Lesson reports can be submitted after the class is in progress or completed.',
      });
    }

    if (!classRow.student_id) {
      return res.status(400).json({
        message: 'This class has no assigned student, so a report cannot be submitted.',
      });
    }

    const { values, errors } = parseReportBody(req.body || {}, classRow);
    if (errors.length) {
      return res.status(400).json({ message: errors[0], errors });
    }

    const existing = getReportByClassId(classId);
    const teacher = getUserSummary(classRow.teacher_id);
    const teacherName = teacher?.full_name || teacher?.username || 'Teacher';

    let reportId;
    if (existing) {
      db.prepare(
        `UPDATE lesson_reports
         SET report_date = ?,
             report_time = ?,
             lesson_topic = ?,
             pages_discussed = ?,
             attendance_status = ?,
             homework_assigned = ?,
             remarks = ?,
             student_progress = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE class_id = ?`,
      ).run(
        values.report_date,
        values.report_time,
        values.lesson_topic,
        values.pages_discussed,
        values.attendance_status,
        values.homework_assigned,
        values.remarks,
        values.student_progress,
        classId,
      );
      reportId = existing.id;
    } else {
      const result = db
        .prepare(
          `INSERT INTO lesson_reports (
             class_id, teacher_id, student_id,
             report_date, report_time, lesson_topic, pages_discussed,
             attendance_status, homework_assigned, remarks, student_progress
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          classId,
          classRow.teacher_id,
          classRow.student_id,
          values.report_date,
          values.report_time,
          values.lesson_topic,
          values.pages_discussed,
          values.attendance_status,
          values.homework_assigned,
          values.remarks,
          values.student_progress,
        );
      reportId = result.lastInsertRowid;
    }

    // Keep class attendance in sync with the formal report.
    const wasInProgress = normalizeClassStatus(classRow.status) === 'in_progress';
    db.prepare(
      `UPDATE classes
       SET attendance_status = ?,
           attendance_recorded_at = COALESCE(attendance_recorded_at, CURRENT_TIMESTAMP),
           status = ?,
           completed_at = CASE
             WHEN ? = 1 THEN COALESCE(completed_at, CURRENT_TIMESTAMP)
             ELSE completed_at
           END
       WHERE id = ?`,
    ).run(
      values.attendance_status,
      wasInProgress ? 'completed' : classRow.status,
      wasInProgress ? 1 : 0,
      classId,
    );

    const saved = getReportById(reportId);
    if (!existing) {
      notifyReportSubmitted(saved, classRow, teacherName);
    }

    return res.status(existing ? 200 : 201).json({
      message: existing
        ? 'Lesson report updated successfully.'
        : 'Lesson report submitted. It is now available to the administrator and student.',
      report: hydrateReport(saved),
    });
  } catch (err) {
    console.error('Submit lesson report error:', err);
    return res
      .status(500)
      .json({ message: 'Unable to submit lesson report right now.', error: err.message });
  }
}

async function getLessonReportById(req, res) {
  try {
    const reportId = Number(req.params.reportId);
    if (!Number.isInteger(reportId) || reportId < 1) {
      return res.status(400).json({ message: 'A valid report id is required.' });
    }

    const report = getReportById(reportId);
    if (!report) {
      return res.status(404).json({ message: 'Lesson report not found.' });
    }
    if (!canAccessReport(req, report)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(hydrateReport(report));
  } catch (err) {
    res.status(500).json({ message: 'Error loading lesson report', error: err.message });
  }
}

module.exports = {
  listLessonReports,
  getLessonReportForClass,
  submitLessonReport,
  getLessonReportById,
  getReportByClassId,
  hydrateReport,
};
