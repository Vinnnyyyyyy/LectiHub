const db = require('../config/db');
const {
  STANDARD_TIME_SLOTS,
  buildOpenInventory,
  getTeacherWeeklyAvailability,
  replaceTeacherWeeklyAvailability,
  ensureDefaultTeacherAvailability,
  parseIsoDate,
  toIsoDate,
  earliestBookableDate,
  BOOKING_LEAD_DAYS,
} = require('../utils/availabilityHelpers');
const { teacherHasConflict } = require('../utils/conflictHelpers');

function listTeachers() {
  return db
    .prepare(
      `SELECT id, username, full_name, email, subject_expertise
       FROM users
       WHERE role = 'teacher'
       ORDER BY full_name ASC, username ASC`,
    )
    .all();
}

function defaultRange() {
  const start = earliestBookableDate();
  const endDate = parseIsoDate(start);
  endDate.setDate(endDate.getDate() + 60);
  return { from: start, to: toIsoDate(endDate) };
}

async function getOpenAvailability(req, res) {
  try {
    ensureDefaultTeacherAvailability(db);

    const defaults = defaultRange();
    const earliest = earliestBookableDate();
    let from = String(req.query.from || defaults.from).slice(0, 10);
    const to = String(req.query.to || defaults.to).slice(0, 10);

    if (!parseIsoDate(from) || !parseIsoDate(to)) {
      return res.status(400).json({ message: 'from and to must be YYYY-MM-DD dates.' });
    }
    if (from < earliest) from = earliest;
    if (from > to) {
      return res.status(400).json({ message: 'from must be on or before to.' });
    }

    const inventory = buildOpenInventory(db, from, to, listTeachers(), teacherHasConflict);
    return res.json({
      ...inventory,
      earliestBookableDate: earliest,
      bookingLeadDays: BOOKING_LEAD_DAYS,
    });
  } catch (err) {
    console.error('Open availability error:', err);
    return res.status(500).json({
      message: 'Unable to load open teacher availability.',
      error: err.message,
    });
  }
}

async function getMyAvailability(req, res) {
  try {
    ensureDefaultTeacherAvailability(db);
    const slots = getTeacherWeeklyAvailability(db, req.user.id);
    return res.json({
      timeSlots: STANDARD_TIME_SLOTS,
      weekdays: [
        { value: 0, label: 'Sun' },
        { value: 1, label: 'Mon' },
        { value: 2, label: 'Tue' },
        { value: 3, label: 'Wed' },
        { value: 4, label: 'Thu' },
        { value: 5, label: 'Fri' },
        { value: 6, label: 'Sat' },
      ],
      slots,
    });
  } catch (err) {
    console.error('My availability error:', err);
    return res.status(500).json({
      message: 'Unable to load your availability.',
      error: err.message,
    });
  }
}

async function updateMyAvailability(req, res) {
  try {
    const incoming = Array.isArray(req.body?.slots) ? req.body.slots : null;
    if (!incoming) {
      return res.status(400).json({ message: 'slots array is required.' });
    }

    const cleaned = [];
    for (const item of incoming) {
      const weekday = Number(item.weekday);
      const timeSlot = String(item.timeSlot || '').trim();
      const isOpen = Boolean(item.isOpen);
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
        return res.status(400).json({ message: 'weekday must be 0–6.' });
      }
      if (!STANDARD_TIME_SLOTS.includes(timeSlot)) {
        return res.status(400).json({
          message: `timeSlot must be one of: ${STANDARD_TIME_SLOTS.join(', ')}`,
        });
      }
      cleaned.push({ weekday, timeSlot, isOpen });
    }

    replaceTeacherWeeklyAvailability(db, req.user.id, cleaned);
    const slots = getTeacherWeeklyAvailability(db, req.user.id);
    return res.json({
      message: 'Availability updated.',
      timeSlots: STANDARD_TIME_SLOTS,
      slots,
    });
  } catch (err) {
    console.error('Update availability error:', err);
    return res.status(500).json({
      message: 'Unable to update your availability.',
      error: err.message,
    });
  }
}

module.exports = {
  getOpenAvailability,
  getMyAvailability,
  updateMyAvailability,
};
