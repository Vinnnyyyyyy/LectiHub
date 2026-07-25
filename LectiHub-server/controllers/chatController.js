const db = require('../config/db');

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name || row.username,
    email: row.email || '',
  };
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

/** True when this student/teacher pair has at least one booked class together. */
function pairIsAssigned(studentId, teacherId) {
  const row = db
    .prepare(
      `SELECT id
       FROM classes
       WHERE student_id = ?
         AND teacher_id = ?
         AND LOWER(COALESCE(status, '')) IN ('scheduled', 'in_progress', 'completed')
       LIMIT 1`,
    )
    .get(studentId, teacherId);
  return Boolean(row);
}

function resolvePairForUser(peerId, userId, role) {
  if (!Number.isInteger(peerId) || peerId < 1) return null;

  const peer = db
    .prepare(
      `SELECT id, username, full_name, email, role
       FROM users
       WHERE id = ?`,
    )
    .get(peerId);
  if (!peer) return null;

  let studentId = null;
  let teacherId = null;

  if (role === 'student') {
    if (peer.role !== 'teacher') return null;
    studentId = userId;
    teacherId = peerId;
  } else if (role === 'teacher') {
    if (peer.role !== 'student') return null;
    studentId = peerId;
    teacherId = userId;
  } else {
    return null;
  }

  if (!pairIsAssigned(studentId, teacherId)) return null;

  return {
    studentId,
    teacherId,
    peer: mapUser(peer),
  };
}

function getOrCreateConversation(studentId, teacherId) {
  let conversation = db
    .prepare(
      `SELECT * FROM conversations
       WHERE student_id = ? AND teacher_id = ?`,
    )
    .get(studentId, teacherId);

  if (!conversation) {
    const result = db
      .prepare(
        `INSERT INTO conversations (student_id, teacher_id)
         VALUES (?, ?)`,
      )
      .run(studentId, teacherId);
    conversation = db
      .prepare(`SELECT * FROM conversations WHERE id = ?`)
      .get(result.lastInsertRowid);
  }

  return conversation;
}

function listAssignedPeers(userId, role) {
  if (role === 'student') {
    return db
      .prepare(
        `SELECT DISTINCT
            t.id,
            t.username,
            t.full_name,
            t.email
         FROM classes c
         JOIN users t ON t.id = c.teacher_id
         WHERE c.student_id = ?
           AND c.teacher_id IS NOT NULL
           AND LOWER(COALESCE(c.status, '')) IN ('scheduled', 'in_progress', 'completed')
         ORDER BY LOWER(COALESCE(t.full_name, t.username)) ASC`,
      )
      .all(userId);
  }

  if (role === 'teacher') {
    return db
      .prepare(
        `SELECT DISTINCT
            s.id,
            s.username,
            s.full_name,
            s.email
         FROM classes c
         JOIN users s ON s.id = c.student_id
         WHERE c.teacher_id = ?
           AND c.student_id IS NOT NULL
           AND LOWER(COALESCE(c.status, '')) IN ('scheduled', 'in_progress', 'completed')
         ORDER BY LOWER(COALESCE(s.full_name, s.username)) ASC`,
      )
      .all(userId);
  }

  return [];
}

function listChatThreads(req, res) {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const peers = listAssignedPeers(userId, role);

    let unreadTotal = 0;
    const threads = peers.map((peerRow) => {
      const studentId = role === 'student' ? userId : peerRow.id;
      const teacherId = role === 'teacher' ? userId : peerRow.id;
      const conversation = db
        .prepare(
          `SELECT id FROM conversations
           WHERE student_id = ? AND teacher_id = ?`,
        )
        .get(studentId, teacherId);

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

      return {
        peerId: peerRow.id,
        conversationId: conversation?.id || null,
        peer: mapUser(peerRow),
        unreadCount,
        lastMessage,
      };
    });

    // Contacts with recent messages float to the top.
    threads.sort((a, b) => {
      const aTime = a.lastMessage ? Date.parse(a.lastMessage.createdAt) || 0 : 0;
      const bTime = b.lastMessage ? Date.parse(b.lastMessage.createdAt) || 0 : 0;
      if (bTime !== aTime) return bTime - aTime;
      return String(a.peer?.fullName || '').localeCompare(String(b.peer?.fullName || ''));
    });

    res.json({ threads, unreadTotal });
  } catch (err) {
    res.status(500).json({ message: 'Error loading chat contacts', error: err.message });
  }
}

function listMessagesForPeer(req, res) {
  try {
    const peerId = Number(req.params.peerId);
    const pair = resolvePairForUser(peerId, req.user.id, req.user.role);
    if (!pair) {
      return res.status(404).json({
        message: 'Chat is only available with your assigned teacher or student',
      });
    }

    const conversation = getOrCreateConversation(pair.studentId, pair.teacherId);
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

    db.prepare(
      `UPDATE messages
       SET is_read = 1
       WHERE conversation_id = ?
         AND sender_id != ?
         AND is_read = 0`,
    ).run(conversation.id, req.user.id);

    res.json({
      conversationId: conversation.id,
      peerId,
      peer: pair.peer,
      messages: rows.map((row) => mapMessage(row, req.user.id)),
    });
  } catch (err) {
    res.status(500).json({ message: 'Error loading messages', error: err.message });
  }
}

function sendMessageForPeer(req, res) {
  try {
    const peerId = Number(req.params.peerId);
    const body = String(req.body?.body || '').trim();

    if (!body) {
      return res.status(400).json({ message: 'Message cannot be empty' });
    }
    if (body.length > 2000) {
      return res.status(400).json({ message: 'Message is too long (max 2000 characters)' });
    }

    const pair = resolvePairForUser(peerId, req.user.id, req.user.role);
    if (!pair) {
      return res.status(404).json({
        message: 'Chat is only available with your assigned teacher or student',
      });
    }

    const conversation = getOrCreateConversation(pair.studentId, pair.teacherId);
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
  listMessagesForPeer,
  sendMessageForPeer,
  // Keep old names unused by routes for safety during deploys.
  listMessagesForClass: listMessagesForPeer,
  sendMessageForClass: sendMessageForPeer,
};
