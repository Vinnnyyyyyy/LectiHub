const db = require('../config/db');

function parseDetails(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function mapNotification(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message || '',
    relatedRequestId: row.related_request_id,
    relatedClassId: row.related_class_id ?? null,
    details: parseDetails(row.details),
    deliverAt: row.deliver_at || null,
    isRead: !!row.is_read,
    createdAt: row.created_at,
  };
}

const DELIVERED_FILTER = `(deliver_at IS NULL OR deliver_at <= datetime('now'))`;

async function listMyNotifications(req, res) {
  try {
    const rows = db
      .prepare(
        `SELECT *
         FROM notifications
         WHERE user_id = ?
           AND ${DELIVERED_FILTER}
         ORDER BY created_at DESC
         LIMIT 50`,
      )
      .all(req.user.id);

    const unreadCount = db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM notifications
         WHERE user_id = ?
           AND is_read = 0
           AND ${DELIVERED_FILTER}`,
      )
      .get(req.user.id).count;

    // Upcoming scheduled reminders (not delivered yet) so the student can see what's queued
    const pendingReminders = db
      .prepare(
        `SELECT id, title, deliver_at, details, related_class_id, related_request_id, type
         FROM notifications
         WHERE user_id = ?
           AND type = 'class_reminder'
           AND deliver_at IS NOT NULL
           AND deliver_at > datetime('now')
         ORDER BY deliver_at ASC
         LIMIT 10`,
      )
      .all(req.user.id)
      .map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        deliverAt: row.deliver_at,
        relatedClassId: row.related_class_id,
        relatedRequestId: row.related_request_id,
        details: parseDetails(row.details),
      }));

    res.json({
      unreadCount,
      notifications: rows.map(mapNotification),
      pendingReminders,
    });
  } catch (err) {
    res.status(500).json({ message: 'Error loading notifications', error: err.message });
  }
}

async function markNotificationRead(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ message: 'Invalid notification id' });
    }

    const result = db
      .prepare(
        `UPDATE notifications
         SET is_read = 1
         WHERE id = ? AND user_id = ?`,
      )
      .run(id, req.user.id);

    if (!result.changes) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    res.status(500).json({ message: 'Error updating notification', error: err.message });
  }
}

async function markAllNotificationsRead(req, res) {
  try {
    db.prepare(
      `UPDATE notifications
       SET is_read = 1
       WHERE user_id = ?
         AND is_read = 0
         AND ${DELIVERED_FILTER}`,
    ).run(req.user.id);

    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ message: 'Error updating notifications', error: err.message });
  }
}

module.exports = {
  listMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};
