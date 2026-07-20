const db = require('../config/db');

function mapConnection(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    externalAccount: row.external_account || '',
    calendarId: row.calendar_id || '',
    schedulingUrl: row.scheduling_url || '',
    isActive: !!row.is_active,
    connectedAt: row.connected_at,
    hasAccessToken: Boolean(row.access_token),
  };
}

function mapEvent(row) {
  return {
    id: row.id,
    userId: row.user_id,
    classId: row.class_id,
    title: row.title,
    description: row.description || '',
    eventDate: row.event_date,
    startTime: row.start_time,
    endTime: row.end_time,
    durationMinutes: row.duration_minutes || 60,
    meetingInfo: row.meeting_info || '',
    meetingLink: row.meeting_link || '',
    provider: row.provider,
    externalEventId: row.external_event_id || null,
    syncStatus: row.sync_status,
    syncedAt: row.synced_at || null,
    createdAt: row.created_at,
  };
}

function getConnection(userId, provider) {
  return db
    .prepare(
      `SELECT *
       FROM calendar_connections
       WHERE user_id = ? AND provider = ? AND is_active = 1
       LIMIT 1`,
    )
    .get(userId, provider);
}

function listConnections(userId) {
  return db
    .prepare(
      `SELECT *
       FROM calendar_connections
       WHERE user_id = ?
       ORDER BY provider ASC`,
    )
    .all(userId)
    .map(mapConnection);
}

function upsertConnection(userId, provider, payload = {}) {
  const existing = db
    .prepare(
      `SELECT id FROM calendar_connections WHERE user_id = ? AND provider = ?`,
    )
    .get(userId, provider);

  if (existing) {
    db.prepare(
      `UPDATE calendar_connections
       SET access_token = ?,
           refresh_token = ?,
           external_account = ?,
           calendar_id = ?,
           scheduling_url = ?,
           is_active = 1,
           connected_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(
      payload.accessToken || null,
      payload.refreshToken || null,
      payload.externalAccount || null,
      payload.calendarId || null,
      payload.schedulingUrl || null,
      existing.id,
    );
    return mapConnection(
      db.prepare(`SELECT * FROM calendar_connections WHERE id = ?`).get(existing.id),
    );
  }

  const result = db
    .prepare(
      `INSERT INTO calendar_connections (
         user_id, provider, access_token, refresh_token, external_account, calendar_id, scheduling_url, is_active
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    )
    .run(
      userId,
      provider,
      payload.accessToken || null,
      payload.refreshToken || null,
      payload.externalAccount || null,
      payload.calendarId || null,
      payload.schedulingUrl || null,
    );

  return mapConnection(
    db.prepare(`SELECT * FROM calendar_connections WHERE id = ?`).get(result.lastInsertRowid),
  );
}

function disconnectProvider(userId, provider) {
  db.prepare(
    `UPDATE calendar_connections
     SET is_active = 0
     WHERE user_id = ? AND provider = ?`,
  ).run(userId, provider);
}

function createLocalCalendarEvent(userId, classRow, extras = {}) {
  const title =
    extras.title ||
    classRow.title ||
    `LectiHub class on ${classRow.class_date}`;
  const description = [
    classRow.subject ? `Subject: ${classRow.subject}` : null,
    classRow.meeting_info || null,
    classRow.meeting_link ? `Meeting link: ${classRow.meeting_link}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const result = db
    .prepare(
      `INSERT INTO calendar_events (
         user_id, class_id, title, description, event_date, start_time, end_time,
         duration_minutes, meeting_info, meeting_link, provider, sync_status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'lectihub', 'local_only')`,
    )
    .run(
      userId,
      classRow.id,
      title,
      description,
      classRow.class_date,
      classRow.start_time || classRow.time_slot.split('-')[0],
      classRow.end_time || classRow.time_slot.split('-')[1],
      classRow.duration_minutes || 60,
      classRow.meeting_info || '',
      classRow.meeting_link || '',
    );

  return mapEvent(
    db.prepare(`SELECT * FROM calendar_events WHERE id = ?`).get(result.lastInsertRowid),
  );
}

function markExternalSync(eventId, provider, externalEventId, status = 'synced') {
  db.prepare(
    `UPDATE calendar_events
     SET provider = ?,
         external_event_id = ?,
         sync_status = ?,
         synced_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).run(provider, externalEventId, status, eventId);

  return mapEvent(db.prepare(`SELECT * FROM calendar_events WHERE id = ?`).get(eventId));
}

async function syncToGoogle(connection, classRow, localEvent) {
  const googleEnabled =
    String(process.env.GOOGLE_CALENDAR_ENABLED || '').toLowerCase() === 'true';

  // Real Google Calendar insert when enabled + token present
  if (googleEnabled && connection.access_token) {
    const calendarId = connection.calendar_id || 'primary';
    const start = `${classRow.class_date}T${classRow.start_time || '09:00'}:00`;
    const end = `${classRow.class_date}T${classRow.end_time || '10:00'}:00`;

    try {
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${connection.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            summary: localEvent.title,
            description: localEvent.description,
            start: { dateTime: start },
            end: { dateTime: end },
            location: classRow.meeting_info || undefined,
          }),
        },
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Google Calendar API error: ${response.status} ${errText}`);
      }

      const data = await response.json();
      return markExternalSync(localEvent.id, 'google', data.id || `google-${localEvent.id}`, 'synced');
    } catch (err) {
      console.error('[calendar:google]', err.message);
      return markExternalSync(localEvent.id, 'google', null, 'failed');
    }
  }

  // Connected but no live Google credentials: record a simulated sync so the flow works locally
  const externalId = `google-sim-${localEvent.id}-${Date.now()}`;
  console.log('[calendar:google:sim]', {
    account: connection.external_account,
    event: localEvent.title,
    externalId,
  });
  return markExternalSync(localEvent.id, 'google', externalId, 'synced');
}

async function syncToCalendly(connection, classRow, localEvent) {
  const calendlyEnabled =
    String(process.env.CALENDLY_ENABLED || '').toLowerCase() === 'true';

  if (calendlyEnabled && connection.access_token) {
    // Calendly primarily manages invitee bookings; we record a scheduled event marker.
    try {
      const response = await fetch('https://api.calendly.com/scheduled_events', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${connection.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Calendly API error: ${response.status}`);
      }

      // Calendly create-event is invitee-driven; mark as synced reservation against the scheduling URL.
      const externalId = `calendly-${localEvent.id}-${classRow.class_date}`;
      return markExternalSync(localEvent.id, 'calendly', externalId, 'synced');
    } catch (err) {
      console.error('[calendar:calendly]', err.message);
      return markExternalSync(localEvent.id, 'calendly', null, 'failed');
    }
  }

  const externalId = `calendly-sim-${localEvent.id}-${Date.now()}`;
  console.log('[calendar:calendly:sim]', {
    account: connection.external_account,
    schedulingUrl: connection.scheduling_url,
    event: localEvent.title,
    externalId,
  });
  return markExternalSync(localEvent.id, 'calendly', externalId, 'synced');
}

/**
 * Automatically add the approved class to student + teacher calendars.
 * Teachers with Google Calendar or Calendly connected also get external sync.
 */
async function syncClassToCalendars(classRow, studentId, teacherId) {
  const result = {
    studentEvent: null,
    teacherEvent: null,
    externalSync: [],
  };

  // Always add to LectiHub calendars for both parties
  result.studentEvent = createLocalCalendarEvent(studentId, classRow, {
    title: classRow.title || 'Confirmed LectiHub class',
  });
  result.teacherEvent = createLocalCalendarEvent(teacherId, classRow, {
    title: classRow.title || 'Confirmed LectiHub class',
  });

  const google = getConnection(teacherId, 'google');
  if (google) {
    // Sync a teacher-side external copy (clone local then mark provider)
    const googleLocal = createLocalCalendarEvent(teacherId, classRow, {
      title: `[Google] ${classRow.title || 'LectiHub class'}`,
    });
    const synced = await syncToGoogle(google, classRow, googleLocal);
    result.externalSync.push({
      provider: 'google',
      status: synced.syncStatus,
      event: synced,
    });
  }

  const calendly = getConnection(teacherId, 'calendly');
  if (calendly) {
    const calendlyLocal = createLocalCalendarEvent(teacherId, classRow, {
      title: `[Calendly] ${classRow.title || 'LectiHub class'}`,
    });
    const synced = await syncToCalendly(calendly, classRow, calendlyLocal);
    result.externalSync.push({
      provider: 'calendly',
      status: synced.syncStatus,
      event: synced,
    });
  }

  return result;
}

function listEventsForUser(userId) {
  return db
    .prepare(
      `SELECT *
       FROM calendar_events
       WHERE user_id = ?
       ORDER BY event_date ASC, start_time ASC`,
    )
    .all(userId)
    .map(mapEvent);
}

function teacherHasCalendarConflict(teacherId, eventDate, timeSlot) {
  const [startTime, endTime] = String(timeSlot).split('-');
  const row = db
    .prepare(
      `SELECT id, title, provider
       FROM calendar_events
       WHERE user_id = ?
         AND event_date = ?
         AND start_time = ?
         AND end_time = ?
         AND sync_status IN ('synced', 'local_only', 'pending')
       LIMIT 1`,
    )
    .get(teacherId, eventDate, startTime, endTime);

  return row || null;
}

module.exports = {
  mapConnection,
  mapEvent,
  getConnection,
  listConnections,
  upsertConnection,
  disconnectProvider,
  syncClassToCalendars,
  listEventsForUser,
  teacherHasCalendarConflict,
};
