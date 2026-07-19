const db = require('../config/db');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_SLOT_RE = /^\d{2}:\d{2}-\d{2}:\d{2}$/;

function mapRequest(row, slots, student = null) {
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

function notifyAdminsAboutRequest(requestId, studentName) {
  const admins = db.prepare(`SELECT id FROM users WHERE role = 'admin'`).all();
  const insert = db.prepare(`
    INSERT INTO notifications (user_id, type, title, message, related_request_id)
    VALUES (?, 'schedule_request', ?, ?, ?)
  `);

  const title = 'New scheduling request';
  const message = `${studentName} submitted a preferred schedule awaiting review.`;

  for (const admin of admins) {
    insert.run(admin.id, title, message, requestId);
  }
}

function teacherHasConflict(teacherId, preferredDate, timeSlot) {
  return db
    .prepare(
      `SELECT id, title, class_date, time_slot
       FROM classes
       WHERE teacher_id = ? AND class_date = ? AND time_slot = ?
       LIMIT 1`,
    )
    .get(teacherId, preferredDate, timeSlot);
}

function getAllTeachers() {
  return db
    .prepare(
      `SELECT id, username, full_name, email
       FROM users
       WHERE role = 'teacher'
       ORDER BY full_name ASC, username ASC`,
    )
    .all();
}

function buildAvailability(slots) {
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

  // Teachers free for every preferred slot in this request
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
    }));

  return { slotAvailability, fullyAvailableTeachers, teacherCount: teachers.length };
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
        mapRequest(request, getSlotsForRequest(request.id), getStudent(request.student_id)),
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
        ? db
            .prepare(`SELECT * FROM schedule_requests ORDER BY created_at DESC`)
            .all()
        : db
            .prepare(
              `SELECT * FROM schedule_requests WHERE status = ? ORDER BY created_at DESC`,
            )
            .all(status);

    res.json(
      requests.map((request) =>
        mapRequest(request, getSlotsForRequest(request.id), getStudent(request.student_id)),
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
    const availability = buildAvailability(slots);

    res.json({
      request: mapRequest(request, slots, student),
      ...availability,
    });
  } catch (err) {
    res.status(500).json({ message: 'Error loading schedule request', error: err.message });
  }
}

module.exports = {
  createScheduleRequest,
  listMyScheduleRequests,
  listScheduleRequestsForAdmin,
  getScheduleRequestForAdmin,
};
