const db = require('../config/db');
const {
  isDolibarrEnabled,
  getDolibarrMode,
  createInvoiceForReceipt,
} = require('../utils/dolibarrClient');

const METHODS = new Set(['cash', 'card', 'transfer', 'other']);
const STATUSES = new Set(['recorded', 'confirmed', 'void']);

function mapReceipt(row) {
  if (!row) return null;
  return {
    id: row.id,
    studentId: row.student_id,
    student: {
      id: row.student_id,
      username: row.student_username || '',
      fullName: row.student_full_name || row.student_username || 'Student',
      email: row.student_email || '',
    },
    recordedById: row.recorded_by || null,
    recordedBy: row.recorder_username
      ? {
          id: row.recorded_by,
          username: row.recorder_username,
          fullName: row.recorder_full_name || row.recorder_username,
        }
      : null,
    amountCents: row.amount_cents,
    amount: Number((row.amount_cents / 100).toFixed(2)),
    currency: row.currency || 'USD',
    method: row.method,
    status: row.status,
    description: row.description || '',
    paidAt: row.paid_at,
    receiptNumber: row.receipt_number,
    dolibarrInvoiceId: row.dolibarr_invoice_id || null,
    dolibarrThirdpartyId: row.dolibarr_thirdparty_id || null,
    notes: row.notes || '',
    createdAt: row.created_at,
  };
}

function getReceiptById(id) {
  return db
    .prepare(
      `SELECT pr.*,
              s.username AS student_username,
              s.full_name AS student_full_name,
              s.email AS student_email,
              r.username AS recorder_username,
              r.full_name AS recorder_full_name
       FROM payment_receipts pr
       JOIN users s ON s.id = pr.student_id
       LEFT JOIN users r ON r.id = pr.recorded_by
       WHERE pr.id = ?`,
    )
    .get(id);
}

function nextReceiptNumber() {
  const year = new Date().getFullYear();
  const prefix = `LH-${year}-`;
  const latest = db
    .prepare(
      `SELECT receipt_number
       FROM payment_receipts
       WHERE receipt_number LIKE ?
       ORDER BY id DESC
       LIMIT 1`,
    )
    .get(`${prefix}%`);

  let seq = 1;
  if (latest?.receipt_number) {
    const part = String(latest.receipt_number).split('-').pop();
    const n = Number(part);
    if (Number.isFinite(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

function resolveDolibarrThirdpartyId(studentId) {
  const row = db
    .prepare(
      `SELECT dolibarr_thirdparty_id
       FROM schedule_requests
       WHERE student_id = ?
         AND dolibarr_thirdparty_id IS NOT NULL
         AND TRIM(dolibarr_thirdparty_id) != ''
       ORDER BY id DESC
       LIMIT 1`,
    )
    .get(studentId);
  return row?.dolibarr_thirdparty_id || null;
}

function notifyAdminsAboutReceipt(receiptId, studentName, amountLabel) {
  const admins = db.prepare(`SELECT id FROM users WHERE role = 'admin'`).all();
  for (const admin of admins) {
    db.prepare(
      `INSERT INTO notifications (
         user_id, type, title, message, related_request_id, related_class_id, details, deliver_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      admin.id,
      'payment_receipt',
      'New student payment receipt',
      `${studentName} submitted a payment receipt for ${amountLabel}.`,
      null,
      null,
      JSON.stringify({ receiptId, studentName, amountLabel }),
      null,
    );
  }
}

function parseAmountToCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (amount > 1000000) return null;
  return Math.round(amount * 100);
}

async function createPaymentReceipt(req, res) {
  try {
    const role = req.user.role;
    let studentId = req.user.id;

    if (role === 'admin') {
      studentId = Number(req.body?.studentId);
      if (!Number.isInteger(studentId) || studentId < 1) {
        return res.status(400).json({ message: 'studentId is required' });
      }
    } else if (role !== 'student') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const student = db
      .prepare(`SELECT id, username, full_name, email, role FROM users WHERE id = ?`)
      .get(studentId);
    if (!student || student.role !== 'student') {
      return res.status(400).json({ message: 'Student not found' });
    }

    const amountCents = parseAmountToCents(req.body?.amount);
    if (amountCents == null) {
      return res.status(400).json({ message: 'Enter a valid payment amount greater than 0.' });
    }

    const method = String(req.body?.method || 'other').toLowerCase().trim();
    if (!METHODS.has(method)) {
      return res.status(400).json({ message: 'Choose a valid payment method.' });
    }

    const currency = String(req.body?.currency || 'USD').trim().toUpperCase() || 'USD';
    const description =
      typeof req.body?.description === 'string' ? req.body.description.trim().slice(0, 200) : '';
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 500) : '';
    let paidAt =
      typeof req.body?.paidAt === 'string' ? req.body.paidAt.trim() : new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}/.test(paidAt)) {
      return res.status(400).json({ message: 'paidAt must be a valid date (YYYY-MM-DD).' });
    }
    paidAt = paidAt.slice(0, 10);

    const status = role === 'admin' ? 'confirmed' : 'recorded';
    const receiptNumber = nextReceiptNumber();
    const thirdpartyId = resolveDolibarrThirdpartyId(studentId);

    const insert = db
      .prepare(
        `INSERT INTO payment_receipts (
           student_id, recorded_by, amount_cents, currency, method, status,
           description, paid_at, receipt_number, dolibarr_thirdparty_id, notes
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        studentId,
        req.user.id,
        amountCents,
        currency,
        method,
        status,
        description || null,
        paidAt,
        receiptNumber,
        thirdpartyId,
        notes || null,
      );

    const receiptId = Number(insert.lastInsertRowid);
    let dolibarr = { skipped: true, invoiceId: null, error: null };

    if (isDolibarrEnabled() && getDolibarrMode() === 'api' && thirdpartyId) {
      try {
        const invoiceId = await createInvoiceForReceipt({
          thirdpartyId,
          amount: amountCents / 100,
          currency,
          receiptNumber,
          description: description || `LectiHub payment ${receiptNumber}`,
          paidAt,
        });
        if (invoiceId != null) {
          db.prepare(
            `UPDATE payment_receipts SET dolibarr_invoice_id = ? WHERE id = ?`,
          ).run(String(invoiceId), receiptId);
          dolibarr = { skipped: false, invoiceId: String(invoiceId), error: null };
        }
      } catch (err) {
        dolibarr = {
          skipped: false,
          invoiceId: null,
          error: err.message || 'Dolibarr invoice create failed',
        };
      }
    }

    if (role === 'student') {
      const studentName = student.full_name || student.username;
      const amountLabel = `${currency} ${(amountCents / 100).toFixed(2)}`;
      notifyAdminsAboutReceipt(receiptId, studentName, amountLabel);
    }

    const receipt = mapReceipt(getReceiptById(receiptId));
    res.status(201).json({
      message:
        role === 'admin'
          ? 'Payment receipt recorded for the student.'
          : 'Payment receipt submitted. An admin can confirm it in Payments.',
      receipt,
      dolibarr,
    });
  } catch (err) {
    res.status(500).json({ message: 'Error creating payment receipt', error: err.message });
  }
}

async function listPaymentReceipts(req, res) {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const studentId = req.query.studentId != null ? Number(req.query.studentId) : null;

    let sql = `
      SELECT pr.*,
             s.username AS student_username,
             s.full_name AS student_full_name,
             s.email AS student_email,
             r.username AS recorder_username,
             r.full_name AS recorder_full_name
      FROM payment_receipts pr
      JOIN users s ON s.id = pr.student_id
      LEFT JOIN users r ON r.id = pr.recorded_by
      WHERE 1 = 1
    `;
    const params = [];

    if (status && STATUSES.has(status)) {
      sql += ` AND pr.status = ?`;
      params.push(status);
    }
    if (Number.isInteger(studentId) && studentId > 0) {
      sql += ` AND pr.student_id = ?`;
      params.push(studentId);
    }

    sql += ` ORDER BY pr.paid_at DESC, pr.id DESC`;

    const rows = db.prepare(sql).all(...params).map(mapReceipt);
    res.json({ receipts: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ message: 'Error listing payment receipts', error: err.message });
  }
}

async function listMyPaymentReceipts(req, res) {
  try {
    const rows = db
      .prepare(
        `SELECT pr.*,
                s.username AS student_username,
                s.full_name AS student_full_name,
                s.email AS student_email,
                r.username AS recorder_username,
                r.full_name AS recorder_full_name
         FROM payment_receipts pr
         JOIN users s ON s.id = pr.student_id
         LEFT JOIN users r ON r.id = pr.recorded_by
         WHERE pr.student_id = ?
         ORDER BY pr.paid_at DESC, pr.id DESC`,
      )
      .all(req.user.id)
      .map(mapReceipt);

    res.json({ receipts: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ message: 'Error listing your payment receipts', error: err.message });
  }
}

async function getPaymentReceipt(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ message: 'Invalid receipt id' });
    }

    const row = getReceiptById(id);
    if (!row) return res.status(404).json({ message: 'Payment receipt not found' });

    if (req.user.role !== 'admin' && row.student_id !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ receipt: mapReceipt(row) });
  } catch (err) {
    res.status(500).json({ message: 'Error loading payment receipt', error: err.message });
  }
}

async function updatePaymentReceiptStatus(req, res) {
  try {
    const id = Number(req.params.id);
    const status = String(req.body?.status || '').toLowerCase().trim();

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ message: 'Invalid receipt id' });
    }
    if (!STATUSES.has(status)) {
      return res.status(400).json({ message: 'status must be recorded, confirmed, or void' });
    }

    const existing = getReceiptById(id);
    if (!existing) return res.status(404).json({ message: 'Payment receipt not found' });

    db.prepare(`UPDATE payment_receipts SET status = ? WHERE id = ?`).run(status, id);
    const receipt = mapReceipt(getReceiptById(id));
    res.json({ message: `Receipt marked as ${status}.`, receipt });
  } catch (err) {
    res.status(500).json({ message: 'Error updating payment receipt', error: err.message });
  }
}

module.exports = {
  createPaymentReceipt,
  listPaymentReceipts,
  listMyPaymentReceipts,
  getPaymentReceipt,
  updatePaymentReceiptStatus,
};
