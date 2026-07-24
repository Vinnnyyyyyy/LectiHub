const db = require('../config/db');
const { teacherHasCalendarConflict } = require('./calendarService');

function slotBounds(timeSlot) {
  const [startRaw, endRaw] = String(timeSlot || '').split('-');
  const toMinutes = (value) => {
    const [hours, minutes] = String(value || '')
      .split(':')
      .map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    return hours * 60 + minutes;
  };
  const start = toMinutes(startRaw);
  const end = toMinutes(endRaw);
  if (start == null || end == null || end <= start) return null;
  return { start, end, startTime: startRaw, endTime: endRaw };
}

function rangesOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

function teacherHasConflict(teacherId, preferredDate, timeSlot) {
  const requested = slotBounds(timeSlot);
  if (!requested) return null;

  const classRows = db
    .prepare(
      `SELECT id, title, class_date, time_slot, start_time, end_time
       FROM classes
       WHERE teacher_id = ? AND class_date = ?`,
    )
    .all(teacherId, preferredDate);

  for (const row of classRows) {
    const existing =
      row.start_time && row.end_time
        ? slotBounds(`${row.start_time}-${row.end_time}`)
        : slotBounds(row.time_slot);
    if (existing && rangesOverlap(requested, existing)) {
      return row;
    }
  }

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

module.exports = {
  teacherHasConflict,
  slotBounds,
  rangesOverlap,
};
