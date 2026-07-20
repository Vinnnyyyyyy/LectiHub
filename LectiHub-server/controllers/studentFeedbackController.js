const db = require('../config/db');
const { mapStudentFeedback } = require('../utils/scheduleHelpers');

function getUserSummary(id) {
  return db
    .prepare(
      `SELECT id, username, full_name, email, subject_expertise, role
       FROM users
       WHERE id = ?`,
    )
    .get(id);
}

function hydrateFeedback(row) {
  return mapStudentFeedback(
    row,
    row.teacher_id ? getUserSummary(row.teacher_id) : null,
    row.student_id ? getUserSummary(row.student_id) : null,
    {
      lesson_topic: row.lesson_topic,
      report_date: row.report_date,
    },
  );
}

function getFeedbackById(feedbackId) {
  return db
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
       WHERE sf.id = ?`,
    )
    .get(feedbackId);
}

function getFeedbackByReportId(reportId) {
  return db
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
       WHERE sf.lesson_report_id = ?`,
    )
    .get(reportId);
}

function notifyUser(userId, type, title, message, options = {}) {
  const relatedClassId = options.relatedClassId ?? null;
  const details =
    options.details != null ? JSON.stringify(options.details) : null;

  db.prepare(
    `INSERT INTO notifications (
       user_id, type, title, message, related_class_id, details
     )
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(userId, type, title, message, relatedClassId, details);
}

function notifyAdminsAboutFeedback(feedback, studentName, lessonTopic) {
  const admins = db.prepare(`SELECT id FROM users WHERE role = 'admin'`).all();
  const details = {
    feedbackId: feedback.id,
    lessonReportId: feedback.lesson_report_id,
    classId: feedback.class_id,
    overallRating: feedback.overall_rating,
    lessonTopic,
  };

  for (const admin of admins) {
    notifyUser(
      admin.id,
      'student_feedback',
      'Student feedback submitted',
      `${studentName} submitted feedback for ${lessonTopic} (rating ${feedback.overall_rating}/5).`,
      {
        relatedClassId: feedback.class_id,
        details,
      },
    );
  }
}

function parseFeedbackBody(body = {}) {
  const errors = [];
  const overallRating = Number(body.overallRating);
  const comments = String(body.comments || '').trim();
  const suggestions = String(body.suggestions || '').trim();
  const learningExperience = String(body.learningExperience || '').trim();

  if (!Number.isInteger(overallRating) || overallRating < 1 || overallRating > 5) {
    errors.push('overallRating must be an integer from 1 to 5.');
  }
  if (!comments) {
    errors.push('comments are required.');
  }
  if (!learningExperience) {
    errors.push('learningExperience is required.');
  }

  return {
    errors,
    values: {
      overall_rating: overallRating,
      comments,
      suggestions,
      learning_experience: learningExperience,
    },
  };
}

async function listStudentFeedback(req, res) {
  try {
    let rows = [];

    if (req.user.role === 'admin') {
      rows = db
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
           ORDER BY sf.submitted_at DESC, sf.id DESC`,
        )
        .all();
    } else if (req.user.role === 'student') {
      rows = db
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
           WHERE sf.student_id = ?
           ORDER BY sf.submitted_at DESC, sf.id DESC`,
        )
        .all(req.user.id);
    } else if (req.user.role === 'teacher') {
      rows = db
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
           WHERE sf.teacher_id = ?
           ORDER BY sf.submitted_at DESC, sf.id DESC`,
        )
        .all(req.user.id);
    } else {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(rows.map(hydrateFeedback));
  } catch (err) {
    res.status(500).json({ message: 'Error loading student feedback', error: err.message });
  }
}

async function submitFeedbackForReport(req, res) {
  try {
    const reportId = Number(req.params.reportId);
    if (!Number.isInteger(reportId) || reportId < 1) {
      return res.status(400).json({ message: 'A valid lesson report id is required.' });
    }

    const report = db
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

    if (!report) {
      return res.status(404).json({ message: 'Lesson report not found.' });
    }

    if (req.user.role !== 'student' || Number(report.student_id) !== Number(req.user.id)) {
      return res.status(403).json({
        message: 'Only the assigned student can submit feedback for this lesson report.',
      });
    }

    const existing = getFeedbackByReportId(reportId);
    if (existing) {
      return res.status(409).json({
        message: 'Feedback has already been submitted for this lesson report.',
        feedback: hydrateFeedback(existing),
      });
    }

    const { values, errors } = parseFeedbackBody(req.body || {});
    if (errors.length) {
      return res.status(400).json({ message: errors[0], errors });
    }

    const result = db
      .prepare(
        `INSERT INTO student_feedback (
           lesson_report_id, class_id, student_id, teacher_id,
           overall_rating, comments, suggestions, learning_experience
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        report.id,
        report.class_id,
        report.student_id,
        report.teacher_id,
        values.overall_rating,
        values.comments,
        values.suggestions,
        values.learning_experience,
      );

    const saved = getFeedbackById(result.lastInsertRowid);
    const student = getUserSummary(report.student_id);
    const studentName = student?.full_name || student?.username || 'Student';
    notifyAdminsAboutFeedback(saved, studentName, report.lesson_topic);

    return res.status(201).json({
      message: 'Feedback submitted. Thank you — administrators can now review it.',
      feedback: hydrateFeedback(saved),
    });
  } catch (err) {
    console.error('Submit student feedback error:', err);
    return res
      .status(500)
      .json({ message: 'Unable to submit feedback right now.', error: err.message });
  }
}

async function getFeedbackForReport(req, res) {
  try {
    const reportId = Number(req.params.reportId);
    if (!Number.isInteger(reportId) || reportId < 1) {
      return res.status(400).json({ message: 'A valid lesson report id is required.' });
    }

    const report = db.prepare('SELECT * FROM lesson_reports WHERE id = ?').get(reportId);
    if (!report) {
      return res.status(404).json({ message: 'Lesson report not found.' });
    }

    const canAccess =
      req.user.role === 'admin' ||
      Number(report.student_id) === Number(req.user.id) ||
      Number(report.teacher_id) === Number(req.user.id);
    if (!canAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const feedback = getFeedbackByReportId(reportId);
    if (!feedback) {
      return res.status(404).json({ message: 'No feedback submitted for this lesson report yet.' });
    }

    res.json(hydrateFeedback(feedback));
  } catch (err) {
    res.status(500).json({ message: 'Error loading feedback', error: err.message });
  }
}

module.exports = {
  listStudentFeedback,
  submitFeedbackForReport,
  getFeedbackForReport,
};
