function parseTimeSlot(timeSlot) {
  const [startTime, endTime] = String(timeSlot || '').split('-');
  if (!startTime || !endTime) {
    return { startTime: null, endTime: null, durationMinutes: 60 };
  }

  const toMinutes = (value) => {
    const [hours, minutes] = value.split(':').map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    return hours * 60 + minutes;
  };

  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  const durationMinutes =
    start != null && end != null && end > start ? end - start : 60;

  return {
    startTime,
    endTime,
    durationMinutes,
  };
}

function buildMeetingDetails(requestId, classDate, startTime) {
  const roomCode = `LH-${requestId}-${String(classDate).replace(/-/g, '')}-${String(startTime).replace(':', '')}`;
  return {
    meetingInfo: `Online LectiHub lesson · Room ${roomCode}`,
    meetingLink: `https://meet.lectihub.local/room/${roomCode}`,
  };
}

function mapClassRow(row, teacher = null, student = null) {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    studentId: row.student_id,
    scheduleRequestId: row.schedule_request_id,
    classDate: row.class_date,
    timeSlot: row.time_slot,
    startTime: row.start_time || (row.time_slot ? row.time_slot.split('-')[0] : null),
    endTime: row.end_time || (row.time_slot ? row.time_slot.split('-')[1] : null),
    durationMinutes: row.duration_minutes || 60,
    title: row.title || 'Confirmed lesson',
    subject: row.subject || '',
    meetingInfo: row.meeting_info || '',
    meetingLink: row.meeting_link || '',
    status: row.status || 'confirmed',
    createdAt: row.created_at,
    teacher: teacher
      ? {
          id: teacher.id,
          username: teacher.username,
          fullName: teacher.full_name || teacher.username,
          email: teacher.email || '',
          subjectExpertise: teacher.subject_expertise || '',
        }
      : null,
    student: student
      ? {
          id: student.id,
          username: student.username,
          fullName: student.full_name || student.username,
          email: student.email || '',
        }
      : null,
  };
}

module.exports = {
  parseTimeSlot,
  buildMeetingDetails,
  mapClassRow,
};
