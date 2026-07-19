const db = require('../config/db');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_SLOT_RE = /^\d{2}:\d{2}-\d{2}:\d{2}$/;

function mapRequest(row, slots) {
  return {
    id: row.id,
    studentId: row.student_id,
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

    return requestId;
  });

  try {
    const requestId = create();
    const request = db.prepare('SELECT * FROM schedule_requests WHERE id = ?').get(requestId);
    res.status(201).json(mapRequest(request, getSlotsForRequest(requestId)));
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

    res.json(requests.map((request) => mapRequest(request, getSlotsForRequest(request.id))));
  } catch (err) {
    res.status(500).json({ message: 'Error loading schedule requests', error: err.message });
  }
}

module.exports = {
  createScheduleRequest,
  listMyScheduleRequests,
};
