const db = require('../config/db');

const CHAT_STATUSES = new Set(['scheduled', 'in_progress', 'completed']);

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name || row.username,
    email: row.email || '',
  };
}

function getBookedClassForUser(classId, userId, role) {
  const row = db
    .prepare(
      `SELECT c.*,
              s.id AS student_user_id, s.username AS student_username,
              s.full_name AS student_full_name, s.email AS student_email,
              t.id AS teacher_user_id, t.username AS teacher_username,
              t.full_name AS teacher_full_name, t.email AS teacher_email
       FROM classes c
       LEFT JOIN users s ON s.id = c.student_id
       LEFT JOIN users t ON t.id = c.teacher_id
       WHERE c.id = ?`,
    )
    .get(classId);

  if (!row) return null;
  if (!CHAT_STATUSES.has(String(row.status || '').toLowerCase())) return null;
  if (!row.student_id || !row.teacher_id) return null;

  if (role === 'student' && row.student_id !== userId) return null;
  if (role === 'teacher' && row.teacher_id !== userId) return null;
  if (role !== 'student' && role !== 'teacher' && role !== 'admin') return null;
  if (role === 'admin' && row.student_id !== userId && row.teacher_id !== userId) {
    // Admins are not part of class chat unless they are also a participant.
    return null;
  }

  return row;
}

function getOrCreateConversation(classRow) {
  let conversation = db
    .prepare(`SELECT * FROM conversations WHERE class_id = ?`)
    .get(classRow.id);

  if (!conversation) {
    const result = db
      .prepare(
        `INSERT INTO conversations (class_id, student_id, teacher_id)
         VALUES (?, ?, ?)`,
      )
      .run(classRow.id, classRow.student_id, classRow.teacher_id);
    conversation = db
      .prepare(`SELECT * FROM conversations WHERE id = ?`)
      .get(result.lastInsertRowid);
  }

  return conversation;
}

function mapMessage(row, currentUserId) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
    mine: row.sender_id === currentUserId,
    sender: mapUser({
      id: row.sender_id,
      username: row.sender_username,
      full_name: row.sender_full_name,
      email: row.sender_email,
    }),
  };
}

function formatClassLabel(row) {
  const title = row.title || row.subject || 'Class';
  const date = row.class_date || '';
  const time =
    row.start_time && row.end_time
      ? `${row.start_time}–${row.end_time}`
      : String(row.time_slot || '').replace('-', '–');
  return { title, date, time };
}

function listChatThreads(req, res) {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    let classes = [];
    if (role === 'student') {
      classes = db
        .prepare(
          `SELECT c.*,
                  s.id AS student_user_id, s.username AS student_username,
                  s.full_name AS student_full_name, s.email AS student_email,
                  t.id AS teacher_user_id, t.username AS teacher_username,
                  t.full_name AS teacher_full_name, t.email AS teacher_email
           FROM classes c
           LEFT JOIN users s ON s.id = c.student_id
           LEFT JOIN users t ON t.id = c.teacher_id
           WHERE c.student_id = ?
             AND c.teacher_id IS NOT NULL
             AND LOWER(COALESCE(c.status, '')) IN ('scheduled', 'in_progress', 'completed')
           ORDER BY c.class_date DESC, c.start_time DESC, c.id DESC`,
        )
        .all(userId);
    } else if (role === 'teacher') {
      classes = db
        .prepare(
          `SELECT c.*,
                  s.id AS student_user_id, s.username AS student_username,
                  s.full_name AS student_full_name, s.email AS student_email,
                  t.id AS teacher_user_id, t.username AS teacher_username,
                  t.full_name AS teacher_full_name, t.email AS teacher_email
           FROM classes c
           LEFT JOIN users s ON s.id = c.student_id
           LEFT JOIN users t ON t.id = c.teacher_id
           WHERE c.teacher_id = ?
             AND c.student_id IS NOT NULL
             AND LOWER(COALESCE(c.status, '')) IN ('scheduled', 'in_progress', 'completed')
           ORDER BY c.class_date DESC, c.start_time DESC, c.id DESC`,
        )
        .all(userId);
    } else {
      return res.json({ threads: [], unreadTotal: 0 });
    }

    let unreadTotal = 0;
    const threads = classes.map((row) => {
      const conversation = db
        .prepare(`SELECT id FROM conversations WHERE class_id = ?`)
        .get(row.id);

      let unreadCount = 0;
      let lastMessage = null;

      if (conversation) {
        unreadCount = db
          .prepare(
            `SELECT COUNT(*) AS count
             FROM messages
             WHERE conversation_id = ?
               AND sender_id != ?
               AND is_read = 0`,
          )
          .get(conversation.id, userId).count;

        const last = db
          .prepare(
            `SELECT m.*,
                    u.username AS sender_username,
                    u.full_name AS sender_full_name,
                    u.email AS sender_email
             FROM messages m
             JOIN users u ON u.id = m.sender_id
             WHERE m.conversation_id = ?
             ORDER BY m.id DESC
             LIMIT 1`,
          )
          .get(conversation.id);

        if (last) lastMessage = mapMessage(last, userId);
      }

      unreadTotal += unreadCount;
      const label = formatClassLabel(row);
      const peer =
        role === 'student'
          ? mapUser({
              id: row.teacher_user_id,
              username: row.teacher_username,
              full_name: row.teacher_full_name,
              email: row.teacher_email,
            })
          : mapUser({
              id: row.student_user_id,
              username: row.student_username,
              full_name: row.student_full_name,
              email: row.student_email,
            });

      return {
        classId: row.id,
        conversationId: conversation?.id || null,
        title: label.title,
        classDate: label.date,
        timeLabel: label.time,
        status: row.status,
        peer,
        unreadCount,
        lastMessage,
      };
    });

    res.json({ threads, unreadTotal });
  } catch (err) {
    res.status(500).json({ message: 'Error loading chat threads', error: err.message });
  }
}

function listMessagesForClass(req, res) {
  try {
    const classId = Number(req.params.classId);
    if (!Number.isInteger(classId) || classId < 1) {
      return res.status(400).json({ message: 'Invalid class id' });
    }

    const classRow = getBookedClassForUser(classId, req.user.id, req.user.role);
    if (!classRow) {
      return res.status(404).json({
        message: 'Chat is only available for your booked classes',
      });
    }

    const conversation = getOrCreateConversation(classRow);
    const rows = db
      .prepare(
        `SELECT m.*,
                u.username AS sender_username,
                u.full_name AS sender_full_name,
                u.email AS sender_email
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         WHERE m.conversation_id = ?
         ORDER BY m.id ASC`,
      )
      .all(conversation.id);

    // Mark peer messages as read when opening the thread.
    db.prepare(
      `UPDATE messages
       SET is_read = 1
       WHERE conversation_id = ?
         AND sender_id != ?
         AND is_read = 0`,
    ).run(conversation.id, req.user.id);

    const label = formatClassLabel(classRow);
    const peer =
      req.user.role === 'student'
        ? mapUser({
            id: classRow.teacher_user_id,
            username: classRow.teacher_username,
            full_name: classRow.teacher_full_name,
            email: classRow.teacher_email,
          })
        : mapUser({
            id: classRow.student_user_id,
            username: classRow.student_username,
            full_name: classRow.student_full_name,
            email: classRow.student_email,
          });

    res.json({
      conversationId: conversation.id,
      classId,
      title: label.title,
      classDate: label.date,
      timeLabel: label.time,
      peer,
      messages: rows.map((row) => mapMessage(row, req.user.id)),
    });
  } catch (err) {
    res.status(500).json({ message: 'Error loading messages', error: err.message });
  }
}

function sendMessageForClass(req, res) {
  try {
    const classId = Number(req.params.classId);
    const body = String(req.body?.body || '').trim();

    if (!Number.isInteger(classId) || classId < 1) {
      return res.status(400).json({ message: 'Invalid class id' });
    }
    if (!body) {
      return res.status(400).json({ message: 'Message cannot be empty' });
    }
    if (body.length > 2000) {
      return res.status(400).json({ message: 'Message is too long (max 2000 characters)' });
    }

    const classRow = getBookedClassForUser(classId, req.user.id, req.user.role);
    if (!classRow) {
      return res.status(404).json({
        message: 'Chat is only available for your booked classes',
      });
    }

    const conversation = getOrCreateConversation(classRow);
    const result = db
      .prepare(
        `INSERT INTO messages (conversation_id, sender_id, body, is_read)
         VALUES (?, ?, ?, 0)`,
      )
      .run(conversation.id, req.user.id, body);

    const row = db
      .prepare(
        `SELECT m.*,
                u.username AS sender_username,
                u.full_name AS sender_full_name,
                u.email AS sender_email
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         WHERE m.id = ?`,
      )
      .get(result.lastInsertRowid);

    res.status(201).json({
      message: 'Message sent',
      item: mapMessage(row, req.user.id),
    });
  } catch (err) {
    res.status(500).json({ message: 'Error sending message', error: err.message });
  }
}

module.exports = {
  listChatThreads,
  listMessagesForClass,
  sendMessageForClass,
};
