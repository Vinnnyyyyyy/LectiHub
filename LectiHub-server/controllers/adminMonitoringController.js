const db = require('../config/db');
const {
  labelFromSnake,
  mapClassRow,
  mapLessonReport,
  mapStudentFeedback,
  normalizeAttendanceStatus,
  normalizeClassStatus,
} = require('../utils/scheduleHelpers');

function getUserSummary(id) {
  if (!id) return null;
  return db
    .prepare(
      `SELECT id, username, full_name, email, subject_expertise, role
       FROM users
       WHERE id = ?`,
    )
    .get(id);
}

function countBy(sql, params = []) {
  return Number(db.prepare(sql).get(...params)?.count || 0);
}

function average(values) {
  if (!values.length) return null;
  const sum = values.reduce((total, value) => total + value, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

function buildSchedulingStats() {
  const pending = countBy(
    `SELECT COUNT(*) AS count FROM schedule_requests WHERE status = 'pending'`,
  );
  const approved = countBy(
    `SELECT COUNT(*) AS count FROM schedule_requests WHERE status = 'approved'`,
  );
  const rejected = countBy(
    `SELECT COUNT(*) AS count FROM schedule_requests WHERE status = 'rejected'`,
  );
  const total = pending + approved + rejected;

  const latencyRows = db
    .prepare(
      `SELECT created_at, assigned_at
       FROM schedule_requests
       WHERE status = 'approved'
         AND assigned_at IS NOT NULL
         AND created_at IS NOT NULL`,
    )
    .all();

  const latencyHours = latencyRows
    .map((row) => {
      const created = new Date(String(row.created_at).includes('T')
        ? row.created_at
        : `${String(row.created_at).replace(' ', 'T')}Z`);
      const assigned = new Date(String(row.assigned_at).includes('T')
        ? row.assigned_at
        : `${String(row.assigned_at).replace(' ', 'T')}Z`);
      if (Number.isNaN(created.getTime()) || Number.isNaN(assigned.getTime())) return null;
      return (assigned.getTime() - created.getTime()) / (1000 * 60 * 60);
    })
    .filter((value) => value != null && value >= 0);

  return {
    totalRequests: total,
    pending,
    approved,
    rejected,
    approvalRate: total ? Math.round((approved / total) * 100) : 0,
    averageApprovalHours: average(latencyHours),
  };
}

function buildAttendanceStats() {
  const rows = db
    .prepare(
      `SELECT attendance_status
       FROM classes
       WHERE attendance_status IS NOT NULL AND TRIM(attendance_status) != ''`,
    )
    .all();

  const counts = {
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
    not_recorded: 0,
  };

  for (const row of rows) {
    const status = normalizeAttendanceStatus(row.attendance_status);
    counts[status] = (counts[status] || 0) + 1;
  }

  const recorded = counts.present + counts.late + counts.absent + counts.excused;
  const total = recorded + counts.not_recorded;

  return {
    totalClasses: total,
    recorded,
    notRecorded: counts.not_recorded,
    present: counts.present,
    late: counts.late,
    absent: counts.absent,
    excused: counts.excused,
    recordedRate: total ? Math.round((recorded / total) * 100) : 0,
    presentRate: recorded ? Math.round((counts.present / recorded) * 100) : 0,
  };
}

function buildClassStats() {
  const rows = db.prepare('SELECT status FROM classes').all();
  const counts = {
    scheduled: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
  };

  for (const row of rows) {
    const status = normalizeClassStatus(row.status);
    counts[status] = (counts[status] || 0) + 1;
  }

  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return {
    total,
    scheduled: counts.scheduled,
    inProgress: counts.in_progress,
    completed: counts.completed,
    cancelled: counts.cancelled,
    completionRate: total ? Math.round((counts.completed / total) * 100) : 0,
  };
}

function buildTeacherPerformance() {
  const teachers = db
    .prepare(
      `SELECT id, username, full_name, email, subject_expertise
       FROM users
       WHERE role = 'teacher'
       ORDER BY full_name COLLATE NOCASE, username COLLATE NOCASE`,
    )
    .all();

  return teachers.map((teacher) => {
    const completedClasses = countBy(
      `SELECT COUNT(*) AS count FROM classes
       WHERE teacher_id = ? AND LOWER(COALESCE(status, '')) IN ('completed', 'confirmed')`,
      [teacher.id],
    );
    // confirmed normalizes to scheduled in helpers, but completed is what we want
    const completedExact = countBy(
      `SELECT COUNT(*) AS count FROM classes WHERE teacher_id = ? AND status = 'completed'`,
      [teacher.id],
    );
    const reportsSubmitted = countBy(
      `SELECT COUNT(*) AS count FROM lesson_reports WHERE teacher_id = ?`,
      [teacher.id],
    );
    const feedbackRows = db
      .prepare(
        `SELECT overall_rating FROM student_feedback WHERE teacher_id = ?`,
      )
      .all(teacher.id);
    const ratings = feedbackRows
      .map((row) => Number(row.overall_rating))
      .filter((value) => Number.isInteger(value));
    const attendanceRecorded = countBy(
      `SELECT COUNT(*) AS count FROM classes
       WHERE teacher_id = ?
         AND attendance_status IS NOT NULL
         AND LOWER(TRIM(attendance_status)) NOT IN ('', 'not_recorded')`,
      [teacher.id],
    );

    return {
      id: teacher.id,
      username: teacher.username,
      fullName: teacher.full_name || teacher.username,
      email: teacher.email || '',
      subjectExpertise: teacher.subject_expertise || '',
      completedClasses: completedExact || completedClasses,
      reportsSubmitted,
      feedbackCount: ratings.length,
      averageRating: average(ratings),
      attendanceRecorded,
    };
  });
}

function recentCompletedClasses(limit = 8) {
  const rows = db
    .prepare(
      `SELECT *
       FROM classes
       WHERE status = 'completed'
       ORDER BY COALESCE(completed_at, class_date) DESC, id DESC
       LIMIT ?`,
    )
    .all(limit);

  return rows.map((row) =>
    mapClassRow(row, getUserSummary(row.teacher_id), getUserSummary(row.student_id)),
  );
}

function recentLessonReports(limit = 8) {
  const rows = db
    .prepare(
      `SELECT
         lr.*,
         c.title AS class_title,
         c.subject AS class_subject
       FROM lesson_reports lr
       JOIN classes c ON c.id = lr.class_id
       ORDER BY lr.submitted_at DESC, lr.id DESC
       LIMIT ?`,
    )
    .all(limit);

  return rows.map((row) => {
    const feedback = db
      .prepare('SELECT id FROM student_feedback WHERE lesson_report_id = ?')
      .get(row.id);
    return mapLessonReport(
      row,
      getUserSummary(row.teacher_id),
      getUserSummary(row.student_id),
      { title: row.class_title, subject: row.class_subject },
      { hasFeedback: Boolean(feedback), feedbackId: feedback?.id || null },
    );
  });
}

function recentStudentFeedback(limit = 8) {
  const rows = db
    .prepare(
      `SELECT
         sf.*,
         lr.lesson_topic,
         lr.report_date,
         c.title AS class_title,
         c.subject AS class_subject
       FROM student_feedback sf
       JOIN lesson_reports lr ON lr.id = sf.lesson_report_id
       JOIN classes c ON c.id = sf.class_id
       ORDER BY sf.submitted_at DESC, sf.id DESC
       LIMIT ?`,
    )
    .all(limit);

  return rows.map((row) =>
    mapStudentFeedback(
      row,
      getUserSummary(row.teacher_id),
      getUserSummary(row.student_id),
      { lesson_topic: row.lesson_topic, report_date: row.report_date },
    ),
  );
}

function buildAttendanceRecords(limit = 12) {
  const rows = db
    .prepare(
      `SELECT *
       FROM classes
       WHERE attendance_status IS NOT NULL
         AND LOWER(TRIM(attendance_status)) NOT IN ('', 'not_recorded')
       ORDER BY COALESCE(attendance_recorded_at, completed_at, class_date) DESC, id DESC
       LIMIT ?`,
    )
    .all(limit);

  return rows.map((row) => {
    const mapped = mapClassRow(
      row,
      getUserSummary(row.teacher_id),
      getUserSummary(row.student_id),
    );
    return {
      id: mapped.id,
      classDate: mapped.classDate,
      title: mapped.title,
      subject: mapped.subject,
      attendanceStatus: mapped.attendanceStatus,
      attendanceStatusLabel:
        mapped.attendanceStatusLabel || labelFromSnake(mapped.attendanceStatus),
      teacher: mapped.teacher,
      student: mapped.student,
      status: mapped.status,
    };
  });
}

async function getMonitoringOverview(req, res) {
  try {
    const classStats = buildClassStats();
    const scheduling = buildSchedulingStats();
    const attendance = buildAttendanceStats();
    const teacherPerformance = buildTeacherPerformance();

    const reportCount = countBy('SELECT COUNT(*) AS count FROM lesson_reports');
    const feedbackCount = countBy('SELECT COUNT(*) AS count FROM student_feedback');
    const feedbackRatings = db
      .prepare('SELECT overall_rating FROM student_feedback')
      .all()
      .map((row) => Number(row.overall_rating))
      .filter((value) => Number.isInteger(value));

    const studentsWithProgress = countBy(
      `SELECT COUNT(*) AS count FROM lesson_reports
       WHERE student_progress IS NOT NULL AND TRIM(student_progress) != ''`,
    );

    const summary = {
      completedClasses: classStats.completed,
      inProgressClasses: classStats.inProgress,
      scheduledClasses: classStats.scheduled,
      lessonReports: reportCount,
      studentFeedback: feedbackCount,
      averageFeedbackRating: average(feedbackRatings),
      attendanceRecorded: attendance.recorded,
      attendancePresentRate: attendance.presentRate,
      pendingScheduleRequests: scheduling.pending,
      approvedScheduleRequests: scheduling.approved,
      studentsWithProgressNotes: studentsWithProgress,
      activeTeachers: teacherPerformance.length,
    };

    res.json({
      generatedAt: new Date().toISOString(),
      summary,
      classStats,
      scheduling,
      attendance,
      teacherPerformance,
      recentCompletedClasses: recentCompletedClasses(),
      recentLessonReports: recentLessonReports(),
      recentStudentFeedback: recentStudentFeedback(),
      attendanceRecords: buildAttendanceRecords(),
    });
  } catch (err) {
    console.error('Admin monitoring error:', err);
    res.status(500).json({
      message: 'Unable to load administrative monitoring data.',
      error: err.message,
    });
  }
}

module.exports = {
  getMonitoringOverview,
};
