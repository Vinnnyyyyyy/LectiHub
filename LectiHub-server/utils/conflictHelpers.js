const db = require('../config/db');
const { teacherHasCalendarConflict } = require('./calendarService');

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

module.exports = {
  teacherHasConflict,
};
