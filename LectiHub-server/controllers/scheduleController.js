const db = require('../config/db');
const {
  parseTimeSlot,
  buildMeetingDetails,
  mapClassRow,
} = require('../utils/scheduleHelpers');
const { sendScheduleConfirmationEmails } = require('../utils/emailService');
const { syncClassToCalendars, teacherHasCalendarConflict } = require('../utils/calendarService');
const { hydrateClass } = require('./classController');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_SLOT_RE = /^\d{2}:\d{2}-\d{2}:\d{2}$/;
const SUBJECTS = ['math', 'writing', 'science', 'english', 'history'];

function getConfirmedScheduleForRequest(requestId) {
  const row = db
    .prepare(
      `SELECT *
       FROM classes
       WHERE schedule_request_id = ?
       ORDER BY id DESC
       LIMIT 1`,
    )
    .get(requestId);
  return row ? hydrateClass(row) : null;
}

function mapTeacher(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name || row.username,
    email: row.email || '',
    subjectExpertise: row.subject_expertise || '',
  };
}

function mapRequest(row, slots, student = null, assignedTeacher = null) {
  const assignedSlot = row.assigned_slot_id
    ? slots.find((slot) => slot.id === row.assigned_slot_id)
    : null;

  return {
    id: row.id,
    studentId: row.student_id,
    student: student
      ? {
          id: student.id,
          username: student.username,
          fullName: student.full_name || student.username,
          email: student.email || '',
        }
      : undefined,
    remarks: row.remarks || '',
    status: row.status,
    createdAt: row.created_at,
    assignedTeacherId: row.assigned_teacher_id || null,
    assignedTeacher: assignedTeacher ? mapTeacher(assignedTeacher) : null,
    assignedSlotId: row.assigned_slot_id || null,
    assignedSlot: assignedSlot
      ? {
          id: assignedSlot.id,
          preferredDate: assignedSlot.preferred_date,
          timeSlot: assignedSlot.time_slot,
        }
      : null,
    assignedAt: row.assigned_at || null,
    slots: slots.map((slot) => ({
      id: slot.id,
      preferredDate: slot.preferred_date,
      timeSlot: slot.time_slot,
    })),
  };
}

function getSlotsForRequest(requestId) {
  return db
    .prepare(
      `SELECT id, preferred_date, time_slot
       FROM schedule_request_slots
       WHERE request_id = ?
       ORDER BY preferred_date ASC, time_slot ASC`,
    )
    .all(requestId);
}

function getStudent(studentId) {
  return db
    .prepare('SELECT id, username, full_name, email FROM users WHERE id = ?')
    .get(studentId);
}

function getTeacherById(teacherId) {
  return db
    .prepare(
      `SELECT id, username, full_name, email, subject_expertise
       FROM users
       WHERE id = ? AND role = 'teacher'`,
    )
    .get(teacherId);
}

function notifyAdminsAboutRequest(requestId, studentName) {
  const admins = db.prepare(`SELECT id FROM users WHERE role = 'admin'`).all();
  const title = 'New scheduling request';
  const message = `${studentName} submitted a preferred schedule awaiting review.`;

  for (const admin of admins) {
    notifyUser(admin.id, 'schedule_request', title, message, {
      relatedRequestId: requestId,
      details: { studentName },
    });
  }
}

function toSqliteDateTime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function notifyUser(userId, type, title, message, options = {}) {
  const relatedRequestId = options.relatedRequestId ?? null;
  const relatedClassId = options.relatedClassId ?? null;
  const details =
    options.details != null ? JSON.stringify(options.details) : null;
  const deliverAt = options.deliverAt ?? null;

  db.prepare(
    `INSERT INTO notifications (
       user_id, type, title, message, related_request_id, related_class_id, details, deliver_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    userId,
    type,
    title,
    message,
    relatedRequestId,
    relatedClassId,
    details,
    deliverAt,
  );
}

function scheduleStudentReminders(studentId, requestId, classId, scheduleDetails) {
  const startTime = scheduleDetails.startTime || '09:00';
  const classStart = new Date(`${scheduleDetails.classDate}T${startTime}:00`);
  if (Number.isNaN(classStart.getTime())) return;

  const now = new Date();
  const windows = [
    { key: '24h', ms: 24 * 60 * 60 * 1000, label: '24 hours' },
    { key: '1h', ms: 60 * 60 * 1000, label: '1 hour' },
  ];

  for (const window of windows) {
    const deliverAtDate = new Date(classStart.getTime() - window.ms);
    // If the reminder time already passed, deliver immediately.
    const deliverAt =
      deliverAtDate <= now ? null : toSqliteDateTime(deliverAtDate);

    const reminderMessage = [
      `Reminder: your class begins in ${window.label}.`,
      `Assigned teacher: ${scheduleDetails.teacherName}`,
      `Schedule: ${scheduleDetails.classDate} ${scheduleDetails.startTime} – ${scheduleDetails.endTime} (${scheduleDetails.durationMinutes} minutes)`,
      `Meeting information: ${scheduleDetails.meetingInfo}`,
      `Meeting link: ${scheduleDetails.meetingLink}`,
    ].join('\n');

    notifyUser(
      studentId,
      'class_reminder',
      `Class reminder · ${window.label} before`,
      reminderMessage,
      {
        relatedRequestId: requestId,
        relatedClassId: classId,
        deliverAt,
        details: {
          ...scheduleDetails,
          reminderWindow: window.key,
          reminderLabel: window.label,
        },
      },
    );
  }
}

function teacherHasConflict(teacherId, preferredDate, timeSlot) {
  const classConflict = db
    .prepare(
      `SELECT id, title, class_date, time_slot
       FROM classes
       WHERE teacher_id = ? AND class_date = ? AND time_slot = ?
       LIMIT 1`,
    )
    .get(teacherId, preferredDate, timeSlot);

  if (classConflict) return classConflict;

  const calendarConflict = teacherHasCalendarConflict(teacherId, preferredDate, timeSlot);
  if (calendarConflict) {
    return {
      id: calendarConflict.id,
      title: calendarConflict.title || `Calendar (${calendarConflict.provider})`,
      class_date: preferredDate,
      time_slot: timeSlot,
    };
  }

  return null;
}

function getTeacherWorkload(teacherId) {
  return db
    .prepare(`SELECT COUNT(*) AS count FROM classes WHERE teacher_id = ?`)
    .get(teacherId).count;
}

function getAllTeachers() {
  return db
    .prepare(
      `SELECT id, username, full_name, email, subject_expertise
       FROM users
       WHERE role = 'teacher'
       ORDER BY full_name ASC, username ASC`,
    )
    .all();
}

function detectPreferredSubjects(remarks) {
  const text = String(remarks || '').toLowerCase();
  return SUBJECTS.filter((subject) => text.includes(subject));
}

function buildTeacherCandidates(slots, remarks) {
  const teachers = getAllTeachers();
  const preferredSubjects = detectPreferredSubjects(remarks);

  const candidates = teachers.map((teacher) => {
    const freeSlots = slots.filter(
      (slot) => !teacherHasConflict(teacher.id, slot.preferred_date, slot.time_slot),
    );
    const workload = getTeacherWorkload(teacher.id);
    const expertise = (teacher.subject_expertise || '').trim();
    const expertiseLower = expertise.toLowerCase();
    const preferenceMatch =
      preferredSubjects.length > 0 &&
      preferredSubjects.some(
        (subject) =>
          expertiseLower.includes(subject) ||
          String(teacher.full_name || '').toLowerCase().includes(subject) ||
          String(teacher.username || '').toLowerCase().includes(subject),
      );

    const nameMentioned =
      Boolean(remarks) &&
      String(remarks)
        .toLowerCase()
        .includes(String(teacher.full_name || teacher.username).toLowerCase().split(' ')[0]);

    const fullyAvailable = freeSlots.length === slots.length && slots.length > 0;
    const reasons = [];

    if (fullyAvailable) reasons.push('Free for every preferred slot');
    else if (freeSlots.length > 0) {
      reasons.push(`Free for ${freeSlots.length}/${slots.length} preferred slots`);
    } else {
      reasons.push('No free preferred slots');
    }

    if (expertise) reasons.push(`Expertise: ${expertise}`);
    if (preferenceMatch) reasons.push('Matches student subject preference');
    if (nameMentioned) reasons.push('Mentioned in student remarks');
    reasons.push(`Workload: ${workload} class(es)`);

    let score = 0;
    score += freeSlots.length * 20;
    if (fullyAvailable) score += 25;
    if (preferenceMatch) score += 30;
    if (nameMentioned) score += 15;
    score += Math.max(0, 20 - workload * 4);

    return {
      id: teacher.id,
      username: teacher.username,
      fullName: teacher.full_name || teacher.username,
      email: teacher.email || '',
      subjectExpertise: expertise,
      workload,
      availableSlotCount: freeSlots.length,
      fullyAvailable,
      preferenceMatch: preferenceMatch || nameMentioned,
      assignable: freeSlots.length > 0,
      freeSlots: freeSlots.map((slot) => ({
        id: slot.id,
        preferredDate: slot.preferred_date,
        timeSlot: slot.time_slot,
      })),
      matchReasons: reasons,
      suitabilityScore: score,
    };
  });

  candidates.sort((a, b) => {
    if (a.assignable !== b.assignable) return a.assignable ? -1 : 1;
    if (b.suitabilityScore !== a.suitabilityScore) return b.suitabilityScore - a.suitabilityScore;
    return a.workload - b.workload;
  });

  return { candidates, preferredSubjects };
}

function buildAvailability(slots, remarks = '') {
  const teachers = getAllTeachers();
  const slotAvailability = slots.map((slot) => {
    const availableTeachers = [];
    const unavailableTeachers = [];

    for (const teacher of teachers) {
      const conflict = teacherHasConflict(teacher.id, slot.preferred_date, slot.time_slot);
      const summary = {
        id: teacher.id,
        username: teacher.username,
        fullName: teacher.full_name || teacher.username,
        email: teacher.email || '',
        subjectExpertise: teacher.subject_expertise || '',
        workload: getTeacherWorkload(teacher.id),
      };

      if (conflict) {
        unavailableTeachers.push({
          ...summary,
          conflict: {
            classId: conflict.id,
            title: conflict.title || 'Existing class',
            classDate: conflict.class_date,
            timeSlot: conflict.time_slot,
          },
        });
      } else {
        availableTeachers.push(summary);
      }
    }

    return {
      id: slot.id,
      preferredDate: slot.preferred_date,
      timeSlot: slot.time_slot,
      availableTeachers,
      unavailableTeachers,
    };
  });

  const fullyAvailableTeachers = teachers
    .filter((teacher) =>
      slots.every(
        (slot) => !teacherHasConflict(teacher.id, slot.preferred_date, slot.time_slot),
      ),
    )
    .map((teacher) => ({
      id: teacher.id,
      username: teacher.username,
      fullName: teacher.full_name || teacher.username,
      email: teacher.email || '',
      subjectExpertise: teacher.subject_expertise || '',
      workload: getTeacherWorkload(teacher.id),
    }));

  const { candidates, preferredSubjects } = buildTeacherCandidates(slots, remarks);

  return {
    slotAvailability,
    fullyAvailableTeachers,
    teacherCount: teachers.length,
    teacherCandidates: candidates,
    preferredSubjects,
  };
}

async function createScheduleRequest(req, res) {
  const { slots, remarks } = req.body || {};

  if (!Array.isArray(slots) || slots.length === 0) {
    return res.status(400).json({ message: 'Select at least one preferred date and time slot' });
  }

  const normalizedSlots = [];
  const seen = new Set();

  for (const slot of slots) {
    const preferredDate = String(slot?.preferredDate || slot?.preferred_date || '').trim();
    const timeSlot = String(slot?.timeSlot || slot?.time_slot || '').trim();

    if (!DATE_RE.test(preferredDate)) {
      return res.status(400).json({ message: 'Each slot needs a valid date (YYYY-MM-DD)' });
    }
    if (!TIME_SLOT_RE.test(timeSlot)) {
      return res.status(400).json({ message: 'Each slot needs a valid time range (HH:MM-HH:MM)' });
    }

    const key = `${preferredDate}|${timeSlot}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalizedSlots.push({ preferredDate, timeSlot });
  }

  if (normalizedSlots.length === 0) {
    return res.status(400).json({ message: 'Select at least one preferred date and time slot' });
  }

  const cleanRemarks = typeof remarks === 'string' ? remarks.trim() : '';
  const student = getStudent(req.user.id);
  const studentName = student?.full_name || student?.username || 'A student';

  const insertRequest = db.prepare(`
    INSERT INTO schedule_requests (student_id, remarks, status)
    VALUES (?, ?, 'pending')
  `);
  const insertSlot = db.prepare(`
    INSERT INTO schedule_request_slots (request_id, preferred_date, time_slot)
    VALUES (?, ?, ?)
  `);

  const create = db.transaction(() => {
    const result = insertRequest.run(req.user.id, cleanRemarks || null);
    const requestId = result.lastInsertRowid;

    for (const slot of normalizedSlots) {
      insertSlot.run(requestId, slot.preferredDate, slot.timeSlot);
    }

    notifyAdminsAboutRequest(requestId, studentName);
    return requestId;
  });

  try {
    const requestId = create();
    const request = db.prepare('SELECT * FROM schedule_requests WHERE id = ?').get(requestId);
    res.status(201).json(mapRequest(request, getSlotsForRequest(requestId), student));
  } catch (err) {
    res.status(500).json({ message: 'Error creating schedule request', error: err.message });
  }
}

async function listMyScheduleRequests(req, res) {
  try {
    const requests = db
      .prepare(
        `SELECT *
         FROM schedule_requests
         WHERE student_id = ?
         ORDER BY created_at DESC`,
      )
      .all(req.user.id);

    res.json(
      requests.map((request) =>
        mapRequest(
          request,
          getSlotsForRequest(request.id),
          getStudent(request.student_id),
          request.assigned_teacher_id ? getTeacherById(request.assigned_teacher_id) : null,
        ),
      ),
    );
  } catch (err) {
    res.status(500).json({ message: 'Error loading schedule requests', error: err.message });
  }
}

async function listScheduleRequestsForAdmin(req, res) {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
    const allowed = ['pending', 'approved', 'rejected', 'all'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: 'Invalid status filter' });
    }

    const requests =
      status === 'all'
        ? db.prepare(`SELECT * FROM schedule_requests ORDER BY created_at DESC`).all()
        : db
            .prepare(
              `SELECT * FROM schedule_requests WHERE status = ? ORDER BY created_at DESC`,
            )
            .all(status);

    res.json(
      requests.map((request) =>
        mapRequest(
          request,
          getSlotsForRequest(request.id),
          getStudent(request.student_id),
          request.assigned_teacher_id ? getTeacherById(request.assigned_teacher_id) : null,
        ),
      ),
    );
  } catch (err) {
    res.status(500).json({ message: 'Error loading schedule requests', error: err.message });
  }
}

async function getScheduleRequestForAdmin(req, res) {
  try {
    const requestId = Number(req.params.id);
    if (!Number.isInteger(requestId) || requestId < 1) {
      return res.status(400).json({ message: 'Invalid request id' });
    }

    const request = db.prepare('SELECT * FROM schedule_requests WHERE id = ?').get(requestId);
    if (!request) {
      return res.status(404).json({ message: 'Schedule request not found' });
    }

    const slots = getSlotsForRequest(requestId);
    const student = getStudent(request.student_id);
    const assignedTeacher = request.assigned_teacher_id
      ? getTeacherById(request.assigned_teacher_id)
      : null;
    const availability = buildAvailability(slots, request.remarks);
    const confirmedSchedule = getConfirmedScheduleForRequest(requestId);

    res.json({
      request: mapRequest(request, slots, student, assignedTeacher),
      confirmedSchedule,
      ...availability,
    });
  } catch (err) {
    res.status(500).json({ message: 'Error loading schedule request', error: err.message });
  }
}

async function assignTeacherToRequest(req, res) {
  try {
    const requestId = Number(req.params.id);
    const teacherId = Number(req.body?.teacherId);
    let slotId = req.body?.slotId != null ? Number(req.body.slotId) : null;

    if (!Number.isInteger(requestId) || requestId < 1) {
      return res.status(400).json({ message: 'Invalid request id' });
    }
    if (!Number.isInteger(teacherId) || teacherId < 1) {
      return res.status(400).json({ message: 'teacherId is required' });
    }

    const request = db.prepare('SELECT * FROM schedule_requests WHERE id = ?').get(requestId);
    if (!request) {
      return res.status(404).json({ message: 'Schedule request not found' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending requests can be assigned' });
    }

    const teacher = getTeacherById(teacherId);
    if (!teacher) {
      return res.status(400).json({ message: 'Teacher not found' });
    }

    const slots = getSlotsForRequest(requestId);
    if (!slots.length) {
      return res.status(400).json({ message: 'Request has no preferred slots' });
    }

    let selectedSlot = null;
    if (slotId != null) {
      if (!Number.isInteger(slotId) || slotId < 1) {
        return res.status(400).json({ message: 'Invalid slotId' });
      }
      selectedSlot = slots.find((slot) => slot.id === slotId);
      if (!selectedSlot) {
        return res.status(400).json({ message: 'Selected slot is not part of this request' });
      }
    } else {
      selectedSlot = slots.find(
        (slot) => !teacherHasConflict(teacherId, slot.preferred_date, slot.time_slot),
      );
      if (!selectedSlot) {
        return res.status(400).json({
          message: 'Teacher is unavailable for all preferred slots on this request',
        });
      }
      slotId = selectedSlot.id;
    }

    if (teacherHasConflict(teacherId, selectedSlot.preferred_date, selectedSlot.time_slot)) {
      return res.status(409).json({
        message: 'Teacher has a schedule conflict for the selected slot',
      });
    }

    const student = getStudent(request.student_id);
    const studentName = student?.full_name || student?.username || 'Student';
    const teacherName = teacher.full_name || teacher.username;
    const { startTime, endTime, durationMinutes } = parseTimeSlot(selectedSlot.time_slot);
    const { meetingInfo, meetingLink, meetingProvider } = buildMeetingDetails(
      requestId,
      selectedSlot.preferred_date,
      startTime,
    );
    const subject = teacher.subject_expertise || 'General';
    const title = `${subject} lesson · ${studentName} with ${teacherName}`;

    let createdClassId = null;

    const assign = db.transaction(() => {
      db.prepare(
        `UPDATE schedule_requests
         SET status = 'approved',
             assigned_teacher_id = ?,
             assigned_slot_id = ?,
             assigned_by = ?,
             assigned_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pending'`,
      ).run(teacherId, slotId, req.user.id, requestId);

      const classResult = db
        .prepare(
          `INSERT INTO classes (
             teacher_id, student_id, class_date, time_slot, title, schedule_request_id,
             start_time, end_time, duration_minutes, meeting_info, meeting_link,
             meeting_provider, status, subject
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)`,
        )
        .run(
          teacherId,
          request.student_id,
          selectedSlot.preferred_date,
          selectedSlot.time_slot,
          title,
          requestId,
          startTime,
          endTime,
          durationMinutes,
          meetingInfo,
          meetingLink,
          meetingProvider,
          subject,
        );

      createdClassId = classResult.lastInsertRowid;

      const scheduleDetails = {
        studentName,
        teacherName,
        classDate: selectedSlot.preferred_date,
        timeSlot: selectedSlot.time_slot,
        startTime,
        endTime,
        durationMinutes,
        subject,
        meetingInfo,
        meetingLink,
      };

      const teacherMessage = [
        `Assigned student: ${studentName}`,
        `Date and time: ${selectedSlot.preferred_date} ${startTime} – ${endTime}`,
        `Class duration: ${durationMinutes} minutes`,
        `Meeting details: ${meetingInfo}`,
        `Meeting link: ${meetingLink}`,
      ].join('\n');

      const studentMessage = [
        `Assigned teacher: ${teacherName}`,
        `Schedule: ${selectedSlot.preferred_date} ${startTime} – ${endTime} (${durationMinutes} minutes)`,
        `Meeting information: ${meetingInfo}`,
        `Meeting link: ${meetingLink}`,
        'Reminders: you will also receive notifications 24 hours and 1 hour before class begins.',
      ].join('\n');

      notifyUser(
        request.student_id,
        'schedule_confirmed',
        'Your class schedule is confirmed',
        studentMessage,
        {
          relatedRequestId: requestId,
          relatedClassId: createdClassId,
          details: {
            ...scheduleDetails,
            remindersScheduled: ['24h', '1h'],
          },
        },
      );

      scheduleStudentReminders(
        request.student_id,
        requestId,
        createdClassId,
        scheduleDetails,
      );

      notifyUser(
        teacherId,
        'schedule_confirmed',
        'New class assignment confirmed',
        teacherMessage,
        {
          relatedRequestId: requestId,
          relatedClassId: createdClassId,
          details: scheduleDetails,
        },
      );
    });

    assign();

    const updated = db.prepare('SELECT * FROM schedule_requests WHERE id = ?').get(requestId);
    const updatedSlots = getSlotsForRequest(requestId);
    const classRow = db.prepare('SELECT * FROM classes WHERE id = ?').get(createdClassId);
    const confirmedSchedule = mapClassRow(classRow, teacher, student);

    // Add the approved schedule to student + teacher calendars (and external providers if connected)
    const calendarSync = await syncClassToCalendars(
      classRow,
      request.student_id,
      teacherId,
    );

    // Optional: if email integration is enabled, send confirmation emails automatically.
    const emailResult = await sendScheduleConfirmationEmails({
      student,
      teacher,
      details: {
        studentName,
        teacherName,
        classDate: selectedSlot.preferred_date,
        timeSlot: selectedSlot.time_slot,
        startTime,
        endTime,
        durationMinutes,
        subject,
        meetingInfo,
        meetingLink,
      },
    });

    res.json({
      message: emailResult.enabled
        ? 'Teacher assigned, schedule confirmed, calendars synced, and confirmation emails processed'
        : 'Teacher assigned, schedule confirmed, and calendars synced',
      request: mapRequest(updated, updatedSlots, student, teacher),
      confirmedSchedule,
      calendarSync,
      emails: emailResult,
    });
  } catch (err) {
    res.status(500).json({ message: 'Error assigning teacher', error: err.message });
  }
}

module.exports = {
  createScheduleRequest,
  listMyScheduleRequests,
  listScheduleRequestsForAdmin,
  getScheduleRequestForAdmin,
  assignTeacherToRequest,
};
