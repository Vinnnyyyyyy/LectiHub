function formatHm(totalMinutes) {
  const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const m = String(totalMinutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function buildSlots(startMinutes, endMinutes, slotMinutes) {
  const slots = [];
  let minutes = startMinutes;
  const step = slotMinutes > 0 ? slotMinutes : 30;
  while (minutes + step <= endMinutes) {
    const next = minutes + step;
    slots.push(`${formatHm(minutes)}-${formatHm(next)}`);
    minutes = next;
  }
  return slots;
}

/**
 * Default 30-minute reservation slots (lunch gap 12:00–13:00).
 * Laravel AvailabilityService::standardTimeSlots() is the live source of truth
 * when using LectiHub-api; this list remains the Express fallback.
 */
const STANDARD_TIME_SLOTS = [
  ...buildSlots(9 * 60, 12 * 60, 30),
  ...buildSlots(13 * 60, 18 * 60, 30),
];

/** Build a slot grid for an explicit duration (used by tests / optional config). */
function standardTimeSlotsFor(slotMinutes = 30) {
  const step = slotMinutes === 60 ? 60 : 30;
  return [...buildSlots(9 * 60, 12 * 60, step), ...buildSlots(13 * 60, 18 * 60, step)];
}

/** Students may only book on/after today + this many calendar days. */
const BOOKING_LEAD_DAYS = 2;

const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5]; // Mon–Fri

function parseIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function toIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function earliestBookableDate(fromDate = new Date()) {
  const date = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  date.setDate(date.getDate() + BOOKING_LEAD_DAYS);
  return toIsoDate(date);
}

function weekdayOf(isoDate) {
  const date = parseIsoDate(isoDate);
  return date ? date.getDay() : null;
}

function ensureDefaultTeacherAvailability(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS teacher_availability (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL,
      weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
      time_slot TEXT NOT NULL,
      is_open INTEGER NOT NULL DEFAULT 1,
      UNIQUE(teacher_id, weekday, time_slot),
      FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_teacher_availability_teacher
     ON teacher_availability(teacher_id, weekday)`,
  );

  const teachers = db.prepare(`SELECT id FROM users WHERE role = 'teacher'`).all();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO teacher_availability (teacher_id, weekday, time_slot, is_open)
    VALUES (?, ?, ?, 1)
  `);

  const seedOne = db.transaction((teacherId) => {
    // Always ensure every current standard slot exists (supports slot-length upgrades).
    for (const weekday of DEFAULT_WEEKDAYS) {
      for (const slot of STANDARD_TIME_SLOTS) {
        insert.run(teacherId, weekday, slot);
      }
    }
  });

  for (const teacher of teachers) {
    seedOne(teacher.id);
  }
}

function getTeacherWeeklyAvailability(db, teacherId) {
  return db
    .prepare(
      `SELECT weekday, time_slot AS timeSlot, is_open AS isOpen
       FROM teacher_availability
       WHERE teacher_id = ?
       ORDER BY weekday ASC, time_slot ASC`,
    )
    .all(teacherId)
    .map((row) => ({
      weekday: row.weekday,
      timeSlot: row.timeSlot,
      isOpen: Boolean(row.isOpen),
    }));
}

function replaceTeacherWeeklyAvailability(db, teacherId, slots) {
  const clear = db.prepare(`DELETE FROM teacher_availability WHERE teacher_id = ?`);
  const insert = db.prepare(`
    INSERT INTO teacher_availability (teacher_id, weekday, time_slot, is_open)
    VALUES (?, ?, ?, ?)
  `);

  const write = db.transaction(() => {
    clear.run(teacherId);
    for (const slot of slots) {
      insert.run(teacherId, slot.weekday, slot.timeSlot, slot.isOpen ? 1 : 0);
    }
  });
  write();
}

function teacherOffersSlot(db, teacherId, preferredDate, timeSlot) {
  const weekday = weekdayOf(preferredDate);
  if (weekday == null) return false;

  const row = db
    .prepare(
      `SELECT is_open
       FROM teacher_availability
       WHERE teacher_id = ? AND weekday = ? AND time_slot = ?
       LIMIT 1`,
    )
    .get(teacherId, weekday, timeSlot);

  // No template row → closed (defaults are seeded for active teachers).
  if (!row) return false;
  return Boolean(row.is_open);
}

function eachDateInRange(fromIso, toIso, callback) {
  const start = parseIsoDate(fromIso);
  const end = parseIsoDate(toIso);
  if (!start || !end || start > end) return;

  const cursor = new Date(start.getTime());
  while (cursor <= end) {
    callback(toIsoDate(cursor), cursor.getDay());
    cursor.setDate(cursor.getDate() + 1);
  }
}

/**
 * Build open inventory for students: dates/slots with ≥1 free teacher
 * (offers the weekly slot AND has no booking/calendar conflict).
 */
function buildOpenInventory(db, fromIso, toIso, teachers, hasConflict) {
  const dates = [];
  const openDates = [];

  eachDateInRange(fromIso, toIso, (isoDate) => {
    const slots = [];
    for (const timeSlot of STANDARD_TIME_SLOTS) {
      let availableTeacherCount = 0;
      for (const teacher of teachers) {
        if (!teacherOffersSlot(db, teacher.id, isoDate, timeSlot)) continue;
        if (hasConflict(teacher.id, isoDate, timeSlot)) continue;
        availableTeacherCount += 1;
      }
      if (availableTeacherCount > 0) {
        slots.push({ timeSlot, availableTeacherCount });
      }
    }
    if (slots.length) {
      dates.push({ date: isoDate, slots });
      openDates.push(isoDate);
    }
  });

  return {
    from: fromIso,
    to: toIso,
    timeSlots: STANDARD_TIME_SLOTS,
    dates,
    openDates,
  };
}

module.exports = {
  STANDARD_TIME_SLOTS,
  standardTimeSlotsFor,
  BOOKING_LEAD_DAYS,
  DEFAULT_WEEKDAYS,
  ensureDefaultTeacherAvailability,
  getTeacherWeeklyAvailability,
  replaceTeacherWeeklyAvailability,
  teacherOffersSlot,
  buildOpenInventory,
  parseIsoDate,
  toIsoDate,
  earliestBookableDate,
};
