const { submitFreeTrialToDolibarr, isDolibarrEnabled, getDolibarrMode } =
  require('../utils/dolibarrClient');
const { createTrialScheduleRequest } = require('../utils/trialScheduler');

const TIME_SLOTS = [
  '09:00-09:30',
  '09:30-10:00',
  '10:00-10:30',
  '10:30-11:00',
  '11:00-11:30',
  '11:30-12:00',
  '13:00-13:30',
  '13:30-14:00',
  '14:00-14:30',
  '14:30-15:00',
  '15:00-15:30',
  '15:30-16:00',
  '16:00-16:30',
  '16:30-17:00',
  '17:00-17:30',
  '17:30-18:00',
];

const PROGRAMS = [
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
      dolibarrEnabled: isDolibarrEnabled(),
      dolibarrMode: isDolibarrEnabled() ? getDolibarrMode() : null,
      durationMinutes: 30,
      programs: PROGRAMS,
      timeSlots: TIME_SLOTS,
      videoPlatforms: Object.entries(VIDEO_PLATFORMS).map(([value, label]) => ({
        value,
        label,
      })),
      message: isDolibarrEnabled()
        ? 'Free trial posts to Dolibarr and the E-Scheduler assign queue.'
        : 'Free trial posts to the E-Scheduler assign queue. Enable DOLIBARR_ENABLED to also send leads to Dolibarr.',
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
      return res.status(400).json({ message: 'Choose a valid 30-minute time slot.' });
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

    // Action 1 — Dolibarr CRM (optional when disabled)
    let dolibarr = {
      mode: null,
      thirdpartyId: null,
      ticketId: null,
      skipped: true,
      error: null,
    };

    if (isDolibarrEnabled()) {
      try {
        const result = await submitFreeTrialToDolibarr(trial);
        dolibarr = {
          mode: result.mode,
          thirdpartyId: result.thirdpartyId,
          ticketId: result.ticketId,
          skipped: false,
          error: null,
        };
      } catch (err) {
        dolibarr = {
          mode: null,
          thirdpartyId: null,
          ticketId: null,
          skipped: false,
          error: err.message || 'Dolibarr submit failed',
        };
      }
    }

    // Action 2 — E-Scheduler pending booking (date/slot + video platform)
    const schedule = await createTrialScheduleRequest(trial, {
      thirdpartyId: dolibarr.thirdpartyId,
      ticketId: dolibarr.ticketId,
    });

    const parts = ['Free trial request received.'];
    if (dolibarr.skipped) {
      parts.push('Saved to the E-Scheduler review queue (Dolibarr not enabled).');
    } else if (dolibarr.error) {
      parts.push(
        `Saved to the E-Scheduler review queue. Dolibarr sync failed: ${dolibarr.error}`,
      );
    } else if (dolibarr.mode === 'log') {
      parts.push('Posted to Dolibarr (log mode) and the E-Scheduler review queue.');
    } else {
      parts.push('Posted to Dolibarr and the E-Scheduler review queue.');
    }

    res.status(201).json({
      message: parts.join(' '),
      dolibarr,
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
