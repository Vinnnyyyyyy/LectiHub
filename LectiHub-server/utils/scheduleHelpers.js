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

function normalizeClassStatus(status) {
  const value = String(status || 'scheduled').toLowerCase();
  if (value === 'confirmed') return 'scheduled';
  if (['scheduled', 'in_progress', 'completed', 'cancelled'].includes(value)) {
    return value;
  }
  return 'scheduled';
}

function getMeetingProvider() {
  const provider = String(process.env.MEETING_PROVIDER || 'jitsi').toLowerCase();
  if (['jitsi', 'google_meet', 'zoom'].includes(provider)) return provider;
  return 'jitsi';
}

function buildMeetingDetails(requestId, classDate, startTime) {
  const roomCode = `LH-${requestId}-${String(classDate).replace(/-/g, '')}-${String(startTime).replace(':', '')}`;
  const provider = getMeetingProvider();

  if (provider === 'google_meet') {
    const base =
      process.env.GOOGLE_MEET_BASE_URL || 'https://meet.google.com';
    const link = `${base}/${roomCode.toLowerCase()}`;
    return {
      meetingProvider: 'google_meet',
      meetingInfo: `Google Meet · Room ${roomCode}`,
      meetingLink: link,
    };
  }

  if (provider === 'zoom') {
    // Prefer an explicit template, e.g. https://zoom.us/j/ROOM?pwd=xyz
    const template =
      process.env.ZOOM_MEETING_LINK_TEMPLATE ||
      'https://zoom.us/j/{room}';
    const link = template.replace('{room}', roomCode.replace(/[^a-zA-Z0-9]/g, ''));
    return {
      meetingProvider: 'zoom',
      meetingInfo: `Zoom · Meeting ${roomCode}`,
      meetingLink: link,
    };
  }

  // Default: Jitsi (no API keys required; works in browser)
  const jitsiBase = process.env.JITSI_BASE_URL || 'https://meet.jit.si';
  const link = `${jitsiBase}/LectiHub-${roomCode}`;
  return {
    meetingProvider: 'jitsi',
    meetingInfo: `Jitsi Meet · Room LectiHub-${roomCode}`,
    meetingLink: link,
  };
}

function getClassWindow(classRow) {
  const startTime = classRow.start_time || String(classRow.time_slot || '').split('-')[0] || '09:00';
  const endTime = classRow.end_time || String(classRow.time_slot || '').split('-')[1] || '10:00';
  const start = new Date(`${classRow.class_date}T${startTime}:00`);
  const end = new Date(`${classRow.class_date}T${endTime}:00`);
  return { start, end, startTime, endTime };
}

function getJoinAvailability(classRow, now = new Date()) {
  const status = normalizeClassStatus(classRow.status);
  if (status === 'completed' || status === 'cancelled') {
    return {
      canJoin: false,
      reason: `Class is ${status.replace('_', ' ')}`,
      withinWindow: false,
    };
  }

  const { start, end } = getClassWindow(classRow);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { canJoin: false, reason: 'Invalid class schedule', withinWindow: false };
  }

  const beforeMinutes = Number(process.env.MEETING_JOIN_MINUTES_BEFORE || 15);
  const afterMinutes = Number(process.env.MEETING_JOIN_MINUTES_AFTER || 15);
  const windowStart = new Date(start.getTime() - beforeMinutes * 60 * 1000);
  const windowEnd = new Date(end.getTime() + afterMinutes * 60 * 1000);
  const withinWindow = now >= windowStart && now <= windowEnd;

  // Allow early join for local demos unless explicitly disabled
  const allowEarly =
    String(process.env.MEETING_ALLOW_EARLY_JOIN || 'true').toLowerCase() === 'true';

  if (withinWindow || (allowEarly && status === 'scheduled') || status === 'in_progress') {
    return {
      canJoin: true,
      reason: withinWindow ? 'Join window open' : 'Early join enabled',
      withinWindow,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
    };
  }

  return {
    canJoin: false,
    reason: `Join opens ${beforeMinutes} minutes before class start`,
    withinWindow: false,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
  };
}

const ATTENDANCE_STATUSES = new Set([
  'not_recorded',
  'present',
  'late',
  'absent',
  'excused',
]);

const PARTICIPATION_LEVELS = new Set([
  'not_recorded',
  'low',
  'medium',
  'high',
]);

function normalizeAttendanceStatus(value) {
  const status = String(value || 'not_recorded').toLowerCase().trim();
  return ATTENDANCE_STATUSES.has(status) ? status : 'not_recorded';
}

function normalizeParticipationLevel(value) {
  const level = String(value || 'not_recorded').toLowerCase().trim();
  return PARTICIPATION_LEVELS.has(level) ? level : 'not_recorded';
}

function labelFromSnake(value) {
  return String(value || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isValidHttpUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(String(value));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function mapClassRow(row, teacher = null, student = null) {
  const status = normalizeClassStatus(row.status);
  const join = getJoinAvailability(row);
  const attendanceStatus = normalizeAttendanceStatus(row.attendance_status);
  const participationLevel = normalizeParticipationLevel(row.participation_level);
  const recordingUrl = String(row.recording_url || '').trim();

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
    meetingProvider: row.meeting_provider || getMeetingProvider(),
    status,
    statusLabel:
      status === 'in_progress'
        ? 'In Progress'
        : status === 'scheduled'
          ? 'Scheduled'
          : status.charAt(0).toUpperCase() + status.slice(1),
    canJoin: join.canJoin,
    joinReason: join.reason,
    withinJoinWindow: join.withinWindow,
    startedAt: row.started_at || null,
    curriculumPlan: row.curriculum_plan || '',
    attendanceStatus,
    attendanceStatusLabel: labelFromSnake(attendanceStatus),
    attendanceRecordedAt: row.attendance_recorded_at || null,
    participationLevel,
    participationLevelLabel: labelFromSnake(participationLevel),
    participationNotes: row.participation_notes || '',
    recordingUrl,
    hasRecording: Boolean(recordingUrl),
    completedAt: row.completed_at || null,
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

function canJoin(classRow, now = new Date()) {
  return getJoinAvailability(classRow, now).canJoin;
}

module.exports = {
  parseTimeSlot,
  buildMeetingDetails,
  mapClassRow,
  normalizeClassStatus,
  getJoinAvailability,
  getMeetingProvider,
  canJoin,
  normalizeAttendanceStatus,
  normalizeParticipationLevel,
  isValidHttpUrl,
  ATTENDANCE_STATUSES,
  PARTICIPATION_LEVELS,
};
