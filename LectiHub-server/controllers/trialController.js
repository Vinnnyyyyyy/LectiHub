const { createTrialScheduleRequest } = require('../utils/trialScheduler');
const { standardTimeSlotsFor } = require('../utils/availabilityHelpers');

const SLOT_MINUTES = Number(process.env.SCHEDULING_SLOT_MINUTES) === 60 ? 60 : 30;
const TIME_SLOTS = standardTimeSlotsFor(SLOT_MINUTES);

const PROGRAMS = [
  'Data Analytics',
  'English Conversation',
  'Math Tutoring',
  'Coding Basics',
  'Exam Prep',
  'Other',
];

const VIDEO_PLATFORMS = {
  zoom: 'Zoom',
  google_meet: 'Google Meet',
  digital_samba: 'Digital Samba',
  jitsi: 'Jitsi',
};

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime());
}

function getTrialConfig(req, res) {
  try {
    res.json({
      enabled: true,
      durationMinutes: SLOT_MINUTES,
      programs: PROGRAMS,
      timeSlots: TIME_SLOTS,
      videoPlatforms: Object.entries(VIDEO_PLATFORMS).map(([value, label]) => ({
        value,
        label,
      })),
      message: 'Free trial posts to the E-Scheduler assign queue.',
    });
  } catch (err) {
    res.status(500).json({ message: 'Error loading trial config', error: err.message });
  }
}

async function createFreeTrialRequest(req, res) {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const entityTypeRaw =
      typeof req.body?.entityType === 'string' ? req.body.entityType.trim().toLowerCase() : '';
    const program = typeof req.body?.program === 'string' ? req.body.program.trim() : '';
    const preferredDate =
      typeof req.body?.preferredDate === 'string' ? req.body.preferredDate.trim() : '';
    const preferredSlot =
      typeof req.body?.preferredSlot === 'string' ? req.body.preferredSlot.trim() : '';
    const videoPlatform =
      typeof req.body?.videoPlatform === 'string'
        ? req.body.videoPlatform.trim().toLowerCase()
        : '';
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';

    if (!name || name.length < 2) {
      return res.status(400).json({ message: 'Enter your name.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }

    const entityType =
      entityTypeRaw === 'company' || entityTypeRaw === 'individual' ? entityTypeRaw : null;
    if (!entityType) {
      return res.status(400).json({ message: 'Choose Company or Individual.' });
    }

    if (!PROGRAMS.includes(program)) {
      return res.status(400).json({ message: 'Choose a valid program.' });
    }
    if (!isValidDate(preferredDate)) {
      return res.status(400).json({ message: 'Choose a valid preferred date.' });
    }
    if (!TIME_SLOTS.includes(preferredSlot)) {
      return res.status(400).json({ message: 'Choose a valid time slot.' });
    }
    if (!VIDEO_PLATFORMS[videoPlatform]) {
      return res.status(400).json({
        message: 'Choose a video platform (Zoom, Google Meet, Digital Samba, or Jitsi).',
      });
    }

    const trial = {
      name: name.slice(0, 120),
      email: email.slice(0, 180).toLowerCase(),
      phone: phone ? phone.slice(0, 40) : null,
      entityType,
      companyName: entityType === 'company' ? name.slice(0, 120) : null,
      program,
      preferredDate,
      preferredSlot,
      videoPlatform,
      videoPlatformLabel: VIDEO_PLATFORMS[videoPlatform],
    };

    const schedule = await createTrialScheduleRequest(trial);

    res.status(201).json({
      message: 'Free trial request received. Saved to the E-Scheduler review queue.',
      schedule: {
        requestId: schedule.requestId,
        studentId: schedule.studentId,
      },
    });
  } catch (err) {
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    res.status(status).json({
      message: err.message || 'Could not submit free trial request',
    });
  }
}

module.exports = {
  getTrialConfig,
  createFreeTrialRequest,
  TIME_SLOTS,
  PROGRAMS,
  VIDEO_PLATFORMS,
};
