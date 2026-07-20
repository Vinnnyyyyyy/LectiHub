const {
  listConnections,
  upsertConnection,
  disconnectProvider,
  listEventsForUser,
} = require('../utils/calendarService');

async function getMyCalendar(req, res) {
  try {
    const events = listEventsForUser(req.user.id);
    const connections =
      req.user.role === 'teacher' ? listConnections(req.user.id) : [];

    res.json({
      events,
      connections,
      providers: {
        google: {
          available: true,
          liveSync:
            String(process.env.GOOGLE_CALENDAR_ENABLED || '').toLowerCase() ===
            'true',
        },
        calendly: {
          available: true,
          liveSync:
            String(process.env.CALENDLY_ENABLED || '').toLowerCase() === 'true',
        },
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Error loading calendar', error: err.message });
  }
}

async function connectCalendarProvider(req, res) {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ message: 'Only teachers can connect external calendars' });
    }

    const provider = String(req.body?.provider || '').toLowerCase();
    if (!['google', 'calendly'].includes(provider)) {
      return res.status(400).json({ message: 'provider must be google or calendly' });
    }

    const connection = upsertConnection(req.user.id, provider, {
      accessToken: req.body?.accessToken || null,
      refreshToken: req.body?.refreshToken || null,
      externalAccount:
        req.body?.externalAccount ||
        req.body?.email ||
        `${provider}-account-${req.user.id}`,
      calendarId: req.body?.calendarId || (provider === 'google' ? 'primary' : null),
      schedulingUrl: req.body?.schedulingUrl || null,
    });

    res.status(201).json({
      message: `${provider} calendar connected`,
      connection,
    });
  } catch (err) {
    res.status(500).json({ message: 'Error connecting calendar', error: err.message });
  }
}

async function disconnectCalendarProvider(req, res) {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ message: 'Only teachers can disconnect external calendars' });
    }

    const provider = String(req.params.provider || '').toLowerCase();
    if (!['google', 'calendly'].includes(provider)) {
      return res.status(400).json({ message: 'provider must be google or calendly' });
    }

    disconnectProvider(req.user.id, provider);
    res.json({ message: `${provider} calendar disconnected` });
  } catch (err) {
    res.status(500).json({ message: 'Error disconnecting calendar', error: err.message });
  }
}

module.exports = {
  getMyCalendar,
  connectCalendarProvider,
  disconnectCalendarProvider,
};
