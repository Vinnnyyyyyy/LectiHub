/**
 * Optional email integration.
 *
 * Enable with EMAIL_ENABLED=true in LectiHub-server/.env
 *
 * Modes:
 * - log  (default when enabled without SMTP): print emails to the server console
 * - smtp : send through SMTP using EMAIL_HOST / EMAIL_PORT / EMAIL_USER / EMAIL_PASS
 *
 * nodemailer is loaded lazily so the API can start even if `npm install`
 * has not installed optional mail dependencies yet.
 */

function isEmailEnabled() {
  return String(process.env.EMAIL_ENABLED || '').toLowerCase() === 'true';
}

function getEmailMode() {
  const mode = String(process.env.EMAIL_MODE || '').toLowerCase();
  if (mode === 'smtp' || mode === 'log') return mode;
  // If SMTP host is configured, prefer smtp; otherwise log for local/dev safety.
  return process.env.EMAIL_HOST ? 'smtp' : 'log';
}

function getFromAddress() {
  return process.env.EMAIL_FROM || 'LectiHub <noreply@lectihub.local>';
}

function loadNodemailer() {
  try {
    // Lazy require: avoid crashing server boot when node_modules is incomplete.
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    return require('nodemailer');
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND') {
      throw new Error(
        'nodemailer is not installed. Run `npm install` inside LectiHub-server to enable SMTP email.',
      );
    }
    throw err;
  }
}

let smtpTransporter = null;

function getSmtpTransporter() {
  if (smtpTransporter) return smtpTransporter;

  const host = process.env.EMAIL_HOST;
  const port = Number(process.env.EMAIL_PORT || 587);
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!host) {
    throw new Error('EMAIL_HOST is required when EMAIL_MODE=smtp');
  }

  const nodemailer = loadNodemailer();
  smtpTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass } : undefined,
  });

  return smtpTransporter;
}

async function sendEmail({ to, subject, text, html }) {
  if (!isEmailEnabled()) {
    return { sent: false, reason: 'disabled' };
  }

  if (!to) {
    return { sent: false, reason: 'missing_recipient' };
  }

  const mode = getEmailMode();
  const payload = {
    from: getFromAddress(),
    to,
    subject,
    text,
    html: html || `<pre style="font-family: sans-serif; white-space: pre-wrap;">${text}</pre>`,
  };

  if (mode === 'log') {
    console.log('[email:log]', {
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
    });
    return { sent: true, mode: 'log', to };
  }

  try {
    const info = await getSmtpTransporter().sendMail(payload);
    return {
      sent: true,
      mode: 'smtp',
      to,
      messageId: info.messageId,
    };
  } catch (err) {
    console.error('[email:error]', err.message);
    return {
      sent: false,
      mode: 'smtp',
      to,
      reason: 'send_failed',
      error: err.message,
    };
  }
}

function buildScheduleEmailBodies({ role, details }) {
  const scheduleLine = `${details.classDate} ${details.startTime} – ${details.endTime} (${details.durationMinutes} minutes)`;

  if (role === 'student') {
    const text = [
      'Your LectiHub class schedule is confirmed.',
      '',
      `Assigned teacher: ${details.teacherName}`,
      `Schedule: ${scheduleLine}`,
      `Subject: ${details.subject || 'General'}`,
      `Meeting information: ${details.meetingInfo}`,
      `Meeting link: ${details.meetingLink}`,
      '',
      'You will also receive in-app reminder notifications before class begins.',
    ].join('\n');

    return {
      subject: 'LectiHub confirmation: your class schedule',
      text,
    };
  }

  const text = [
    'A LectiHub class has been assigned to you.',
    '',
    `Assigned student: ${details.studentName}`,
    `Date and time: ${scheduleLine}`,
    `Class duration: ${details.durationMinutes} minutes`,
    `Subject: ${details.subject || 'General'}`,
    `Meeting details: ${details.meetingInfo}`,
    `Meeting link: ${details.meetingLink}`,
  ].join('\n');

  return {
    subject: 'LectiHub confirmation: new class assignment',
    text,
  };
}

async function sendScheduleConfirmationEmails({ student, teacher, details }) {
  if (!isEmailEnabled()) {
    return {
      enabled: false,
      sent: [],
    };
  }

  const results = [];

  if (student?.email) {
    const body = buildScheduleEmailBodies({ role: 'student', details });
    const result = await sendEmail({
      to: student.email,
      subject: body.subject,
      text: body.text,
    });
    results.push({ recipient: 'student', email: student.email, ...result });
  } else {
    results.push({ recipient: 'student', sent: false, reason: 'missing_email' });
  }

  if (teacher?.email) {
    const body = buildScheduleEmailBodies({ role: 'teacher', details });
    const result = await sendEmail({
      to: teacher.email,
      subject: body.subject,
      text: body.text,
    });
    results.push({ recipient: 'teacher', email: teacher.email, ...result });
  } else {
    results.push({ recipient: 'teacher', sent: false, reason: 'missing_email' });
  }

  return {
    enabled: true,
    mode: getEmailMode(),
    sent: results,
  };
}

module.exports = {
  isEmailEnabled,
  sendEmail,
  sendScheduleConfirmationEmails,
};
