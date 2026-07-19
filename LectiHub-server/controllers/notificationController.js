const db = require('../config/db');

function mapNotification(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message || '',
    relatedRequestId: row.related_request_id,
    isRead: !!row.is_read,
    createdAt: row.created_at,
  };
}

async function listMyNotifications(req, res) {
  try {
    const rows = db
      .prepare(
        `SELECT *
         FROM notifications
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 50`,
      )
      .all(req.user.id);

    const unreadCount = db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM notifications
         WHERE user_id = ? AND is_read = 0`,
      )
      .get(req.user.id).count;

    res.json({
      unreadCount,
      notifications: rows.map(mapNotification),
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
       WHERE user_id = ? AND is_read = 0`,
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
