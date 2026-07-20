/**
 * Finalize a class when both the lesson report and student feedback exist.
 * Sets status to completed and archives the class for learning/teaching history.
 */
function finalizeClassIfReady(db, classId) {
  const report = db
    .prepare('SELECT id FROM lesson_reports WHERE class_id = ?')
    .get(classId);

  if (!report) {
    return {
      ready: false,
      finalized: false,
      reason: 'missing_report',
      hasLessonReport: false,
      hasStudentFeedback: false,
    };
  }

  const feedback = db
    .prepare('SELECT id FROM student_feedback WHERE lesson_report_id = ?')
    .get(report.id);

  if (!feedback) {
    return {
      ready: false,
      finalized: false,
      reason: 'missing_feedback',
      hasLessonReport: true,
      hasStudentFeedback: false,
      lessonReportId: report.id,
    };
  }

  const classRow = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId);
  if (!classRow) {
    return {
      ready: true,
      finalized: false,
      reason: 'class_not_found',
      hasLessonReport: true,
      hasStudentFeedback: true,
      lessonReportId: report.id,
      feedbackId: feedback.id,
    };
  }

  const alreadyArchived = Boolean(classRow.archived_at);
  const nowIso = new Date().toISOString();

  db.prepare(
    `UPDATE classes
     SET status = 'completed',
         completed_at = COALESCE(completed_at, ?),
         archived_at = COALESCE(archived_at, ?)
     WHERE id = ?`,
  ).run(nowIso, nowIso, classId);

  const updated = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId);

  return {
    ready: true,
    finalized: true,
    newlyArchived: !alreadyArchived,
    hasLessonReport: true,
    hasStudentFeedback: true,
    lessonReportId: report.id,
    feedbackId: feedback.id,
    classRow: updated,
  };
}

module.exports = {
  finalizeClassIfReady,
};
